import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  readJson,
  validateSpecification,
  approvalErrors,
  phaseOrderErrors,
  connectionBudget,
  validateReceipts,
} from './phase-01-contract.mjs';
const matrix = readJson('docs/specifications/phase-01-acceptance.json');
const decisions = readJson('docs/specifications/phase-01-decisions.json');
test('All plan phases have traceable scenarios in pooled and dedicated modes', () => {
  assert.deepEqual(validateSpecification(matrix), []);
  assert.deepEqual(
    [...new Set(matrix.requirements.map((r) => r.phase))].sort((a, b) => a - b),
    [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  );
});
test('Removing dedicated coverage cannot pass', () => {
  const altered = structuredClone(matrix);
  altered.scenarios[0].modes = ['pooled'];
  assert.ok(validateSpecification(altered).some((e) => e.includes('Missing mode')));
});
test('Omitted tenant isolation requirement cannot pass', () => {
  const altered = structuredClone(matrix);
  altered.requirements = altered.requirements.filter((r) => r.id !== 'ISO-ROLES');
  assert.ok(validateSpecification(altered).some((e) => e.includes('ISO-ROLES')));
});
test('Invalid company multiplicity and orphaned tests cannot pass', () => {
  const altered = structuredClone(matrix);
  altered.fixtures.C.companies = ['C1'];
  altered.scenarios[0].requirementIds = ['unknown'];
  assert.ok(validateSpecification(altered).length >= 2);
});
test('Owner approval closes Phase 01 while a missing approval still blocks', () => {
  const pending = structuredClone(decisions);
  pending.ownerApproval = null;
  assert.ok(approvalErrors(pending).length > 0);
  assert.equal(decisions.phaseStatus[0].status, 'PASS');
  assert.deepEqual(phaseOrderErrors(decisions.phaseStatus), []);
  const invalid = structuredClone(decisions.phaseStatus);
  invalid[2].status = 'BLOCKED';
  invalid[3].status = 'IN PROGRESS';
  assert.ok(phaseOrderErrors(invalid).some((e) => e.includes('Predecessor')));
});
test('A forged approval cannot waive open decisions or dependent numeric thresholds', () => {
  const altered = structuredClone(decisions);
  for (const decision of altered.decisions) {
    decision.status = 'OPEN';
    decision.value = null;
  }
  altered.ownerApproval = {
    approvedBy: 'test',
    approvedAt: 'test',
    architectureRevision: 'test',
    sourceMessage: 'synthetic',
  };
  assert.ok(approvalErrors(altered).some((e) => e.includes('Owner decision')));
  assert.ok(approvalErrors(altered, 8).some((e) => e.includes('numeric')));
});
test('Capacity formula includes workers, control, operations and headroom', () => {
  assert.equal(
    connectionBudget({
      apiReplicas: 2,
      apiPools: 3,
      apiConnections: 4,
      workerReplicas: 1,
      workerPools: 2,
      workerConnections: 2,
      controlConnections: 6,
      operationsConnections: 4,
      headroom: 10,
    }),
    48,
  );
  assert.throws(() => connectionBudget({ apiReplicas: -1 }));
});
test('Empty/mock/old evidence cannot certify target runtime', () => {
  assert.equal(validateReceipts(matrix, [], 'target').length, matrix.scenarios.length * 2);
  const mock = {
    scenarioId: matrix.scenarios[0].id,
    mode: 'pooled',
    status: 'PASS',
    exitCode: 0,
    release: 'old',
    mockOnly: true,
    tenants: ['A', 'B', 'C'],
    evidenceKind: 'fresh-build',
    artifacts: [],
  };
  assert.ok(validateReceipts(matrix, [mock], 'target').some((e) => e.includes('Unverified')));
});
test('Required documents and referenced requirement files exist', () => {
  for (const file of [...matrix.requiredDocuments, ...matrix.requirements.map((r) => r.document)])
    assert.ok(fs.existsSync(file), file);
  for (const n of ['030', '031', '032', '033', '034', '035'])
    assert.equal(
      fs.readdirSync('documentation/decisions').filter((f) => f.startsWith(n + '-')).length,
      1,
    );
});

test('Owner-approved bounded deferrals admit Phase 02 but block their dependent phases', () => {
  assert.deepEqual(approvalErrors(decisions, 2), []);
  assert.ok(approvalErrors(decisions, 3).some((e) => e.includes('OWNER-SCALE')));
  assert.ok(approvalErrors(decisions, 3).some((e) => e.includes('maxDatabaseConnections')));
});
