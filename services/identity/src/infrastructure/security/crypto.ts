import { argon2, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApplicationError } from '@business-platform/contracts';
import type { PasswordHasher, SecurityTokens } from '../../application/ports/identity.js';
export class OpaqueTokens implements SecurityTokens {
  constructor(private readonly csrfSecret: string) {}
  newToken(): string {
    return randomBytes(32).toString('base64url');
  }
  digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  csrf(token: string): string {
    return createHmac('sha256', this.csrfSecret)
      .update('staff-csrf:v1:' + token)
      .digest('base64url');
  }
  verifyCsrf(token: string, provided: string | null): boolean {
    if (!provided || !/^[A-Za-z0-9_-]{43}$/.test(provided)) return false;
    const left = Buffer.from(this.csrf(token), 'base64url'),
      right = Buffer.from(provided, 'base64url');
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
export class NodeArgon2 implements PasswordHasher {
  private active = 0;
  private dummy = '';
  constructor(private readonly maxConcurrent = 4) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 16)
      throw new Error('Password concurrency must be between 1 and 16.');
  }
  static async create(maxConcurrent = 4): Promise<NodeArgon2> {
    const instance = new NodeArgon2(maxConcurrent);
    instance.dummy = await instance.hash(randomBytes(32).toString('hex'));
    return instance;
  }
  private async derive(
    password: string,
    salt: Buffer,
    memory: number,
    passes: number,
  ): Promise<Buffer> {
    if (this.active >= this.maxConcurrent)
      throw new ApplicationError(
        'DEPENDENCY_UNAVAILABLE',
        'Password service is busy; retry shortly.',
      );
    this.active++;
    try {
      return await new Promise<Buffer>((resolve, reject) =>
        argon2(
          'argon2id',
          { message: password, nonce: salt, parallelism: 1, tagLength: 32, memory, passes },
          (error, key) => (error ? reject(error) : resolve(key)),
        ),
      );
    } finally {
      this.active--;
    }
  }
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16),
      key = await this.derive(password, salt, 19456, 2);
    return (
      '$argon2id$v=19$m=19456,t=2,p=1$' +
      salt.toString('base64').replace(/=+$/, '') +
      '$' +
      key.toString('base64').replace(/=+$/, '')
    );
  }
  async verify(password: string, hash: string | null): Promise<boolean> {
    const match = (hash ?? '').match(
      /^\$argon2id\$v=19\$m=([0-9]+),t=([0-9]+),p=1\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/,
    );
    if (
      !match ||
      Number(match[1]) < 19456 ||
      Number(match[1]) > 65536 ||
      Number(match[2]) < 2 ||
      Number(match[2]) > 5
    ) {
      if (this.dummy) await this.verify(password, this.dummy);
      return false;
    }
    const salt = Buffer.from(match[3] ?? '', 'base64'),
      expected = Buffer.from(match[4] ?? '', 'base64');
    const actual = await this.derive(password, salt, Number(match[1]), Number(match[2]));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
