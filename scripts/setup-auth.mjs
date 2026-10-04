import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
if (process.env.NODE_ENV === 'production')
  throw new Error('Production service secrets must be provisioned explicitly.');
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.local');
fs.mkdirSync(directory, { recursive: true });
const file = path.join(directory, 'service-secrets.json');
if (!fs.existsSync(file)) {
  const token = () => randomBytes(32).toString('base64url');
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        version: 1,
        csrfSecret: token(),
        callers: { catalog: token(), media: token(), inquiries: token() },
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
}
console.log('Local Identity/service secrets are ready in ignored .local/service-secrets.json.');
