import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRuntime } from '@business-platform/deployment';
for (const service of ['erp-api', 'platform-api', 'worker'])
  test(service + ' real HTTP validation, readiness and OpenAPI', async () => {
    const runtime = await createRuntime(service, {
      environment: 'test',
      host: '127.0.0.1',
      port: 0,
      telemetryEndpoint: undefined,
    });
    try {
      await runtime.app.listen(0, '127.0.0.1');
      const origin = await runtime.app.getUrl();
      const ready = await fetch(origin + '/api/v1/health/ready');
      assert.equal(ready.status, 200);
      assert.equal((await ready.json()).service, service);
      assert.equal((await fetch(origin + '/api/v1/health/live')).status, 200);
      const invalid = await fetch(origin + '/api/v1/status?detail=secret&password=never-log-this');
      assert.equal(invalid.status, 400);
      const body = await invalid.json();
      assert.equal(body.code, 'VALIDATION_FAILED');
      assert.ok(body.correlationId);
      assert.ok(!JSON.stringify(body).includes('password'));
      const missing = await fetch(origin + '/api/v1/tenants');
      assert.equal(missing.status, 404);
      assert.equal((await missing.json()).code, 'NOT_FOUND');
      const valid = await fetch(origin + '/api/v1/status?detail=detail', {
        headers: { 'x-correlation-id': '11111111-1111-4111-8111-111111111111' },
      });
      assert.equal(valid.headers.get('x-correlation-id'), '11111111-1111-4111-8111-111111111111');
      assert.equal((await valid.json()).stage, 'engineering-foundation');
      const api = await fetch(origin + '/api/v1/openapi.json');
      const doc = await api.json();
      assert.equal(doc.info.title, service);
      assert.ok(doc.paths['/api/v1/health/ready']);
      assert.ok(doc.paths['/api/v1/status']);
      assert.equal(Object.keys(doc.paths).length, 3);
    } finally {
      await runtime.close();
    }
  });
test('OpenTelemetry exports real HTTP request spans to a running collector', async () => {
  const bodies = [];
  const collector = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    bodies.push(Buffer.concat(chunks));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise((resolve) => collector.listen(0, '127.0.0.1', resolve));
  const endpoint = 'http://127.0.0.1:' + collector.address().port + '/v1/traces';
  const runtime = await createRuntime('erp-api', {
    environment: 'test',
    host: '127.0.0.1',
    port: 0,
    telemetryEndpoint: endpoint,
  });
  try {
    await runtime.app.listen(0, '127.0.0.1');
    await fetch((await runtime.app.getUrl()) + '/api/v1/status');
    await runtime.close();
    assert.ok(bodies.length > 0);
    assert.ok(bodies.some((b) => b.includes(Buffer.from('http.request'))));
  } finally {
    await new Promise((resolve) => collector.close(resolve));
  }
});
test('Every compiled target process starts independently and rejects invalid config', async () => {
  for (const name of ['erp-api', 'platform-api', 'worker']) {
    const child = spawn(process.execPath, ['apps/' + name + '/dist/main.js'], {
      windowsHide: true,
      env: { ...process.env, NODE_ENV: 'test', PORT: '0', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const started = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout ' + name)), 15000);
      child.stdout.on('data', (chunk) => {
        output += chunk;
        for (const line of output.split('\n')) {
          try {
            const event = JSON.parse(line);
            if (event.event === 'runtime.started' && event.port > 0) {
              clearTimeout(timer);
              resolve(event.port);
            }
          } catch {}
        }
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error('Process failed ' + name + ' ' + code));
      });
    });
    try {
      const port = await started;
      assert.equal((await fetch('http://127.0.0.1:' + port + '/api/v1/health/ready')).status, 200);
    } finally {
      child.kill();
      await once(child, 'exit').catch(() => {});
    }
    const invalid = spawn(process.execPath, ['apps/' + name + '/dist/main.js'], {
      windowsHide: true,
      env: { ...process.env, NODE_ENV: 'test', PORT: 'invalid' },
      stdio: 'ignore',
    });
    const [code] = await once(invalid, 'exit');
    assert.notEqual(code, 0);
  }
});
