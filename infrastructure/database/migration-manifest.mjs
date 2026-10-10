import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export function migrationManifest(directory) {
  const names = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  let prior = 0;
  return names.map((name) => {
    if (!/^[0-9]{4}_[a-z0-9_]+\.sql$/.test(name)) throw new Error('Invalid migration filename');
    const sequence = Number(name.slice(0, 4));
    if (sequence !== prior + 1) throw new Error('Migration sequence gap or duplicate');
    prior = sequence;
    const bytes = fs.readFileSync(path.join(directory, name));
    if (!bytes.toString('utf8').trim()) throw new Error('Empty migration');
    return { sequence, name, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
}
export function verifyMigrationHistory(manifest, applied) {
  if (applied.length > manifest.length) throw new Error('Database migration stream is ahead');
  for (let n = 0; n < applied.length; n++) {
    if (applied[n].sequence !== manifest[n]?.sequence || applied[n].sha256 !== manifest[n]?.sha256)
      throw new Error('Applied migration mismatch');
  }
  return manifest.slice(applied.length);
}
