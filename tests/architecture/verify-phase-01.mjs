import fs from 'node:fs';
import {
  readJson,
  validateSpecification,
  approvalErrors,
  validateReceipts,
} from './phase-01-contract.mjs';
const matrix = readJson('docs/specifications/phase-01-acceptance.json'),
  state = readJson('docs/specifications/phase-01-decisions.json');
const mode = process.argv[2] ?? 'specification';
if (!['specification', 'gate', 'runtime'].includes(mode))
  throw new Error('Choose specification, gate or runtime');
const errors = validateSpecification(matrix);
for (const file of matrix.requiredDocuments)
  if (!fs.existsSync(file)) errors.push('Missing ' + file);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
if (mode === 'specification') {
  console.log(
    'PASS: executable specification traceability; ' +
      matrix.requirements.length +
      ' requirements / ' +
      matrix.scenarios.length +
      ' scenarios. Runtime acceptance NOT STARTED.',
  );
  process.exit(0);
}
const beforePhase =
  mode === 'runtime' ? Number(process.argv[5] ?? 12) : Number(process.argv[3] ?? 2);
if (!Number.isInteger(beforePhase) || beforePhase < 2 || beforePhase > 12)
  throw new Error('Phase gate must be 2 through 12');
const blockers = approvalErrors(state, beforePhase);
if (mode === 'runtime') {
  const receiptFile = process.argv[3],
    release = process.argv[4];
  if (!receiptFile || !release || !fs.existsSync(receiptFile))
    blockers.push('Actual target runtime receipts and release identifier missing');
  else {
    const throughPhase = Number(process.argv[5] ?? 12);
    if (!Number.isInteger(throughPhase) || throughPhase < 2 || throughPhase > 12)
      throw new Error('Runtime phase must be 2 through 12');
    blockers.push(
      ...validateReceipts(
        { ...matrix, scenarios: matrix.scenarios.filter((s) => s.phase <= throughPhase) },
        readJson(receiptFile),
        release,
      ),
    );
  }
}
if (blockers.length) {
  console.error('BLOCKED: ' + mode + '\n' + blockers.join('\n'));
  process.exit(2);
}
console.log(
  'PASS: ' +
    mode +
    ' evidence structurally verified; owner review of actual runtime evidence remains required.',
);
