import { spawnSync } from 'node:child_process';
const docker = spawnSync('docker', ['version'], { encoding: 'utf8', windowsHide: true });
if (docker.error || docker.status !== 0) {
  console.error('BLOCKED: Docker CLI/daemon unavailable; container acceptance has not passed.');
  process.exit(2);
}
for (const args of [
  ['compose', '-f', 'infrastructure/deployment/compose.yml', 'config', '--quiet'],
  ['compose', '-f', 'infrastructure/deployment/compose.yml', 'up', '-d', '--build', '--wait'],
]) {
  const r = spawnSync('docker', args, { stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
for (const [port, route] of [
  [4100, '/api/v1/health/ready'],
  [4101, '/api/v1/health/ready'],
  [4102, '/api/v1/health/ready'],
  [4200, '/api/health'],
  [4201, '/api/health'],
]) {
  const response = await fetch('http://127.0.0.1:' + port + route, {
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== 200) throw new Error('Container readiness failed ' + port);
}
console.log('PASS: actual Docker target infrastructure and five runtime endpoints.');
