import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const required = [
  'ARCH',
  'DB-SCHEMA',
  'DB-POOL',
  'ISO-RLS',
  'ISO-ROLES',
  'ISO-CONTEXT',
  'ISO-QUERY',
  'ROUTE-FENCE',
  'TRANSFER',
  'AUTH-IDENTITY',
  'AUTH-COMPANY',
  'AUTH-REVOKE',
  'ORG',
  'WORKER',
  'CHANNELS',
  'RECOVERY',
  'OPS',
  'PERF',
  'MASTER',
  'LEDGER',
  'STOCK',
  'TX-ATOMIC',
  'RELEASE',
];
export function validateSpecification(matrix) {
  const errors = [];
  const ids = matrix.requirements.map((r) => r.id);
  if (new Set(ids).size !== ids.length) errors.push('Duplicate requirement ID');
  for (const id of required) if (!ids.includes(id)) errors.push('Missing requirement ' + id);
  for (const name of ['A', 'B', 'C']) {
    const fixture = matrix.fixtures[name];
    if (
      !fixture ||
      fixture.mode !== (name === 'C' ? 'dedicated' : 'pooled') ||
      new Set(fixture.companies).size < 2
    )
      errors.push('Invalid fixture ' + name);
  }
  if (new Set(matrix.scenarios.map((s) => s.id)).size !== matrix.scenarios.length)
    errors.push('Duplicate scenario ID');
  for (const scenario of matrix.scenarios) {
    for (const id of scenario.requirementIds)
      if (!ids.includes(id)) errors.push('Unknown requirement ' + id);
    if (
      !scenario.actions.length ||
      !scenario.assertions.length ||
      !scenario.setup ||
      !scenario.fault ||
      !scenario.cleanup ||
      !scenario.evidenceKind ||
      !scenario.runtimeCommandRequired
    )
      errors.push('Incomplete executable scenario ' + scenario.id);
    if (
      !scenario.modes.includes('pooled') ||
      !scenario.modes.includes('dedicated') ||
      !['A', 'B', 'C'].every((t) => scenario.tenants.includes(t))
    )
      errors.push('Missing mode/fixture ' + scenario.id);
  }
  for (const requirement of matrix.requirements) {
    const scenarios = matrix.scenarios.filter((s) => s.requirementIds.includes(requirement.id));
    if (
      !scenarios.length ||
      !scenarios.some((s) => s.negative) ||
      !scenarios.every((s) => s.phase === requirement.phase)
    )
      errors.push('Uncovered requirement ' + requirement.id);
  }
  if (matrix.requiredDocuments.length !== 6 || new Set(matrix.requiredDocuments).size !== 6)
    errors.push('Six unique architecture deliverables required');
  return errors;
}
export function approvalErrors(state, beforePhase = 2) {
  const errors = [];
  if (
    !state.ownerApproval?.approvedBy ||
    !state.ownerApproval?.approvedAt ||
    !state.ownerApproval?.architectureRevision ||
    !state.ownerApproval?.sourceMessage
  )
    errors.push('Owner architecture approval missing');
  for (const decision of state.decisions) {
    if (!decision.approvedBy || !decision.approvedAt || decision.value === null)
      errors.push('Owner decision open: ' + decision.id);
    if (decision.status === 'DEFERRED') {
      if (!decision.deadlines?.length) errors.push('Deferral lacks deadline: ' + decision.id);
      for (const deadline of decision.deadlines ?? [])
        if (deadline.beforePhase <= beforePhase)
          errors.push('Decision deadline reached: ' + decision.id + ' / ' + deadline.subject);
    } else if (decision.status !== 'APPROVED') errors.push('Owner decision open: ' + decision.id);
  }
  for (const [key, value] of Object.entries(state.targets)) {
    const deadline = state.targetDeadlines?.[key] ?? 2;
    if (
      deadline <= beforePhase &&
      (typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0 ||
        (value === 0 && key !== 'rpoSeconds'))
    )
      errors.push('Approved numeric target missing: ' + key);
  }
  if (state.targets.availabilityPercent > 100)
    errors.push('Availability cannot exceed 100 percent');
  if (
    typeof state.targets.p95Ms === 'number' &&
    typeof state.targets.p99Ms === 'number' &&
    state.targets.p99Ms < state.targets.p95Ms
  )
    errors.push('p99 must not be lower than p95');
  return errors;
}
export function connectionBudget(p) {
  for (const value of Object.values(p))
    if (!Number.isInteger(value) || value < 0)
      throw new Error('Invalid synthetic capacity parameter');
  return (
    p.apiReplicas * p.apiPools * p.apiConnections +
    p.workerReplicas * p.workerPools * p.workerConnections +
    p.controlConnections +
    p.operationsConnections +
    p.headroom
  );
}
export function validateReceipts(matrix, receipts, release, root = process.cwd()) {
  const errors = [];
  for (const scenario of matrix.scenarios)
    for (const mode of scenario.modes) {
      const candidates = receipts.filter((r) => r.scenarioId === scenario.id && r.mode === mode);
      if (candidates.length !== 1) {
        errors.push('Missing or duplicate runtime evidence: ' + scenario.id + '/' + mode);
        continue;
      }
      const r = candidates[0];
      if (
        r.status !== 'PASS' ||
        r.exitCode !== 0 ||
        r.release !== release ||
        r.mockOnly !== false ||
        !r.command ||
        !r.checkedAt ||
        !r.artifacts?.length
      )
        errors.push('Unverified runtime evidence: ' + scenario.id + '/' + mode);
      if (!r.tenants || !['A', 'B', 'C'].every((t) => r.tenants.includes(t)))
        errors.push('Incomplete evidence fixture: ' + scenario.id + '/' + mode);
      if (!r.evidenceKind || r.evidenceKind !== scenario.evidenceKind)
        errors.push('Wrong evidence kind: ' + scenario.id + '/' + mode);
      for (const artifact of r.artifacts ?? []) {
        const target = path.resolve(root, artifact.path);
        if (
          !target.startsWith(path.resolve(root) + path.sep) ||
          !fs.existsSync(target) ||
          !fs.statSync(target).isFile()
        ) {
          errors.push('Missing or unsafe artifact ' + artifact.path);
          continue;
        }
        const actual = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
        if (actual !== artifact.sha256) errors.push('Artifact checksum mismatch ' + artifact.path);
      }
    }
  return errors;
}

export function phaseOrderErrors(phases) {
  const errors = [];
  if (phases.length !== 12 || new Set(phases.map((p) => p.phase)).size !== 12)
    errors.push('Twelve unique phases required');
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    if (
      p.phase !== i + 1 ||
      !['PASS', 'IN PROGRESS', 'BLOCKED', 'FAIL', 'NOT STARTED'].includes(p.status)
    )
      errors.push('Invalid phase state');
    if (i > 0 && p.status !== 'NOT STARTED' && phases[i - 1].status !== 'PASS')
      errors.push('Predecessor gate unpassed: ' + p.phase);
  }
  return errors;
}
