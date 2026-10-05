import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { ApplicationError } from '@golden-lift/contracts';

/** Argument arrays only. POSIX process groups / Windows taskkill terminate the complete child tree. */
export function run(
  executable: string,
  args: readonly string[],
  options: {
    cwd: string;
    timeoutMs: number;
    signal?: AbortSignal;
    maxOutput?: number;
    captureStderr?: boolean;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    let command = executable,
      arguments_ = [...args];
    if (process.env['NODE_ENV'] === 'production') {
      if (process.platform !== 'linux' || process.env['MEDIA_PROCESS_SANDBOX'] !== 'bwrap') {
        reject(
          new ApplicationError(
            'DEPENDENCY_UNAVAILABLE',
            'Production native processors require the Linux sandbox profile.',
          ),
        );
        return;
      }
      const workspace = process.cwd();
      const mounts = [
        '/usr',
        '/bin',
        '/lib',
        '/lib64',
        '/opt',
        '/etc/fonts',
        '/etc/ld.so.cache',
        path.join(workspace, 'node_modules'),
        path.join(workspace, 'services/media/dist'),
        path.join(workspace, 'services/media/package.json'),
      ]
        .filter((location) => existsSync(location))
        .flatMap((location) => ['--ro-bind', location, location]);
      command = '/usr/bin/bwrap';
      arguments_ = [
        '--unshare-all',
        '--die-with-parent',
        '--new-session',
        '--proc',
        '/proc',
        '--dev',
        '/dev',
        '--tmpfs',
        '/tmp',
        ...mounts,
        '--bind',
        options.cwd,
        options.cwd,
        '--chdir',
        options.cwd,
        '--',
        executable,
        ...args,
      ];
    }
    const child = spawn(command, arguments_, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env['PATH'] ?? '',
        SystemRoot: process.env['SystemRoot'] ?? '',
        TEMP: options.cwd,
        TMP: options.cwd,
        HOME: options.cwd,
        LANG: 'C',
        LC_ALL: 'C',
        OMP_NUM_THREADS: '1',
        VIPS_CONCURRENCY: '1',
      },
    });
    let stdout = '',
      output = 0,
      ended = false,
      violation = false;
    const stop = () => {
      violation = true;
      if (!child.pid) return;
      if (process.platform === 'win32') {
        const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
          shell: false,
        });
        killer.on('error', () => child.kill());
        killer.once('close', (code) => {
          if (code !== 0) child.kill();
        });
      } else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    };
    const timer = setTimeout(stop, options.timeoutMs);
    options.signal?.addEventListener('abort', stop, { once: true });
    if (options.signal?.aborted) stop();
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', stop);
    };
    child.stdout.on('data', (data: Buffer) => {
      output += data.length;
      if (output > (options.maxOutput ?? 1048576)) stop();
      else stdout += data.toString('utf8');
    });
    child.stderr.on('data', (data: Buffer) => {
      output += data.length;
      if (output > (options.maxOutput ?? 1048576)) stop();
      else if (options.captureStderr) stdout += data.toString('utf8');
    });
    child.once('error', () => {
      ended = true;
      cleanup();
      reject(new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Required processor is unavailable.'));
    });
    child.once('close', (code) => {
      if (ended) return;
      ended = true;
      cleanup();
      if (violation)
        reject(new ApplicationError('VALIDATION_FAILED', 'Processor resource limit exceeded.'));
      else if (code !== 0)
        reject(new ApplicationError('VALIDATION_FAILED', 'Media inspection or processing failed.'));
      else resolve(stdout);
    });
  });
}
