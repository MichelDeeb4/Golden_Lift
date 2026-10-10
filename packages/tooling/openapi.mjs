import { format } from 'prettier';
import fs from 'node:fs';
import { createRuntime } from '@business-platform/deployment';
for (const service of ['erp-api', 'platform-api']) {
  const runtime = await createRuntime(service, {
    environment: 'test',
    host: '127.0.0.1',
    port: 0,
    telemetryEndpoint: undefined,
  });
  fs.mkdirSync('docs/specifications/openapi', { recursive: true });
  fs.writeFileSync(
    'docs/specifications/openapi/' + service + '.json',
    await format(JSON.stringify(runtime.document), { parser: 'json' }),
  );
  await runtime.close();
}
console.log('Generated both target OpenAPI contracts from actual NestJS composition.');
