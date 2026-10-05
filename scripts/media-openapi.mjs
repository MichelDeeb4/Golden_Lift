import fs from 'node:fs';
const file = 'documentation/api/openapi.json',
  d = JSON.parse(fs.readFileSync(file, 'utf8'));
d.info.version = '0.5.0';
d.info.description =
  'B1–B4 and Dynamic Catalog Core plus B5 Media uploads, private library, fenced processing, durable Media–Catalog integration, controlled delivery, security blocking and reference-protected retirement. Real native/scanner/broker/cloud acceptance is tracked separately in B5 validation; full product/technical UX and Inquiry workflows remain deferred.';
const ref = (name) => ({ $ref: '#/components/schemas/' + name }),
  string = { type: 'string' },
  id = { type: 'string', format: 'uuid' },
  version = ref('Version'),
  object = (properties, required = Object.keys(properties)) => ({
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  }),
  array = (items) => ({ type: 'array', items }),
  nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
Object.assign(d.components.schemas, {
  MediaUploadInput: object(
    {
      kind: { enum: ['IMAGE', 'VIDEO', 'PDF'] },
      name: { type: 'string', maxLength: 160 },
      bytes: { type: 'string', pattern: '^[1-9][0-9]{0,9}$' },
      purpose: { enum: ['CATALOG', 'TECHNICAL_SOURCE'] },
      sha256: nullable({ type: 'string', pattern: '^[a-f0-9]{64}$' }),
      idempotencyKey: { type: 'string', pattern: '^[a-zA-Z0-9_-]{16,128}$' },
    },
    ['kind', 'name', 'bytes', 'purpose', 'idempotencyKey'],
  ),
  MediaExpected: object({ expectedVersion: version }),
  MediaRetire: object({ expectedVersion: version, confirmed: { const: true } }),
  MediaVariant: object({
    profile: string,
    mime: string,
    bytes: string,
    width: nullable({ type: 'integer' }),
    height: nullable({ type: 'integer' }),
    duration: nullable(string),
  }),
  MediaAsset: object({
    jobs: array(
      object({
        id,
        status: string,
        attempts: { type: 'integer' },
        nextAttemptAt: { type: 'string', format: 'date-time' },
        failureCode: nullable(string),
      }),
    ),
    id,
    kind: { enum: ['IMAGE', 'VIDEO', 'PDF'] },
    status: { enum: ['UPLOADING', 'PROCESSING', 'READY', 'FAILED'] },
    security: { enum: ['UNVERIFIED', 'VERIFIED', 'BLOCKED', 'REJECTED'] },
    version,
    deleted: { type: 'boolean' },
    byteSize: nullable(string),
    failureCode: nullable(string),
    variants: array(ref('MediaVariant')),
  }),
  MediaRegistration: object({
    registered: { type: 'boolean' },
    retired: { type: 'boolean' },
    blocked: { type: 'boolean' },
  }),
  MediaUploadSession: object({
    id,
    assetId: id,
    status: { enum: ['OPEN', 'SEALING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED'] },
    expiresAt: { type: 'string', format: 'date-time' },
    version,
    bytes: string,
    parts: array(object({ number: { type: 'integer' }, bytes: string, sha256: string })),
    upload: object({
      method: { const: 'POST' },
      url: string,
      headers: object({ 'content-type': { const: 'application/octet-stream' } }),
      credentials: { const: 'include' },
      csrfHeader: { const: 'x-csrf-token' },
      partBytes: { type: 'integer' },
      partCount: { type: 'integer' },
    }),
  }),
  MediaAuthorization: object({
    url: { type: 'string', format: 'uri' },
    expiresAt: { type: 'string', format: 'date-time' },
    method: { const: 'GET' },
  }),
  MediaUsage: array(object({ ownerType: string, ownerId: nullable(id) })),
});
const staff = d.paths['/api/v1/admin/categories'].post.security,
  mutation = d.paths['/api/v1/admin/categories'].post.parameters,
  param = (name, schema, where = 'path', required = true) => ({
    name,
    in: where,
    required,
    schema,
  }),
  success = (schema, code = 200) => ({
    [code]: { description: 'Successful response', content: { 'application/json': { schema } } },
  }),
  failures = Object.fromEntries(
    Object.entries(d.paths['/api/v1/admin/categories'].post.responses).filter(
      ([code]) => Number(code) >= 400,
    ),
  );
function operation(
  operationId,
  method,
  schema,
  input,
  parameters = [],
  publicRoute = false,
  direct = false,
) {
  return {
    operationId,
    description: direct
      ? 'Direct Media origin. Returned upload/delivery instructions supply the configured origin; binary bytes bypass Gateway JSON handlers.'
      : publicRoute
        ? 'Fresh Catalog context eligibility and Media verification required.'
        : 'Live ADMIN only. SUPER_ADMIN is denied.',
    security: publicRoute ? [] : staff,
    parameters: [...(method === 'post' ? mutation : []), ...parameters],
    ...(input
      ? { requestBody: { required: true, content: { 'application/json': { schema: ref(input) } } } }
      : {}),
    responses: { ...success(schema, method === 'post' ? 201 : 200), ...failures },
    ...(direct
      ? {
          servers: [
            {
              url: 'http://127.0.0.1:3003',
              description: 'Override with configured MEDIA_PUBLIC_ORIGIN',
            },
          ],
        }
      : {}),
  };
}
const base = '/api/v1/admin/media',
  assetParams = [param('id', id)],
  sessionParams = assetParams,
  page = [
    param('after', id, 'query', false),
    param('limit', { type: 'integer', minimum: 1, maximum: 100, default: 25 }, 'query', false),
  ];
