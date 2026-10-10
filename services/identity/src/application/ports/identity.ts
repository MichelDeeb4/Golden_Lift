import type {
  AuthenticatedActor,
  EventEnvelope,
  Role,
  StaffSessionDto,
  Uuid,
  Version,
} from '@business-platform/contracts';
import type { StaffAccount } from '../../domain/staff.js';
export type TokenPurpose = 'INVITATION' | 'PASSWORD_RESET';
export type DeliveryStatus = 'SENT' | 'FAILED';
export interface ActionMessage {
  readonly purpose: TokenPurpose;
  readonly email: string;
  readonly token: string;
}
export interface ActionDelivery {
  deliver(message: ActionMessage): Promise<DeliveryStatus>;
  schedule(message: ActionMessage): void;
}
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string | null): Promise<boolean>;
}
export interface SecurityTokens {
  newToken(): string;
  digest(token: string): string;
  csrf(token: string): string;
  verifyCsrf(token: string, csrf: string | null): boolean;
}
export interface Ids {
  uuid(): Uuid;
}
export interface Clock {
  now(): string;
}
export interface IdentityPolicy {
  readonly sessionSeconds: number;
  readonly invitationSeconds: number;
  readonly resetSeconds: number;
}
export interface SessionRecord {
  readonly account: StaffAccount;
  readonly expiresAt: string;
}
export interface DirectoryCursor {
  readonly createdAt: string;
  readonly id: Uuid;
}
export interface AccountChange {
  readonly email: string;
  readonly displayName: string;
  readonly status: 'INVITED' | 'ACTIVE' | 'DISABLED';
  readonly deleted: boolean;
}
export interface IdentityRepository {
  findByEmail(email: string): Promise<StaffAccount | null>;
  findAccount(id: Uuid, lock?: boolean): Promise<StaffAccount | null>;
  listAdmins(limit: number, after: DirectoryCursor | null): Promise<readonly StaffAccount[]>;
  countAdmins(): Promise<number>;
  insertAccount(
    id: Uuid,
    email: string,
    name: string,
    role: Role,
    passwordHash: string | null,
  ): Promise<StaffAccount>;
  bootstrapLock(): Promise<void>;
  hasSuperAdmin(): Promise<boolean>;
  changeAccount(id: Uuid, expectedVersion: Version, change: AccountChange): Promise<StaffAccount>;
  touchAccount(id: Uuid, expectedVersion: Version): Promise<StaffAccount>;
  setPassword(id: Uuid, hash: string, activate: boolean): Promise<StaffAccount>;
  createSession(id: Uuid, account: StaffAccount, digest: string, expiresAt: string): Promise<void>;
  session(digest: string): Promise<SessionRecord | null>;
  revokeSession(digest: string): Promise<void>;
  findToken(digest: string, purpose: TokenPurpose): Promise<Uuid | null>;
  issueToken(
    id: Uuid,
    accountId: Uuid,
    purpose: TokenPurpose,
    digest: string,
    expiresAt: string,
  ): Promise<void>;
  consumeToken(digest: string, purpose: TokenPurpose, accountId: Uuid): Promise<boolean>;
  appendEvent(event: EventEnvelope): Promise<void>;
}
export interface IdentityUnitOfWork {
  execute<T>(
    work: (repository: IdentityRepository) => Promise<T>,
    consistentSnapshot?: boolean,
  ): Promise<T>;
}
export interface LoginResult {
  readonly token: string;
  readonly session: StaffSessionDto;
}
export interface PrincipalResult {
  readonly actor: AuthenticatedActor;
  readonly session: StaffSessionDto;
}

// Read dependencies expose only the capabilities each workflow needs.
export type StaffAuthenticationReader = Pick<
  IdentityRepository,
  'findByEmail' | 'findAccount' | 'session'
>;
export type AdminDirectoryReader = Pick<IdentityRepository, 'findAccount' | 'listAdmins'>;
export type ActionTokenReader = Pick<IdentityRepository, 'findByEmail' | 'findToken'>;
