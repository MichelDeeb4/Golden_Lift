import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  Controller,
  Get,
  Query,
  Module,
  Injectable,
  Inject,
  Catch,
  ValidationPipe,
  HttpException,
} from '@nestjs/common';
import type {
  ArgumentsHost,
  ExceptionFilter,
  LoggerService,
  INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  SwaggerModule,
  DocumentBuilder,
  ApiPropertyOptional,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { RuntimeService, RuntimeHealth, ApiFailure } from '@business-platform/contracts';
import type { RuntimeConfig } from '@business-platform/security';
import { structuredLog, telemetry, trace } from '@business-platform/observability';
const SERVICE = Symbol('RuntimeService');
class StatusQuery {
  @ApiPropertyOptional({ enum: ['summary', 'detail'] })
  @IsOptional()
  @IsIn(['summary', 'detail'])
  detail?: string;
}
@Injectable()
class RuntimeState {
  constructor(@Inject(SERVICE) readonly service: RuntimeService) {}
  health(): RuntimeHealth {
    return { service: this.service, status: 'ready', checks: { runtime: 'ready' } };
  }
}
@Controller()
class RuntimeController {
  constructor(private readonly state: RuntimeState) {}
  @Get('health/live') @ApiOperation({ summary: 'Process liveness' }) live() {
    return { service: this.state.service, status: 'alive' };
  }
  @Get('health/ready')
  @ApiOperation({ summary: 'Engineering runtime readiness, not business readiness' })
  ready() {
    return this.state.health();
  }
  @Get('status')
  @ApiQuery({ name: 'detail', required: false, enum: ['summary', 'detail'] })
  status(@Query() query: StatusQuery) {
    return {
      service: this.state.service,
      apiVersion: 'v1',
      ...(query.detail === 'detail' ? { stage: 'engineering-foundation' } : {}),
    };
  }
}
class JsonLogger implements LoggerService {
  constructor(private readonly service: RuntimeService) {}
  log() {}
  warn() {
    structuredLog(this.service, 'runtime.warning');
  }
  error() {
    structuredLog(this.service, 'runtime.error');
  }
}
@Catch()
class SafeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp(),
      request = http.getRequest<{ correlationId: string }>(),
      response = http.getResponse<{
        status: (n: number) => { json: (value: ApiFailure) => void };
      }>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const code =
      status === 400 ? 'VALIDATION_FAILED' : status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR';
    response.status(status).json({
      code,
      message:
        status === 400
          ? 'Invalid request.'
          : status === 404
            ? 'Resource not found.'
            : 'Request failed.',
      correlationId: request.correlationId,
    });
  }
}
export async function createRuntime(service: RuntimeService, config: RuntimeConfig) {
  const observability = telemetry(service, config.telemetryEndpoint);
  @Module({
    controllers: [RuntimeController],
    providers: [RuntimeState, { provide: SERVICE, useValue: service }],
  })
  class RuntimeModule {}
  let app: INestApplication | undefined;
  try {
    app = await NestFactory.create(RuntimeModule, { logger: new JsonLogger(service) });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new SafeErrors());
    app.use(
      (
        request: { headers: Record<string, string | string[] | undefined>; correlationId: string },
        response: {
          setHeader: (n: string, v: string) => void;
          on: (event: string, work: () => void) => void;
          statusCode: number;
        },
        next: () => void,
      ) => {
        const supplied = request.headers['x-correlation-id'];
        request.correlationId =
          typeof supplied === 'string' && /^[0-9a-f-]{36}$/i.test(supplied)
            ? supplied
            : randomUUID();
        response.setHeader('x-correlation-id', request.correlationId);
        response.setHeader('x-content-type-options', 'nosniff');
        const span = trace.getTracer('business-platform.http').startSpan('http.request');
        response.on('finish', () => {
          span.setAttribute('http.response.status_code', response.statusCode);
          span.end();
          structuredLog(service, 'http.completed', {
            correlationId: request.correlationId,
            status: response.statusCode,
          });
        });
        next();
      },
    );
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(service)
        .setDescription('Phase 02 runtime endpoints only; no tenant or business admission routes.')
        .setVersion('1.0.0')
        .build(),
    );
    SwaggerModule.setup('api/v1/docs', app, document, { jsonDocumentUrl: 'api/v1/openapi.json' });
    await app.init();
    const initialized = app;
    return {
      app: initialized,
      document,
      close: async () => {
        await initialized.close();
        await observability.close();
      },
    };
  } catch (error) {
    await app?.close();
    await observability.close();
    throw error;
  }
}
export async function startRuntime(service: RuntimeService, config: RuntimeConfig) {
  const runtime = await createRuntime(service, config);
  await runtime.app.listen(config.port, config.host);
  structuredLog(service, 'runtime.started', { port: runtime.app.getHttpServer().address().port });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await runtime.close();
  };
  process.once('SIGTERM', () => {
    void close();
  });
  process.once('SIGINT', () => {
    void close();
  });
  return runtime;
}
