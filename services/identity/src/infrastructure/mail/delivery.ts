import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type {
  ActionDelivery,
  ActionMessage,
  DeliveryStatus,
} from '../../application/ports/identity.js';
import type { MailConfig } from '../config.js';
export interface MailSender {
  send(message: ActionMessage): Promise<void>;
}
export function actionMail(
  message: ActionMessage,
  config: Pick<MailConfig, 'staffAppUrl' | 'sender'>,
): { from: { address: string }; to: { address: string }; subject: string; text: string } {
  const url = new URL(
    message.purpose === 'INVITATION' ? 'invitation' : 'password-reset',
    config.staffAppUrl,
  );
  url.hash = 'token=' + message.token;
  return {
    from: { address: config.sender },
    to: { address: message.email },
    subject:
      message.purpose === 'INVITATION'
        ? 'Golden Lift staff invitation'
        : 'Golden Lift password reset',
    text:
      'Use this single-use link to ' +
      (message.purpose === 'INVITATION'
        ? 'activate your Admin account'
        : 'reset your staff password') +
      ':\n' +
      url.href +
      '\nIf several links were requested, use the newest one. If you did not request this, ignore this email.',
  };
}
export class LocalMailbox implements MailSender {
  constructor(private readonly config: MailConfig) {}
  async send(message: ActionMessage): Promise<void> {
    await fs.mkdir(this.config.directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(
      path.join(this.config.directory, randomUUID() + '.json'),
      JSON.stringify(actionMail(message, this.config), null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  }
}
export class SmtpSender implements MailSender {
  private readonly transport: Transporter;
  constructor(private readonly config: MailConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTls,
      tls: { rejectUnauthorized: true },
      ...(config.user && config.password
        ? { auth: { user: config.user, pass: config.password } }
        : {}),
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      dnsTimeout: 5000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
  async send(message: ActionMessage): Promise<void> {
    const result = await this.transport.sendMail(actionMail(message, this.config));
    if (!result.accepted?.length || result.rejected?.length)
      throw new Error('Mail delivery rejected.');
  }
}
export class DeliveryCoordinator implements ActionDelivery {
  private readonly pending = new Set<Promise<DeliveryStatus>>();
  constructor(
    private readonly sender: MailSender,
    private readonly maxPending = 100,
  ) {}
  deliver(message: ActionMessage): Promise<DeliveryStatus> {
    if (this.pending.size >= this.maxPending) {
      console.error(JSON.stringify({ event: 'identity.mail.capacity' }));
      return Promise.resolve('FAILED');
    }
    const job = this.sender
      .send(message)
      .then<DeliveryStatus>(() => 'SENT')
      .catch(() => {
        console.error(JSON.stringify({ event: 'identity.mail.failed' }));
        return 'FAILED' as const;
      });
    this.pending.add(job);
    void job.finally(() => this.pending.delete(job));
    return job;
  }
  schedule(message: ActionMessage): void {
    void this.deliver(message);
  }
  async drain(): Promise<void> {
    await Promise.all([...this.pending]);
  }
}
