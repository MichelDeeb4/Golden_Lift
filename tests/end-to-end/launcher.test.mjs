import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
test('Engineering launcher starts and stops all five actual processes', async () => {
  const child = fork('packages/tooling/start.mjs', [], {
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const ports = [
    [4100, '/api/v1/health/ready'],
    [4101, '/api/v1/health/ready'],
    [4102, '/api/v1/health/ready'],
    [4200, '/api/health'],
    [4201, '/api/health'],
  ];
  let output = '';
  child.stdout.on('data', (b) => {
    output += b;
  });
  child.stderr.on('data', (b) => {
    output += b;
  });
  try {
    for (const [port, route] of ports) {
      let ready = false;
      for (let n = 0; n < 100; n++) {
        try {
          const r = await fetch('http://127.0.0.1:' + port + route, {
            signal: AbortSignal.timeout(500),
          });
          if (r.status === 200) {
            ready = true;
            break;
          }
        } catch {}
        if (child.exitCode !== null) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(ready, 'Launcher readiness ' + port + ' ' + output);
    }
  } finally {
    if (child.connected) {
      const exited = once(child, 'exit');
      child.send('shutdown');
      await exited;
    } else if (child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
  }
  for (const [port, route] of ports)
    await assert.rejects(
      fetch('http://127.0.0.1:' + port + route, { signal: AbortSignal.timeout(500) }),
    );
  assert.equal(child.exitCode, 0);
});
