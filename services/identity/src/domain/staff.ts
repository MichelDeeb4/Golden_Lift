import { ApplicationError } from '@golden-lift/contracts';
import type {
  AuthenticatedActor,
  Role,
  StaffAccountDto,
  StaffStatus,
  Uuid,
  Version,
} from '@golden-lift/contracts';
export interface StaffAccount {
  readonly id: Uuid;
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
  readonly status: StaffStatus;
  readonly passwordHash: string | null;
  readonly authVersion: Version;
  readonly version: Version;
  readonly createdAt: string;
}
export function accountDto(account: StaffAccount): StaffAccountDto {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    status: account.status,
    version: account.version,
    createdAt: account.createdAt,
  };
}
export function emailAddress(value: unknown): string {
  if (typeof value !== 'string')
    throw new ApplicationError('VALIDATION_FAILED', 'A valid email address is required.');
  const email = value.trim().toLowerCase(),
    parts = email.split('@');
  if (
    email.length > 254 ||
    !/^[a-z0-9._+%-]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(email) ||
    !parts[0] ||
    parts[0].length > 64 ||
    !parts[1] ||
    parts[1]
      .split('.')
      .some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))
  )
    throw new ApplicationError('VALIDATION_FAILED', 'A valid email address is required.');
  return email;
}
export function displayName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    Array.from(value.trim()).length > 150 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Display name must contain 1 to 150 characters.',
    );
  return value.trim();
}
export function newPassword(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    Array.from(value).length < 15 ||
    Array.from(value).length > 128
  )
    throw new ApplicationError('VALIDATION_FAILED', 'Password must contain 15 to 128 characters.');
  return value;
}
export function requireSuperAdmin(actor: AuthenticatedActor): void {
  if (actor.role !== 'SUPER_ADMIN')
    throw new ApplicationError('FORBIDDEN', 'Admin-account management requires Super Admin.');
}
export function requireAdminTarget(account: StaffAccount): void {
  if (account.role !== 'ADMIN')
    throw new ApplicationError('FORBIDDEN', 'Only Admin accounts can be managed.');
}
