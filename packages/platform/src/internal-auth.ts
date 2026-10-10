import { timingSafeEqual } from 'node:crypto';
import { ApplicationError } from '@business-platform/contracts';

export function requireInternalToken(
  authorization: string | undefined,
  credential: string | undefined,
): void {
  if (
    !credential ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(credential) ||
    !authorization?.startsWith('Bearer ')
  )
    throw new ApplicationError('UNAUTHENTICATED', 'Internal authentication is required.');
  const supplied = Buffer.from(authorization.slice(7)),
    expected = Buffer.from(credential);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    throw new ApplicationError('UNAUTHENTICATED', 'Internal authentication is required.');
}
