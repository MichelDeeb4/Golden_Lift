import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const required = [
  'INSTALL',
  'BUILD',
  'TYPES',
  'LINT',
  'BOUNDARIES',
  'API',
  'WEB',
  'OPENAPI',
  'TELEMETRY',
  'DATABASE-HARNESS',
  'DOCKER',
  'CI',
  'SECURITY',
];
export function phase02Errors(acceptance, evidence, root = process.cwd()) {
  const errors = [];
  for (const id of required) {
    const criteria = acceptance.criteria.filter((c) => c.id === id);
    if (criteria.length !== 1) {
      errors.push('Missing or duplicate criterion ' + id);
      continue;
    }
    const c = criteria[0],
      receipt = evidence.commands.find((r) => r.id === c.evidence);
    if (
      c.status !== 'PASS' ||
      !receipt ||
      receipt.status !== 'PASS' ||
      receipt.exitCode !== 0 ||
      !receipt.command ||
      !receipt.checkedAt ||
      !receipt.artifact
    ) {
      errors.push('Unverified ' + id);
      continue;
    }
    const target = path.resolve(root, receipt.artifact.path);
    if (
      !target.startsWith(path.resolve(root) + path.sep) ||
      !fs.existsSync(target) ||
      createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== receipt.artifact.sha256
    )
      errors.push('Missing or altered evidence ' + id);
  }
  return errors;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const acceptance = JSON.parse(
    fs.readFileSync('docs/specifications/phase-02-acceptance.json', 'utf8'),
  );
  const file = 'docs/implementation/phases/phase-02-verification.json';
  const evidence = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : { commands: [] };
  const errors = phase02Errors(acceptance, evidence);
  if (errors.length) {
    console.error('Phase 02 BLOCKED: ' + errors.join('; '));
    process.exit(2);
  }
  console.log(
    'Phase 02 command evidence verified. Owner deadlines remain mandatory before Phase 03.',
  );
}
