import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { phase02Errors } from '../../packages/tooling/phase-02-gate.mjs';
test('Phase exit rejects unexecuted claims, missing criteria and tampered logs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-evidence-test-'));
  try {
    const ids = [
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
    const acceptance = { criteria: ids.map((id) => ({ id, status: 'PASS', evidence: id })) };
    assert.equal(phase02Errors(acceptance, { commands: [] }, root).length, 13);
    fs.writeFileSync(
      path.join(root, 'receipt.log'),
      'synthetic gate bookkeeping fixture, not runtime evidence',
    );
    const sha256 = createHash('sha256')
      .update(fs.readFileSync(path.join(root, 'receipt.log')))
      .digest('hex');
    const evidence = {
      commands: ids.map((id) => ({
        id,
        status: 'PASS',
        exitCode: 0,
        command: 'synthetic fixture',
        checkedAt: 'test',
        artifact: { path: 'receipt.log', sha256 },
      })),
    };
    assert.deepEqual(phase02Errors(acceptance, evidence, root), []);
    fs.appendFileSync(path.join(root, 'receipt.log'), 'changed');
    assert.equal(phase02Errors(acceptance, evidence, root).length, 13);
    acceptance.criteria.pop();
    assert.ok(phase02Errors(acceptance, evidence, root).some((e) => e.includes('Missing')));
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
