// Real API client; never writes READY rows, invokes repositories, or bypasses scanner/event transport.
import fs from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
const gateway = process.env.MEDIA_SMOKE_GATEWAY ?? 'http://127.0.0.1:3000',
  cookie = process.env.MEDIA_SMOKE_COOKIE,
  csrf = process.env.MEDIA_SMOKE_CSRF,
  origin = process.env.MEDIA_SMOKE_ORIGIN ?? 'http://127.0.0.1:8082';
if (!cookie || !csrf)
  throw new Error(
    'Supply a disposable live Admin session and CSRF token through environment variables.',
  );
const inputs = process.argv.slice(2);
if (inputs.length !== 3) throw new Error('Supply synthetic image, video and PDF fixture paths.');
async function api(path, method = 'GET', body) {
  const response = await fetch(gateway + path, {
    method,
    headers: { cookie, origin, 'x-csrf-token': csrf, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Media API failed with status ' + response.status);
  return response.json();
}
const capability = await api('/api/v1/admin/media/capabilities');
if (!capability.scannerAvailable)
  throw new Error('Mandatory scanner unavailable; real B5 acceptance cannot run.');
for (const [index, file] of inputs.entries()) {
  const bytes = await fs.readFile(file),
    kind = ['IMAGE', 'VIDEO', 'PDF'][index];
  let session = await api('/api/v1/admin/media/uploads', 'POST', {
    kind,
    name: file.split(/[\\/]/).at(-1),
    bytes: String(bytes.length),
    purpose: kind === 'PDF' ? 'TECHNICAL_SOURCE' : 'CATALOG',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    idempotencyKey: randomBytes(24).toString('base64url'),
  });
  for (let part = 1; part <= session.upload.partCount; part++) {
    const offset = (part - 1) * session.upload.partBytes;
    const response = await fetch(session.upload.url.replace('{number}', String(part)), {
      method: session.upload.method,
      headers: { ...session.upload.headers, cookie, origin, 'x-csrf-token': csrf },
      body: bytes.subarray(offset, offset + session.upload.partBytes),
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    });
    if (!response.ok)
      throw new Error('Bounded part transfer failed with status ' + response.status);
    session = await response.json();
  }
  session = await api('/api/v1/admin/media/uploads/' + session.id + '/complete', 'POST', {
    expectedVersion: session.version,
  });
  const deadline = Date.now() + 20 * 60 * 1000;
  let ready;
  while (Date.now() < deadline) {
    ready = await api('/api/v1/admin/media/assets/' + session.assetId);
    if (ready.asset.status === 'FAILED')
      throw new Error('Actual processing failed: ' + ready.asset.failureCode);
    if (
      ready.asset.status === 'READY' &&
      ready.registration.registered &&
      !ready.registration.blocked
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (ready?.asset.status !== 'READY' || !ready.registration.registered)
    throw new Error('Processing/registration acceptance timed out.');
  const profile = kind === 'IMAGE' ? 'detail' : kind === 'VIDEO' ? 'poster' : 'preview';
  const authorization = await api(
    `/api/v1/admin/media/assets/${session.assetId}/variants/${profile}/authorization`,
  );
  const content = await fetch(authorization.url, {
    headers: { cookie, origin },
    signal: AbortSignal.timeout(30000),
    redirect: 'error',
  });
  if (!content.ok || (await content.arrayBuffer()).byteLength === 0)
    throw new Error('Verified private delivery failed.');
  console.log(
    JSON.stringify({
      event: 'media.smoke.ready',
      kind,
      assetId: session.assetId,
      version: ready.asset.version,
    }),
  );
}
console.log(
  'Actual processing, Catalog registration and private previews passed. Fixtures are retained; retire explicitly through the API.',
);
