import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Controller, Get, Post, Inject, Body, Req, Res, HttpCode } from '@nestjs/common';
import { IDENTITY_HTTP, body, cookie, principal, requireOrigin, setCookie } from './context.js';
import type { IdentityHttp } from './context.js';
@Controller('api/v1/auth')
export class AuthController {
  constructor(@Inject(IDENTITY_HTTP) private readonly context: IdentityHttp) {}
  private limit(request: IncomingMessage, key: string, value: unknown): void {
    this.context.rateLimit('ip:' + (request.socket.remoteAddress ?? 'unknown'), 120);
    this.context.rateLimit(
      key +
        ':' +
        createHash('sha256')
          .update(typeof value === 'string' ? value.trim().toLowerCase().slice(0, 254) : 'invalid')
          .digest('hex'),
      key === 'reset' ? 5 : 10,
    );
  }
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() value: unknown,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const input = body(value, ['email', 'password']);
    requireOrigin(this.context, request.headers.origin);
    this.limit(request, 'login', input['email']);
    const result = await this.context.authentication.login(input['email'], input['password']);
    response.setHeader(
      'set-cookie',
      setCookie(
        this.context,
        result.token,
        Math.max(0, Math.ceil((Date.parse(result.session.expiresAt) - Date.now()) / 1000)),
      ),
    );
    return result.session;
  }
  @Get('session') async session(@Req() request: IncomingMessage) {
    return (await principal(this.context, request)).session;
  }
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    await principal(this.context, request, true);
    const token = cookie(request, this.context.cookieName);
    if (token) await this.context.authentication.logout(token);
    response.setHeader('set-cookie', setCookie(this.context, '', 0));
  }
  @Post('invitations/accept')
  @HttpCode(200)
  async accept(@Body() value: unknown, @Req() request: IncomingMessage) {
    const input = body(value, ['token', 'password']);
    requireOrigin(this.context, request.headers.origin);
    this.limit(request, 'action', request.socket.remoteAddress);
    await this.context.actions.consume(input['token'], input['password'], 'INVITATION');
    return { accepted: true };
  }
  @Post('password/reset-request')
  @HttpCode(202)
  async requestReset(@Body() value: unknown, @Req() request: IncomingMessage) {
    const input = body(value, ['email']);
    requireOrigin(this.context, request.headers.origin);
    this.limit(request, 'reset', input['email']);
    const started = Date.now();
    await this.context.actions.requestReset(input['email']);
    await delay(Math.max(0, 100 - (Date.now() - started)));
    return { accepted: true };
  }
  @Post('password/reset')
  @HttpCode(200)
  async reset(@Body() value: unknown, @Req() request: IncomingMessage) {
    const input = body(value, ['token', 'password']);
    requireOrigin(this.context, request.headers.origin);
    this.limit(request, 'action', request.socket.remoteAddress);
    await this.context.actions.consume(input['token'], input['password'], 'PASSWORD_RESET');
    return { reauthenticate: true };
  }
  @Post('password/change')
  @HttpCode(200)
  async change(
    @Body() value: unknown,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const input = body(value, ['oldPassword', 'password']);
    await principal(this.context, request, true);
    this.limit(request, 'password-change', request.socket.remoteAddress);
    const token = cookie(request, this.context.cookieName);
    if (token)
      await this.context.authentication.changePassword(
        token,
        input['oldPassword'],
        input['password'],
      );
    response.setHeader('set-cookie', setCookie(this.context, '', 0));
    return { reauthenticate: true };
  }
}
