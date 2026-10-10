import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { approvalErrors } from '../../tests/architecture/phase-01-contract.mjs';
export function phase03Errors(matrix, evidence, decisions, root = process.cwd()) {
  const errors = approvalErrors(decisions, 3);
  for (const id of ['INSTALL', 'CHECK', 'DATABASE', 'DOCKER', 'SECURITY', 'CI']) {
    const criteria = matrix.criteria.filter((c) => c.id === id);
    const c = criteria[0];
    const receipts = evidence.commands.filter((r) => r.id === c?.evidence);
    const r = receipts[0];
    if (
      criteria.length !== 1 ||
      receipts.length !== 1 ||
      c?.status !== 'PASS' ||
      r?.status !== 'PASS' ||
      r?.exitCode !== 0 ||
      !r?.checkedAt ||
      !r?.command ||
      !r?.artifact
    ) {
      errors.push('Unverified ' + id);
      continue;
    }
    const target = path.resolve(root, r.artifact.path);
    if (
      !target.startsWith(path.resolve(root) + path.sep) ||
      !fs.existsSync(target) ||
      createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== r.artifact.sha256
    )
      errors.push('Missing or altered receipt ' + id);
    if (id === 'CI' && (r.sourceCommit !== evidence.sourceCommit || !r.workflowUrl))
      errors.push('Hosted source mismatch');
  }
  if (!evidence.sourceCommit || evidence.phase !== 3) errors.push('Missing phase/source identity');
  return errors;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
  const errors = phase03Errors(
    read('docs/specifications/phase-03-acceptance.json'),
    read('docs/implementation/phases/phase-03-verification.json'),
    read('docs/specifications/phase-01-decisions.json'),
  );
  if (errors.length) {
    console.error('Phase 03 BLOCKED: ' + errors.join('; '));
    process.exit(2);
  }
  console.log('Phase 03 verified gate PASS');
}
