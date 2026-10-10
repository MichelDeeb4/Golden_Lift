import { timingSafeEqual } from 'node:crypto';
import type { IdentitySecurityConfig } from '@business-platform/platform';
export class ServiceCredentials {
  constructor(private readonly config: IdentitySecurityConfig) {}
  verify(caller: unknown, authorization: unknown): boolean {
    if (
      typeof caller !== 'string' ||
      !['catalog', 'media', 'inquiries'].includes(caller) ||
      typeof authorization !== 'string'
    )
      return false;
    const received = authorization.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1],
      expected = this.config.callers[caller as keyof IdentitySecurityConfig['callers']];
    if (!received) return false;
    const left = Buffer.from(received),
      right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
