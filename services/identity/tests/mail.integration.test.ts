import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DeliveryCoordinator,
  LocalMailbox,
  SmtpSender,
} from '../src/infrastructure/mail/delivery.js';
import type { MailConfig } from '../src/infrastructure/config.js';
const message = {
  purpose: 'PASSWORD_RESET' as const,
  email: 'synthetic@example.test',
  token: 't'.repeat(43),
};
async function smtp() {
  const clients = new Set<net.Socket>(),
    messages: string[] = [];
  let rejectRecipient = false;
  const server = net.createServer((socket) => {
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => {});
    socket.setEncoding('utf8');
    socket.write('220 local.test ESMTP\r\n');
    let pending = '',
      data = false,
      body = '';
    socket.on('data', (chunk: string) => {
      pending += chunk;
      let end: number;
      while ((end = pending.indexOf('\r\n')) >= 0) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        if (data) {
          if (line === '.') {
            messages.push(body);
            body = '';
            data = false;
            socket.write('250 accepted\r\n');
          } else body += line + '\r\n';
          continue;
        }
        if (/^EHLO/.test(line)) socket.write('250-local.test\r\n250 8BITMIME\r\n');
        else if (/^HELO/.test(line)) socket.write('250 local.test\r\n');
        else if (/^MAIL FROM:/.test(line)) socket.write('250 sender\r\n');
        else if (/^RCPT TO:/.test(line))
          socket.write(rejectRecipient ? '550 rejected\r\n' : '250 recipient\r\n');
        else if (line === 'DATA') {
          data = true;
          socket.write('354 end with dot\r\n');
        } else if (line === 'STARTTLS') socket.write('502 STARTTLS unsupported\r\n');
        else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing SMTP address.');
  return {
    port: address.port,
    messages,
    reject: () => {
      rejectRecipient = true;
    },
    close: async () => {
      for (const socket of clients) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
function config(port: number): MailConfig {
  return {
    mode: 'smtp',
    directory: 'unused',
    staffAppUrl: 'http://staff.local/',
    sender: 'sender@example.test',
    host: '127.0.0.1',
    port,
    secure: false,
    requireTls: false,
    user: undefined,
    password: undefined,
  };
}
test('SMTP adapter sends a single-use fragment link and reports recipient rejection safely', async () => {
  const server = await smtp();
  try {
    const sender = new SmtpSender(config(server.port));
    await sender.send(message);
    assert.equal(server.messages.length, 1);
    const decoded = (server.messages[0] ?? '')
      .replace(/=\r\n/g, '')
      .replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    assert.ok(decoded.includes('http://staff.local/password-reset#token=' + message.token));
    assert.ok(decoded.includes('To: synthetic@example.test'));
    server.reject();
    const coordinator = new DeliveryCoordinator(sender);
    assert.equal(await coordinator.deliver(message), 'FAILED');
    await coordinator.drain();
    assert.equal(server.messages.length, 1);
  } finally {
    await server.close();
  }
});
test('SMTP TLS requirement rejects a server that cannot negotiate STARTTLS', async () => {
  const server = await smtp();
  try {
    await assert.rejects(
      new SmtpSender({ ...config(server.port), requireTls: true }).send(message),
    );
    assert.equal(server.messages.length, 0);
  } finally {
    await server.close();
  }
});
test('local mailbox stores links in private message files rather than operational output', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'business-platform-mail-test-'));
  try {
    await new LocalMailbox({ ...config(25), mode: 'local', directory }).send(message);
    const files = await fs.readdir(directory);
    assert.equal(files.length, 1);
    const mail = JSON.parse(await fs.readFile(path.join(directory, files[0] ?? ''), 'utf8')) as {
      text: string;
      to: { address: string };
    };
    assert.equal(mail.to.address, message.email);
    const link = new URL(mail.text.split('\n')[1] ?? '');
    assert.equal(link.search, '');
    assert.equal(link.hash, '#token=' + message.token);
  } finally {
    for (const entry of await fs.readdir(directory)) await fs.unlink(path.join(directory, entry));
    await fs.rmdir(directory);
  }
});
