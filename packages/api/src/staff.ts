import { z } from 'zod';
import { apiOrigin } from './origin';
const id = z.string().uuid(),
  version = z.string().regex(/^[1-9][0-9]{0,18}$/),
  locale = z.enum(['ar', 'en', 'ckb']);
export const staffAccountSchema = z.object({
  id,
  email: z.string().email(),
  displayName: z.string(),
  role: z.enum(['ADMIN', 'SUPER_ADMIN']),
  status: z.enum(['ACTIVE', 'INVITED', 'DISABLED']),
  version,
  createdAt: z.string(),
});
export const staffSessionSchema = z.object({
  account: staffAccountSchema,
  expiresAt: z.string().datetime(),
  csrfToken: z.string().min(1),
});
export type StaffSession = z.infer<typeof staffSessionSchema>;
export const translationSchema = z.object({
  locale,
  name: z.string(),
  description: z.string().nullable(),
});
export const namedSchema = z.object({
  id,
  code: z.string(),
  version,
  translations: z.array(translationSchema),
  deprecated: z.boolean().optional(),
  schemaRevision: version.optional(),
});
export const categorySchema = z.object({
  id,
  parentId: id.nullable(),
  name: z.string(),
  description: z.string().nullable(),
  slug: z.string().nullable(),
  locale,
  resolvedNameLocale: locale,
  sortOrder: z.string(),
  version,
  translations: z.array(translationSchema.extend({ slug: z.string().nullable(), version })),
  coverAssetId: id.nullable(),
  activeChildCount: z.string(),
  activeProductCount: z.string(),
  canAddProducts: z.boolean(),
  canAddChildren: z.boolean(),
});
export const categoryPageSchema = z.object({
  parentId: id.nullable(),
  listRevision: z.string(),
  items: z.array(
    categorySchema.extend({
      childCount: z.string().optional(),
      productCount: z.string().optional(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
export const fieldSchema = z.object({
  definitionId: id,
  assignmentId: id,
  code: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  kind: z.enum(['NUMBER', 'BOOLEAN', 'TEXT', 'CHOICE']),
  control: z.string(),
  required: z.boolean(),
  groupPlacementId: id.nullable(),
  groupPlacementIds: z.array(id).optional(),
  sortOrder: z.string(),
  unit: z.object({ code: z.string(), symbol: z.string(), label: z.string() }).nullable(),
  minimum: z.string().nullable(),
  maximum: z.string().nullable(),
  allowMultiple: z.boolean(),
  textMaxLength: z.number(),
  deprecated: z.boolean(),
  options: z.array(z.object({ id, label: z.string(), deprecated: z.boolean() })),
});
export const categoryFormSchema = z.object({
  nonApplicableValues: z.array(z.object({ definitionId: id, label: z.string() })).optional(),
  categoryId: id,
  schemaRevision: version,
  groups: z.array(z.object({ id, label: z.string(), sortOrder: z.string() })),
  fields: z.array(fieldSchema),
});
export const attributeValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('NUMBER'), number: z.string() }),
  z.object({ kind: z.literal('BOOLEAN'), boolean: z.boolean() }),
  z.object({
    kind: z.literal('TEXT'),
    translations: z.array(z.object({ locale, text: z.string() })),
  }),
  z.object({ kind: z.literal('CHOICE'), optionIds: z.array(id) }),
]);
export const productMediaSchema = z.object({
  id,
  assetId: id,
  kind: z.enum(['IMAGE', 'VIDEO', 'PDF']),
  sortOrder: z.string(),
  blocked: z.boolean(),
  translations: z.array(
    z.object({
      locale,
      title: z.string().nullable(),
      caption: z.string().nullable(),
      altText: z.string().nullable(),
    }),
  ),
});
export const managedProductSchema = z.object({
  id,
  categoryId: id,
  coverAssetId: id.nullable(),
  modelCode: z.string().nullable(),
  version,
  schemaRevision: version,
  translations: z.array(translationSchema),
  values: z.array(z.object({ definitionId: id, value: attributeValueSchema })),
  active: z.boolean(),
  featured: z.boolean(),
  sortOrder: z.string(),
  featuredOrder: z.string(),
  updatedAt: z.string(),
  media: z.array(productMediaSchema),
});
export const productRowSchema = z.object({
  id,
  name: z.string(),
  modelCode: z.string().nullable(),
  categoryId: id,
  categoryName: z.string(),
  coverAssetId: id.nullable(),
  active: z.boolean(),
  featured: z.boolean(),
  version,
  sortOrder: z.string(),
  updatedAt: z.string(),
});
export const mediaAssetSchema = z.object({
  id,
  kind: z.enum(['IMAGE', 'VIDEO', 'PDF']),
  status: z.string(),
  security: z.string(),
  version,
  deleted: z.boolean(),
  name: z.string().optional(),
  purpose: z.enum(['CATALOG', 'TECHNICAL_SOURCE']).nullable(),
  updatedAt: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  duration: z.string().nullable(),
  byteSize: z.string().nullable(),
  failureCode: z.string().nullable(),
  variants: z.array(
    z.object({
      profile: z.string(),
      mime: z.string(),
      bytes: z.string(),
      width: z.number().nullable(),
      height: z.number().nullable(),
      duration: z.string().nullable(),
    }),
  ),
});
export const uploadSchema = z.object({
  id,
  assetId: id,
  status: z.string(),
  expiresAt: z.string(),
  version,
  bytes: z.string(),
  parts: z.array(z.object({ number: z.number(), bytes: z.string(), sha256: z.string() })),
  upload: z.object({
    method: z.literal('POST'),
    url: z.string().url(),
    headers: z.record(z.string()),
    credentials: z.literal('include'),
    csrfHeader: z.literal('x-csrf-token'),
    partBytes: z.number().int().positive(),
    partCount: z.number().int().positive(),
  }),
});
export const pageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    totalItems: z.number().int().nonnegative().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().optional(),
  });
