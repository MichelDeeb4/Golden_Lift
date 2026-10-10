import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { trace } from '@opentelemetry/api';
export { trace };
export function structuredLog(
  service: string,
  event: string,
  fields: Readonly<Record<string, string | number | boolean>> = {},
): void {
  process.stdout.write(
    JSON.stringify({ timestamp: new Date().toISOString(), service, event, ...fields }) + '\n',
  );
}
export function telemetry(service: string, endpoint: string | undefined) {
  if (!endpoint) return { enabled: false, close: async () => {} };
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ 'service.name': service }),
    traceExporter: new OTLPTraceExporter({ url: endpoint, timeoutMillis: 3000 }),
  });
  sdk.start();
  return { enabled: true, close: () => sdk.shutdown() };
}
