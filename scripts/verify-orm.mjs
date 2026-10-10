import assert from 'node:assert/strict';
import fs from 'node:fs';
import { config, sql } from '../database/scripts/db.mjs';
const manifest = JSON.parse(
  fs.readFileSync(new URL('../database/schema-manifest.json', import.meta.url), 'utf8'),
);
const cfg = config();
let count = 0,
  columns = 0,
  foreignKeys = 0;
for (const service of ['identity', 'catalog', 'media', 'inquiries']) {
  const schema = fs.readFileSync(
    new URL('../services/' + service + '/prisma/schema.prisma', import.meta.url),
    'utf8',
  );
  assert.ok(!schema.includes('previewFeatures'), service + ' must use stable Prisma features');
  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => ({
    name: m[1],
    body: m[2],
    table: JSON.parse(/@@map\(("[^"]+")\)/.exec(m[2])?.[1] ?? JSON.stringify(m[1])),
    schema: JSON.parse(/@@schema\(("[^"]+")\)/.exec(m[2])?.[1] ?? '"public"'),
  }));
  const names = new Map(models.map((model) => [model.name, model]));
  const expected = manifest.databases['business_platform_' + service];
  assert.equal(models.length, expected.length, service + ' model count');
  for (const model of models) {
    const name = model.schema + '.' + model.table;
    const original = expected.find((t) => t.schema === model.schema && t.table === model.table);
    assert.ok(original, 'Unexpected Prisma model: ' + name);
    const fields = [
      ...model.body.matchAll(/^[ \t]*(\w+)[ \t]+(\w+)([?\[\]]*)[ \t]*([^\n]*)/gm),
    ].map((m) => ({ name: m[1], type: m[2], suffix: m[3], attributes: m[4] }));
    const scalar = fields.filter((field) => !names.has(field.type));
    assert.equal(scalar.length, original.columns.length, name + ' column count');
    for (const field of scalar) {
      const physical = /@map\("([^"]+)"\)/.exec(field.attributes)?.[1] ?? field.name;
      const source = original.columns.find((c) => c.name === physical);
      assert.ok(source, name + '.' + physical + ' must exist');
      const types = {
        String: field.attributes.includes('@db.Uuid') ? 'uuid' : 'text',
        Int: field.attributes.includes('@db.SmallInt') ? 'smallint' : 'integer',
        BigInt: 'bigint',
        Bytes: 'bytea',
        Json: 'jsonb',
        Boolean: 'boolean',
        DateTime: 'timestamp with time zone',
        Decimal:
          'numeric(' +
          (/\@db.Decimal\(([^)]+)\)/.exec(field.attributes)?.[1] ?? '').replaceAll(' ', '') +
          ')',
      };
      assert.equal(
        types[field.type] + (field.suffix === '[]' ? '[]' : ''),
        source.type,
        name + '.' + physical + ' type',
      );
      assert.equal(field.suffix === '?', source.nullable, name + '.' + physical + ' nullability');
      const database = /@default\(dbgenerated\(("(?:[^"\\]|\\.)*")\)\)/.exec(field.attributes);
      const literal = /@default\(("(?:[^"\\]|\\.)*"|true|false|\d+)\)/.exec(field.attributes);
      let value = database ? JSON.parse(database[1]) : (literal?.[1] ?? null);
      if (!database && field.suffix === '[]' && /@default\(\[\]\)/.test(field.attributes))
        value = "'{}'::" + types[field.type] + '[]';
      if (!database && literal?.[1].startsWith('"'))
        value =
          "'" +
          JSON.parse(literal[1]).replaceAll("'", "''") +
          "'::" +
          (field.type === 'Json' ? 'jsonb' : 'text');
      assert.equal(
        value,
        source.default,
        name + '.' + physical + ' database default/generated expression',
      );
      columns++;
    }
    const pk =
      /@@id\(\[([^\]]+)\]\)/
        .exec(model.body)?.[1]
        .split(',')
        .map((s) => s.trim()) ??
      scalar.filter((field) => /@id\b/.test(field.attributes)).map((field) => field.name);
    const sourcePk = original.constraints.find((c) => c.startsWith('PRIMARY KEY ('));
    assert.deepEqual(
      pk,
      sourcePk
        ? sourcePk
            .slice(13, -1)
            .split(',')
            .map((s) => s.trim())
        : [],
      name + ' primary key',
    );
    for (const constraint of original.constraints.filter((c) => c.startsWith('FOREIGN KEY ('))) {
      const match = /^FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\.(\w+)\(([^)]+)\)/.exec(constraint);
      assert.ok(match, 'Unsupported FK metadata: ' + name);
      const found = fields.some((field) => {
        const relation = /fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\]/.exec(
            field.attributes,
          ),
          target = names.get(field.type);
        return (
          relation &&
          target &&
          relation[1].replaceAll(' ', '') === match[1].replaceAll(' ', '') &&
          relation[2].replaceAll(' ', '') === match[4].replaceAll(' ', '') &&
          target.schema === match[2] &&
          target.table === match[3]
        );
      });
      assert.ok(found, name + ' missing Prisma foreign key: ' + constraint);
      foreignKeys++;
    }
    if (model.table === 'write_gate')
      assert.ok(model.body.includes('@@ignore'), 'Private write gate must have no Prisma API');
    count++;
  }
  const installed = JSON.parse(sql(cfg, service, sqlCatalog(service), true));
  assert.deepEqual(
    installed,
    expected,
    service + ' installed columns/constraints/indexes/triggers disagree with reviewed manifest',
  );
  console.log(
    'PASS Prisma and runtime catalog parity: ' + service + ' (' + models.length + ' models)',
  );
}
assert.equal(count, manifest.physicalTables);
console.log(
  'PASS ' +
    count +
    ' Prisma models, ' +
    columns +
    ' columns, ' +
    foreignKeys +
    ' foreign keys and all installed SQL constraints/indexes/triggers.',
);
function sqlCatalog(service) {
  return `SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,
    'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
    'constraints',(SELECT coalesce(jsonb_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname),'[]'::jsonb) FROM pg_constraint k WHERE k.conrelid=c.oid),
    'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid::regclass::text),'[]'::jsonb) FROM pg_index i WHERE i.indrelid=c.oid),
    'triggers',(SELECT coalesce(jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname),'[]'::jsonb) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)) ORDER BY n.nspname,c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('${service}','ops')`;
}
