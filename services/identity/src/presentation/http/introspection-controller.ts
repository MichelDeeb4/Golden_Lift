import type { IncomingMessage } from 'node:http';
import { Controller, Post, Inject, Body, Req, HttpCode } from '@nestjs/common';
import { ApplicationError } from '@business-platform/contracts';
import { IDENTITY_HTTP, body, requireOrigin } from './context.js';
import type { IdentityHttp } from './context.js';
@Controller('internal/v1/sessions')
export class IntrospectionController {
  constructor(@Inject(IDENTITY_HTTP) private readonly context: IdentityHttp) {}
  @Post('introspect')
  @HttpCode(200)
  async introspect(@Body() value: unknown, @Req() request: IncomingMessage) {
    if (
      !this.context.verifyService(request.headers['x-service-name'], request.headers.authorization)
    )
      throw new ApplicationError('FORBIDDEN', 'Service authentication failed.');
    const input = body(value, ['sessionToken', 'csrfToken', 'origin', 'mutation']);
    if (
      typeof input['sessionToken'] !== 'string' ||
      typeof input['mutation'] !== 'boolean' ||
      !(input['csrfToken'] === null || typeof input['csrfToken'] === 'string') ||
      !(input['origin'] === null || typeof input['origin'] === 'string')
    )
      throw new ApplicationError('VALIDATION_FAILED', 'Invalid introspection request.');
    const current = await this.context.authentication.current(input['sessionToken']);
    if (input['mutation']) {
      requireOrigin(this.context, input['origin']);
      if (!this.context.tokens.verifyCsrf(input['sessionToken'], input['csrfToken']))
        throw new ApplicationError('FORBIDDEN', 'A valid session-bound CSRF token is required.');
    }
    return current.actor;
  }
}