d.paths[base + '/capabilities'] = {
  get: operation('mediaCapabilities', 'get', { type: 'object' }),
};
d.paths[base + '/statistics'] = {
  get: operation(
    'mediaStatistics',
    'get',
    object({
      retainedReservationBytes: string,
      knownOriginalBytes: string,
      knownOutputBytes: string,
      pendingJobs: string,
      oldestJobAt: nullable(string),
      pendingEvents: string,
      exhaustedEvents: string,
      unselectedAttempts: string,
    }),
  ),
};
d.paths[base + '/uploads'] = {
  post: operation('mediaUploadInitiate', 'post', ref('MediaUploadSession'), 'MediaUploadInput'),
};
d.paths[base + '/uploads/{id}'] = {
  get: operation('mediaUploadStatus', 'get', ref('MediaUploadSession'), null, sessionParams),
};
for (const action of ['authorize', 'complete', 'cancel'])
  d.paths[base + '/uploads/{id}/' + action] = {
    post: operation(
      'mediaUpload' + action,
      'post',
      ref('MediaUploadSession'),
      action === 'authorize' ? null : 'MediaExpected',
      sessionParams,
    ),
  };
const binary = operation(
  'mediaUploadPart',
  'post',
  ref('MediaUploadSession'),
  null,
  [...sessionParams, param('number', { type: 'integer', minimum: 1, maximum: 100 })],
  false,
  true,
);
binary.requestBody = {
  required: true,
  content: {
    'application/octet-stream': {
      schema: {
        type: 'string',
        format: 'binary',
        description: 'Exact bounded part size from returned instructions.',
      },
    },
  },
};
d.paths[base + '/uploads/{id}/parts/{number}'] = { post: binary };
d.paths[base + '/assets'] = {
  get: operation(
    'mediaLibrary',
    'get',
    object({ items: array(ref('MediaAsset')), next: nullable(id) }),
    null,
    page,
  ),
};
d.paths[base + '/assets/{id}'] = {
  get: operation(
    'mediaAssetDetail',
    'get',
    object({ asset: ref('MediaAsset'), registration: ref('MediaRegistration') }),
    null,
    assetParams,
  ),
};
d.paths[base + '/assets/{id}/usage'] = {
  get: operation('mediaAssetUsage', 'get', ref('MediaUsage'), null, [
    ...assetParams,
    param('after', { type: 'integer', minimum: 0, maximum: 100000 }, 'query', false),
    page[1],
  ]),
};
for (const action of ['block', 'retry', 'reprocess', 'retire'])
  d.paths[base + '/assets/{id}/' + action] = {
    post: operation(
      'mediaAsset' + action,
      'post',
      action === 'retire' ? object({ status: { const: 'RETIRED' } }) : ref('MediaAsset'),
      action === 'retire' ? 'MediaRetire' : 'MediaExpected',
      assetParams,
    ),
  };
for (const audience of ['admin/media', 'media']) {
  const path = '/api/v1/' + audience + '/assets/{id}/variants/{profile}',
    isPublic = audience === 'media',
    parameters = [
      ...assetParams,
      param('profile', {
        enum: ['thumbnail', 'card', 'detail', 'large', 'playback', 'poster', 'preview', 'original'],
      }),
      param('action', { enum: ['PREVIEW', 'DOWNLOAD'], default: 'PREVIEW' }, 'query', false),
      ...(isPublic
        ? [
            param(
              'ownerType',
              { enum: ['CATEGORY', 'PRODUCT', 'PAGE', 'SITE_LOGO', 'TECHNICAL_SOURCE'] },
              'query',
            ),
            param('ownerId', id, 'query', false),
          ]
        : []),
    ];
  d.paths[path + '/authorization'] = {
    get: operation(
      'mediaAuthorize' + audience.replace('/', ''),
      'get',
      ref('MediaAuthorization'),
      null,
      parameters,
      isPublic,
    ),
  };
  const stream = operation(
    'mediaContent' + audience.replace('/', ''),
    'get',
    { type: 'string', format: 'binary' },
    null,
    [
      ...parameters,
      param('Range', string, 'header', false),
      param('If-Range', string, 'header', false),
      param('If-None-Match', string, 'header', false),
    ],
    isPublic,
    true,
  );
  stream.responses = {
    200: { description: 'Authorized bounded stream' },
    206: { description: 'Authorized single byte range' },
    304: { description: 'Authorized conditional response' },
    416: { description: 'Unsatisfiable/unsupported range' },
    ...failures,
  };
  d.paths[path + '/content'] = {
    get: stream,
    head: { ...stream, operationId: stream.operationId + 'Head' },
  };
}
fs.writeFileSync(file, JSON.stringify(d, null, 2) + '\n');
