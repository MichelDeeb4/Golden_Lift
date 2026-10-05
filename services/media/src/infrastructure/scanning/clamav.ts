import net from 'node:net';
import { once } from 'node:events';
import { ApplicationError } from '@golden-lift/contracts';
import type { SecurityPrerequisites } from '../../application/ports/processing.js';

export class ClamAvScanner implements SecurityPrerequisites {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 120000,
  ) {}
  private async command(
    command: string,
    body?: AsyncIterable<Uint8Array>,
    signal?: AbortSignal,
  ): Promise<string> {
    const socket = net.createConnection({ host: this.host, port: this.port });
    let result = '',
      size = 0;
    const response = new Promise<string>((resolve, reject) => {
      socket.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 4096) {
          socket.destroy();
          reject(new Error('Scanner response exceeded its bound.'));
          return;
        }
        result += chunk.toString('utf8');
        if (result.includes('\0') || result.includes('\n'))
          resolve(result.replace(/[\0\r\n]/g, ''));
      });
      socket.once('error', reject);
      socket.once('end', () => {
        if (!result.includes('\0') && !result.includes('\n'))
          reject(new Error('Truncated scanner response.'));
      });
    });
    // Attach rejection handling before streaming to avoid an unhandled connection failure.
    void response.catch(() => undefined);
    const abort = () => socket.destroy(new Error('Scan aborted.'));
    signal?.addEventListener('abort', abort, { once: true });
    socket.setTimeout(this.timeoutMs, abort);
    try {
      await once(socket, 'connect');
      if (signal?.aborted) throw new Error('Scan aborted.');
      socket.write('z' + command + '\0');
      if (body) {
        for await (const chunk of body) {
          const prefix = Buffer.alloc(4);
          prefix.writeUInt32BE(chunk.length);
          if (!socket.write(prefix)) await once(socket, 'drain');
          if (!socket.write(chunk)) await once(socket, 'drain');
        }
        socket.write(Buffer.alloc(4));
      }
      return await response;
    } catch {
      throw new ApplicationError(
        'DEPENDENCY_UNAVAILABLE',
        'Mandatory malware scanner is unavailable.',
      );
    } finally {
      signal?.removeEventListener('abort', abort);
      socket.destroy();
    }
  }
  async ready() {
    try {
      return (await this.command('PING')) === 'PONG';
    } catch {
      return false;
    }
  }
  async scan(body: AsyncIterable<Uint8Array>, signal: AbortSignal): Promise<string> {
    const version = await this.command('VERSION', undefined, signal);
    const result = await this.command('INSTREAM', body, signal);
    if (result.endsWith(' FOUND')) throw new ApplicationError('FORBIDDEN', 'MALWARE_DETECTED');
    if (result !== 'stream: OK')
      throw new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Mandatory scan did not complete.');
    return version.slice(0, 256);
  }
}
