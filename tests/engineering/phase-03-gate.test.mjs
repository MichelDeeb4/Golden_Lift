import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { phase03Errors } from '../../packages/tooling/phase-03-gate.mjs';
test('Phase 03 rejects missing owner deadlines, fake/missing receipts and wrong CI commit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-phase03-gate-'));
  try {
    fs.writeFileSync(path.join(root, 'receipt'), 'real command artifact');
    const artifact = {
      path: 'receipt',
      sha256: createHash('sha256').update('real command artifact').digest('hex'),
    };
    const ids = ['INSTALL', 'CHECK', 'DATABASE', 'DOCKER', 'SECURITY', 'CI'];
    const matrix = { criteria: ids.map((id) => ({ id, evidence: id, status: 'PASS' })) };
    const evidence = {
      phase: 3,
      sourceCommit: 'a'.repeat(40),
      commands: ids.map((id) => ({
        id,
        status: 'PASS',
        exitCode: 0,
        checkedAt: '2026-10-10',
        command: id,
        artifact,
        sourceCommit: 'a'.repeat(40),
        workflowUrl: 'https://github.com/example/run',
      })),
    };
    const decisions = JSON.parse(
      fs.readFileSync('docs/specifications/phase-01-decisions.json', 'utf8'),
    );
    assert.ok(
      phase03Errors(matrix, evidence, decisions, root).some((x) => x.includes('OWNER-SCALE')),
    );
    const approved = structuredClone(decisions);
    for (const d of approved.decisions) d.status = 'APPROVED';
    approved.targets.maxDatabaseConnections = 4;
    assert.deepEqual(phase03Errors(matrix, evidence, approved, root), []);
    const wrong = structuredClone(evidence);
    wrong.commands.at(-1).sourceCommit = 'b'.repeat(40);
    assert.ok(phase03Errors(matrix, wrong, approved, root).includes('Hosted source mismatch'));
    wrong.commands[0].exitCode = null;
    assert.ok(phase03Errors(matrix, wrong, approved, root).includes('Unverified INSTALL'));
    fs.writeFileSync(path.join(root, 'receipt'), 'altered');
    assert.ok(
      phase03Errors(matrix, evidence, approved, root).some((x) => x.includes('altered receipt')),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
