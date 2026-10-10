export interface RuntimeConfig {
  readonly environment: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly telemetryEndpoint: string | undefined;
}
export function runtimeConfig(env: NodeJS.ProcessEnv, defaultPort: number): RuntimeConfig {
  const environment = env['NODE_ENV'] ?? 'development';
  if (!['development', 'test', 'production'].includes(environment))
    throw new Error('Invalid NODE_ENV');
  const port = Number(env['PORT'] ?? defaultPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535 || (port === 0 && environment !== 'test'))
    throw new Error('Invalid PORT');
  const host = env['HOST'] ?? (environment === 'production' ? '0.0.0.0' : '127.0.0.1');
  if (!/^[a-zA-Z0-9.:_-]+$/.test(host)) throw new Error('Invalid HOST');
  const telemetryEndpoint = env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];
  if (telemetryEndpoint) {
    let url: URL;
    try {
      url = new URL(telemetryEndpoint);
    } catch {
      throw new Error('Invalid telemetry endpoint');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Invalid telemetry endpoint');
  }
  return {
    environment: environment as RuntimeConfig['environment'],
    host,
    port,
    telemetryEndpoint,
  };
}
