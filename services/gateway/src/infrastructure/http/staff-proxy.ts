import { ApplicationError } from '@golden-lift/contracts';
import type { BusinessService } from '@golden-lift/contracts';
import type {
  StaffProxy,
  StaffProxyRequest,
  StaffProxyResponse,
} from '../../application/ports/staff-proxy.js';
const id = '[0-9a-fA-F-]{36}';
const routes: readonly { method: string; path: RegExp; service: BusinessService }[] = [
  {
    method: 'GET',
    path: new RegExp(
      '^/api/v1/admin/(?:product-types|attributes|attribute-groups)(?:/' + id + '(?:/schema)?)?$',
    ),
    service: 'catalog',
  },
  {
    method: 'GET',
    path: new RegExp('^/api/v1/admin/attribute-options/' + id + '$'),
    service: 'catalog',
  },
  {
    method: 'GET',
    path: /^\/api\/v1\/admin\/units(?:\/[a-zA-Z0-9_.-]{1,128})?$/,
    service: 'catalog',
  },
  {
    method: 'POST',
    path: /^\/api\/v1\/admin\/(?:product-types|attributes|attribute-groups|units)$/,
    service: 'catalog',
  },
  {
    method: 'POST',
    path: new RegExp(
      '^/api/v1/admin/(?:product-types|attributes|attribute-groups|attribute-options)/' +
        id +
        '/changes(?:/preview)?$',
    ),
    service: 'catalog',
  },
  {
    method: 'POST',
    path: /^\/api\/v1\/admin\/units\/[a-zA-Z0-9_.-]{1,128}\/changes(?:\/preview)?$/,
    service: 'catalog',
  },
  {
    method: 'POST',
    path: new RegExp('^/api/v1/admin/attributes/' + id + '/options$'),
    service: 'catalog',
  },
  {
    method: 'POST',
    path: new RegExp(
      '^/api/v1/admin/products(?:/' + id + '/(?:placement|type-change(?:/preview)?))?$',
    ),
    service: 'catalog',
  },
  { method: 'PATCH', path: new RegExp('^/api/v1/admin/products/' + id + '$'), service: 'catalog' },
  {
    method: 'GET',
    path: new RegExp('^/api/v1/admin/products/' + id + '(?:/edit-schema)?$'),
    service: 'catalog',
  },
  {
    method: 'POST',
    path: /^\/api\/v1\/auth\/(login|logout|invitations\/accept|password\/(reset-request|reset|change))$/,
    service: 'identity',
  },
  { method: 'GET', path: /^\/api\/v1\/auth\/session$/, service: 'identity' },
  {
    method: 'GET',
    path: new RegExp('^/api/v1/staff/admins(?:/' + id + ')?$'),
    service: 'identity',
  },
  {
    method: 'POST',
    path: new RegExp('^/api/v1/staff/admins(?:/' + id + '/(?:enable|disable|invitation))?$'),
    service: 'identity',
  },
  { method: 'PATCH', path: new RegExp('^/api/v1/staff/admins/' + id + '$'), service: 'identity' },
  { method: 'DELETE', path: new RegExp('^/api/v1/staff/admins/' + id + '$'), service: 'identity' },
  { method: 'POST', path: /^\/api\/v1\/admin\/categories$/, service: 'catalog' },
  {
    method: 'GET',
    path: new RegExp(
      '^/api/v1/admin/categories(?:/' +
        id +
        '(?:/(?:breadcrumbs|move-destinations|deletion-preview))?)?$',
    ),
    service: 'catalog',
  },
  { method: 'POST', path: /^\/api\/v1\/admin\/categories\/reorder$/, service: 'catalog' },
  {
    method: 'POST',
    path: new RegExp('^/api/v1/admin/categories/' + id + '/move$'),
    service: 'catalog',
  },
  {
    method: 'DELETE',
    path: new RegExp('^/api/v1/admin/categories/' + id + '$'),
    service: 'catalog',
  },
  {
    method: 'PATCH',
    path: new RegExp('^/api/v1/admin/categories/' + id + '$'),
    service: 'catalog',
  },
  { method: 'GET', path: /^\/api\/v1\/admin\/media\/session$/, service: 'media' },
  { method: 'GET', path: /^\/api\/v1\/admin\/inquiries\/session$/, service: 'inquiries' },
];
export class HttpStaffProxy implements StaffProxy {
  constructor(private readonly upstreams: Readonly<Record<BusinessService, string>>) {}
  async forward(request: StaffProxyRequest): Promise<StaffProxyResponse> {
    const route = routes.find(
      (route) => route.method === request.method && route.path.test(request.path),
    );
    if (!route) throw new ApplicationError('NOT_FOUND', 'Resource not found.');
    const headers: Record<string, string> = { accept: 'application/json' };
    for (const name of ['cookie', 'origin', 'x-csrf-token', 'x-request-id']) {
      const value = request.headers[name];
      if (value) headers[name] = value;
    }
    if (request.method !== 'GET') headers['content-type'] = 'application/json';
    try {
      const response = await fetch(this.upstreams[route.service] + request.path + request.query, {
        method: request.method,
        headers,
        ...(request.method === 'GET' ? {} : { body: JSON.stringify(request.body ?? {}) }),
        signal: AbortSignal.timeout(20000),
        redirect: 'error',
      });
      if (response.status === 204)
        return { status: 204, body: null, cookies: response.headers.getSetCookie() };
      if (!response.headers.get('content-type')?.includes('application/json'))
        throw new Error('Invalid upstream response.');
      return {
        status: response.status,
        body: (await response.json()) as unknown,
        cookies: response.headers.getSetCookie(),
      };
    } catch {
      throw new ApplicationError(
        'DEPENDENCY_UNAVAILABLE',
        'Staff service is temporarily unavailable.',
      );
    }
  }
}
