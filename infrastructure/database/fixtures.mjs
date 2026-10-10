import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
export function disposableDatabase() {
  const name = 'bp_target_test_' + randomBytes(8).toString('hex');
  const docker = (args) => {
    try {
      return execFileSync('docker', args, {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const details = String(error.stderr ?? '')
        .replaceAll(password, '[REDACTED]')
        .trim();
      throw new Error(
        'Disposable fixture Docker operation failed' + (details ? ': ' + details : ''),
      );
    }
  };
  const password = randomBytes(24).toString('hex');
  docker([
    'run',
    '--detach',
    '--rm',
    '--name',
    name,
    '--label',
    'business-platform.disposable=true',
    '--publish',
    '127.0.0.1::5432',
    '--env',
    'POSTGRES_USER=fixture_admin',
    '--env',
    'POSTGRES_PASSWORD=' + password,
    '--env',
    'POSTGRES_DB=' + name,
    'postgres:18.6',
  ]);
  return {
    name,
    password,
    docker,
    close() {
      const labels = docker([
        'inspect',
        '--format',
        '{{ index .Config.Labels "business-platform.disposable" }}',
        name,
      ]).trim();
      if (labels !== 'true' || !/^bp_target_test_[a-f0-9]{16}$/.test(name))
        throw new Error('Refuse unsafe fixture cleanup');
      docker(['stop', name]);
    },
  };
}
