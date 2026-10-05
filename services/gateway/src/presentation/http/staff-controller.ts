import type { IncomingMessage, ServerResponse } from 'node:http';
import { All, Body, Controller, Inject, Req, Res } from '@nestjs/common';
import type { StaffProxy } from '../../application/ports/staff-proxy.js';
export const STAFF_PROXY = Symbol('StaffProxy');
@Controller('api/v1')
export class StaffController {
  constructor(@Inject(STAFF_PROXY) private readonly proxy: StaffProxy) {}
  @All([
    'auth/*route',
    'staff/admins',
    'staff/admins/*route',
    'admin/categories',
    'admin/categories/*route',
    'admin/product-types',
    'admin/product-types/*route',
    'admin/attributes',
    'admin/attributes/*route',
    'admin/attribute-groups',
    'admin/attribute-groups/*route',
    'admin/attribute-options/*route',
    'admin/units',
    'admin/units/*route',
    'admin/products',
    'admin/products/*route',
    'admin/media/*route',
    'media/*route',
    'admin/inquiries/session',
  ])
  async forward(
    @Req() request: IncomingMessage,
    @Res() response: ServerResponse,
    @Body() body: unknown,
  ): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://gateway.local'),
      headers: Record<string, string> = {};
    for (const name of ['cookie', 'origin', 'x-csrf-token', 'x-request-id']) {
      const value = request.headers[name];
      if (typeof value === 'string') headers[name] = value;
    }
    const result = await this.proxy.forward({
      method: request.method ?? 'GET',
      path: url.pathname,
      query: url.search,
      headers,
      body,
    });
    response.statusCode = result.status;
    if (result.cookies.length) response.setHeader('set-cookie', result.cookies);
    if (result.status === 204) {
      response.end();
      return;
    }
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(result.body));
  }
}
