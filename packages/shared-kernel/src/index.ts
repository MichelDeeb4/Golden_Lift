export type TenantId = string & { readonly __tenant: unique symbol };
export type CompanyId = string & { readonly __company: unique symbol };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function tenantId(value: string): TenantId {
  if (!uuid.test(value)) throw new Error('Invalid tenant identifier');
  return value as TenantId;
}
export function companyId(value: string): CompanyId {
  if (!uuid.test(value)) throw new Error('Invalid company identifier');
  return value as CompanyId;
}
