import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Catch, Controller, Get, HttpException, Module } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ApplicationError } from '@golden-lift/contracts';
import type { ApiError, ErrorCode } from '@golden-lift/contracts';
import { ConfigurationError } from './config.js';
import type { HttpConfig } from './config.js';
const statuses: Record<ErrorCode, number> = {
  DELETE_BLOCKED_BY_PRODUCTS: 409,
  DELETE_BLOCKED_BY_UNIT_USAGE: 409,
  DELETE_IMPACT_CHANGED: 409,
  DELETE_ALREADY_IN_PROGRESS: 409,
  MEDIA_DELETE_FAILED: 503,
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  CONFLICT: 409,
  INVALID_STATE: 422,
  REQUEST_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};
@Catch()
class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<ServerResponse>();
    let code: ErrorCode = 'INTERNAL_ERROR',
      message = 'The request could not be completed.';
    if (error instanceof ApplicationError) {
      code = error.code;
      message = error.message;
    } else if (error instanceof HttpException) {
      const status = error.getStatus();
      if (status === 404) {
        code = 'NOT_FOUND';
        message = 'Resource not found.';
      } else if (status === 413) {
        code = 'REQUEST_TOO_LARGE';
        message = 'Request body is too large.';
      } else if (status === 400) {
        code = 'VALIDATION_FAILED';
        message = 'Invalid request.';
      }
    } else if (typeof error === 'object' && error !== null && 'status' in error) {
      if (error.status === 413) {
        code = 'REQUEST_TOO_LARGE';
        message = 'Request body is too large.';
      } else if (error.status === 400) {
        code = 'VALIDATION_FAILED';
        message = 'Invalid request.';
      }
    }
    const requestId = String(response.getHeader('x-request-id') ?? randomUUID());
    const body: ApiError = { error: { code, message, requestId } };
    response.statusCode = statuses[code];
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(body));
  }
}
export interface HttpDependencies {
  readonly ready: () => Promise<boolean>;
  readonly shutdown?: () => Promise<void>;
  readonly controllers?: readonly Type<unknown>[];
  readonly providers?: readonly { provide: symbol; useValue: unknown }[];
}
export async function httpApplication(
  config: HttpConfig,
  dependencies: HttpDependencies,
): Promise<NestExpressApplication> {
  @Controller('health')
  class HealthController {
    @Get('live') live(): { status: string; service: string } {
      return { status: 'ok', service: config.service };
    }
    @Get('ready') async ready(): Promise<{ status: string; service: string }> {
      if (!(await dependencies.ready()))
        throw new ApplicationError('DEPENDENCY_UNAVAILABLE', 'Service is not ready.');
      return { status: 'ok', service: config.service };
    }
  }
  class Lifecycle {
    async onApplicationShutdown(): Promise<void> {
      await dependencies.shutdown?.();
    }
  }
  @Module({
    controllers: [HealthController, ...(dependencies.controllers ?? [])],
    providers: [Lifecycle, ...(dependencies.providers ?? [])],
  })
  class AppModule {}
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
    bodyParser: false,
    abortOnError: false,
  });
  app.enableCors({
    origin: (origin, callback) =>
      callback(null, !!origin && config.allowedOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  });
  app.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const value = request.headers['x-request-id'];
    const requestId =
      typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : randomUUID();
    request.headers['x-request-id'] = requestId;
    for (const header of ['x-user-id', 'x-user-role', 'x-auth-version', 'x-authenticated-user'])
      delete request.headers[header];
    response.setHeader('x-request-id', requestId);
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('cache-control', 'no-store');
    const started = performance.now();
    response.on('finish', () =>
      console.log(
        JSON.stringify({
          event: 'http.complete',
          service: config.service,
          requestId,
          method: request.method,
          status: response.statusCode,
          durationMs: Math.round(performance.now() - started),
        }),
      ),
    );
    const origin = request.headers.origin;
    if (origin && !config.allowedOrigins.includes(origin)) {
      response.statusCode = 403;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          error: { code: 'FORBIDDEN', message: 'Origin is not allowed.', requestId },
        }),
      );
      return;
    }
    if (origin) {
      response.setHeader('access-control-allow-origin', origin);
      response.setHeader('vary', 'Origin');
      response.setHeader('access-control-allow-credentials', 'true');
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      response.setHeader(
        'access-control-allow-headers',
        'Content-Type, X-Request-ID, X-CSRF-Token, Idempotency-Key',
      );
      response.statusCode = 204;
      response.end();
      return;
    }
    next();
  });
  app.useBodyParser('json', { limit: '64kb' });
  app.useGlobalFilters(new SafeExceptionFilter());
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  return app;
}
export function startupFailed(service: string, error?: unknown): void {
  console.error(
    JSON.stringify({
      event: 'startup.failed',
      service,
      message:
        error instanceof ConfigurationError
          ? error.message
          : 'Check runtime database access and listening port.',
    }),
  );
  process.exitCode = 1;
}
