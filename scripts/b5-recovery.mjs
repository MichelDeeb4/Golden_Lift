// Local coordinated recovery acceptance only. Never reads a live database/storage profile.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
const pointer = JSON.parse(fs.readFileSync('.local/b5-validation-pointer.json', 'utf8'));
const directory = path.resolve(pointer.directory);
assert.equal(path.dirname(directory), path.resolve('.local'));
assert.match(path.basename(directory), /^b5-validation-/);
process.env.BUSINESS_PLATFORM_DATABASE_CONFIG_FILE = pointer.configFile;
const tools = await import('../database/scripts/db.mjs');
const cfg = tools.config();
assert.equal(cfg.adminUser, 'b5_disposable_admin');
assert.equal(
  path.resolve(tools.sql(cfg, null, 'SHOW data_directory')),
  path.join(directory, 'postgres'),
);
const source = structuredClone(cfg),
  restored = structuredClone(cfg),
  created = [];
const area = fs.mkdtempSync(path.join(directory, 'recovery-'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function run(binary, args, profile) {
  const result = spawnSync(
    path.join(
      process.env.PG_BIN ?? 'C:/Program Files/PostgreSQL/18/bin',
      binary + (process.platform === 'win32' ? '.exe' : ''),
    ),
    args,
    {
      env: tools.env(profile, 'media'),
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
}
try {
  for (const profile of [source, restored]) {
    profile.services.media.database =
      'business_platform_b5_recovery_' + randomUUID().replaceAll('-', '');
    tools.sql(
      cfg,
      null,
      `CREATE DATABASE ${profile.services.media.database} OWNER ${profile.services.media.owner} TEMPLATE template0 ENCODING 'UTF8'`,
    );
    created.push(profile.services.media.database);
  }
  tools.file(source, 'media', 'sql/18_media_core_fresh.sql', { owner: true, atomic: true });
  tools.grantRuntime(source, 'media');
  const asset = randomUUID(),
    selected = randomUUID(),
    retained = randomUUID();
  const original = await sharp({
    create: { width: 16, height: 24, channels: 4, background: '#22558888' },
  })
    .png()
    .toBuffer();
  const output = await sharp(original).webp().toBuffer();
  const oldOutput = await sharp(original).resize(8, 12).webp().toBuffer();
  const objects = [
    { key: `originals/${asset}`, bytes: original },
    { key: `outputs/${asset}/${selected}/image`, bytes: output },
    { key: `outputs/${asset}/${retained}/image`, bytes: oldOutput },
  ];
  for (const object of objects) {
    const target = path.join(area, 'source-objects', object.key);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, object.bytes, { flag: 'wx' });
  }
  // Test-scoped verification evidence creates a recovery fixture, never claims live malware acceptance.
  tools.sql(
    source,
    'media',
    `BEGIN;
    INSERT INTO media.assets(id,media_kind,status,original_name,storage_bucket,storage_key,detected_mime_type,byte_size,sha256,pipeline_version,security_state,verification)
    VALUES('${asset}','IMAGE','READY','recovery.png','test-private','${objects[0].key}','image/png',${original.length},decode('${hash(original)}','hex'),'b5-recovery-test','VERIFIED','{"scanner":"TEST ONLY recovery fixture"}');
    INSERT INTO media.asset_variants(asset_id,variant_key,mime_type,storage_bucket,storage_key,byte_size,sha256,generation,deleted_at)
    VALUES('${asset}','thumbnail','image/webp','test-private','${objects[2].key}',${oldOutput.length},decode('${hash(oldOutput)}','hex'),'${retained}',clock_timestamp());
    INSERT INTO media.asset_variants(asset_id,variant_key,mime_type,storage_bucket,storage_key,byte_size,sha256,generation)
    SELECT '${asset}',profile,'image/webp','test-private','${objects[1].key}',${output.length},decode('${hash(output)}','hex'),'${selected}' FROM unnest(ARRAY['thumbnail','card','detail','large']) profile;
    COMMIT;`,
    true,
  );
  const snapshot = path.join(area, 'media.dump');
  run(
    'pg_dump',
    ['-w', '--format=custom', '--file=' + snapshot, source.services.media.database],
    source,
  );
  fs.cpSync(path.join(area, 'source-objects'), path.join(area, 'restored-objects'), {
    recursive: true,
    errorOnExist: true,
  });
  run(
    'pg_restore',
    ['-w', '--exit-on-error', '--dbname=' + restored.services.media.database, snapshot],
    restored,
  );
  tools.grantRuntime(restored, 'media');
  const rows = JSON.parse(
    tools.sql(
      restored,
      'media',
      `SELECT jsonb_agg(r) FROM (
    SELECT storage_key,byte_size::text,encode(sha256,'hex') sha256,NULL::text generation,false retained FROM media.assets
    UNION ALL SELECT storage_key,byte_size::text,encode(sha256,'hex'),generation::text,deleted_at IS NOT NULL FROM media.asset_variants
  ) r`,
      true,
    ),
  );
  assert.equal(rows.length, 6);
  for (const row of rows) {
    assert.match(row.storage_key, /^(originals|outputs)\/[a-f0-9/-]+(?:image)?$/);
    const bytes = fs.readFileSync(path.join(area, 'restored-objects', row.storage_key));
    assert.equal(String(bytes.length), row.byte_size);
    assert.equal(hash(bytes), row.sha256);
    if (row.generation) assert.equal(row.generation, row.retained ? retained : selected);
  }
  assert.equal(rows.filter((row) => row.retained).length, 1);
  console.log(
    'PASS local PostgreSQL custom-format dump/restore plus object snapshot: original, four selected profiles, retained previous generation; all SHA-256 and byte identities match.',
  );
} finally {
  for (const database of created) {
    assert.match(database, /^business_platform_b5_recovery_[a-f0-9]{32}$/);
    tools.sql(cfg, null, 'DROP DATABASE ' + database + ' WITH (FORCE)');
  }
  assert.equal(path.dirname(area), directory);
  assert.match(path.basename(area), /^recovery-/);
  fs.rmSync(area, { recursive: true, force: true });
}