export class StaffApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly requestId: string | null = null,
    readonly validationMessage: string | null = null,
  ) {
    super(code);
    this.name = 'StaffApiError';
  }
}
export class StaffApiClient {
  readonly origin: string;
  private csrf: string | null = null;
  private readonly mediaOrigin: string;
  constructor(
    origin: string,
    private readonly invalidated: () => void = () => {},
    mediaOrigin = 'http://localhost:3003',
  ) {
    this.origin = apiOrigin(origin);
    this.mediaOrigin = apiOrigin(mediaOrigin);
  }
  clearSession() {
    this.csrf = null;
  }
  async session(signal?: AbortSignal) {
    const result = await this.request(
      '/auth/session',
      staffSessionSchema,
      undefined,
      'GET',
      signal,
    );
    this.csrf = result.csrfToken;
    return result;
  }
  async login(email: string, password: string) {
    const result = await this.request(
      '/auth/login',
      staffSessionSchema,
      { email, password },
      'POST',
    );
    this.csrf = result.csrfToken;
    return result;
  }
  async logout() {
    try {
      await this.request('/auth/logout', z.undefined(), {}, 'POST');
    } finally {
      this.clearSession();
      this.invalidated();
    }
  }
  async request<T extends z.ZodTypeAny>(
    path: string,
    schema: T,
    body?: unknown,
    method = 'GET',
    signal?: AbortSignal,
  ): Promise<z.output<T>> {
    if (!/^\/(auth|staff|admin)\//.test(path) || path.includes('..') || path.includes('#'))
      throw new StaffApiError('VALIDATION_FAILED', 0);
    const mutation = method !== 'GET';
    if (
      mutation &&
      !this.csrf &&
      ![
        '/auth/login',
        '/auth/invitations/accept',
        '/auth/password/reset-request',
        '/auth/password/reset',
      ].includes(path)
    )
      throw new StaffApiError('UNAUTHENTICATED', 401);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (mutation && this.csrf) headers['x-csrf-token'] = this.csrf;
    try {
      const response = await fetch(this.origin + '/api/v1' + path, {
        method,
        headers,
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
          : AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        const data: z.infer<typeof errorSchema> | null = await response
          .json()
          .then((v: unknown) => errorSchema.parse(v))
          .catch(() => null);
        if (response.status === 401) {
          this.clearSession();
          this.invalidated();
        }
        throw new StaffApiError(
          data?.error.code ?? 'DEPENDENCY_UNAVAILABLE',
          response.status,
          data?.error.requestId ?? null,
          [400, 422].includes(response.status) ? (data?.error.message ?? null) : null,
        );
      }
      const result = schema.safeParse(response.status === 204 ? undefined : await response.json());
      if (!result.success) throw new StaffApiError('INVALID_RESPONSE', response.status);
      return result.data;
    } catch (error) {
      if (error instanceof StaffApiError) throw error;
      if (signal?.aborted) throw error;
      throw new StaffApiError('DEPENDENCY_UNAVAILABLE', 0);
    }
  }
  async part(
    session: z.infer<typeof uploadSchema>,
    number: number,
    bytes: Blob,
    signal?: AbortSignal,
  ) {
    if (!this.csrf) throw new StaffApiError('UNAUTHENTICATED', 401);
    const url = new URL(session.upload.url.replace('{number}', String(number)));
    apiOrigin(url.origin);
    if (
      url.origin !== this.mediaOrigin ||
      !/^\/api\/v1\/admin\/media\/uploads\/[0-9a-f-]{36}\/parts\/[0-9]+$/.test(url.pathname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new StaffApiError('INVALID_RESPONSE', 0);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-csrf-token': this.csrf },
      body: bytes,
      credentials: 'include',
      redirect: 'error',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      if (response.status === 401) {
        this.clearSession();
        this.invalidated();
      }
      throw new StaffApiError(
        response.status === 401 ? 'UNAUTHENTICATED' : 'DEPENDENCY_UNAVAILABLE',
        response.status,
      );
    }
    return uploadSchema.parse(await response.json());
  }
}
const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    requestId: z.string(),
    message: z.string().min(1).max(1000).optional(),
  }),
});
