// Reproduce the v1.1 table dictionary verbatim; hand-written behavior follows it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const db = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const text = fs.readFileSync(path.join(db, 'docs/design-v1.1.md'), 'utf8');
const region = text.split('## V1.1.11 Complete column, relationship and index dictionary')[1].split('## Base schema and architecture')[0];
const sections = [...region.matchAll(/^### `catalog\.(\w+)`\r?\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)];
if (sections.length !== 16) throw new Error(`Expected 16 tables, found ${sections.length}`);
let ddl = '\\set ON_ERROR_STOP on\n-- Catalog v1.1 additive migration. Run once with psql --single-transaction.\n\n';
for (const [, name, body] of sections) {
  const columns = [...body.matchAll(/^\| `(\w+)` \| `([^`]+)` \|/gm)].map(([, c, def]) => `  ${c} ${def.replaceAll('&#124;', '|')}`);
  const constraints = body.match(/Additional constraints:\r?\n\r?\n```sql\r?\n([\s\S]*?)```/);
  if (constraints) columns.push(...constraints[1].trim().split(/\r?\n/).map(c => `  ${c}`));
  ddl += `CREATE TABLE catalog.${name} (\n${columns.join(',\n')}\n);\n`;
  const indexBlock = body.match(/Indexes \(primary keys[\s\S]*?```sql\r?\n([\s\S]*?)```/);
  if (indexBlock) ddl += indexBlock[1].trim() + '\n';
  ddl += `CREATE TRIGGER a_update_guard BEFORE UPDATE ON catalog.${name}\nFOR EACH ROW EXECUTE FUNCTION ops.guard_row_update();\nCREATE TRIGGER no_physical_delete BEFORE DELETE OR TRUNCATE ON catalog.${name}\nFOR EACH STATEMENT EXECUTE FUNCTION ops.reject_physical_delete();\n`;
  const fields = body.match(/Immutable relationship\/semantic fields: ([^\r\n]+)/)?.[1];
  if (fields) {
    const args = [...fields.matchAll(/`(\w+)`/g)].map(([, f]) => `'${f}'`).join(',');
    ddl += `CREATE TRIGGER semantics_immutable BEFORE UPDATE ON catalog.${name}\nFOR EACH ROW EXECUTE FUNCTION ops.immutable_fields(${args});\n`;
  }
  ddl += `CREATE TRIGGER z_catalog_write_guard BEFORE INSERT OR UPDATE ON catalog.${name}\nFOR EACH STATEMENT EXECUTE FUNCTION catalog.guard_write_statement();\nCREATE CONSTRAINT TRIGGER z_catalog_integrity AFTER INSERT OR UPDATE ON catalog.${name}\nDEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog.validate_deferred();\n\n`;
}
ddl += '\\ir 09_technical_integrity.sql\n';
fs.writeFileSync(path.join(db, 'sql/09_technical_sheets.sql'), ddl);
console.log('Generated the 16 technical tables, constraints, indexes and lifecycle triggers.');
