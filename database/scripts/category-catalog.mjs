import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config, file, grantRuntime } from './db.mjs';
import { digest, planCategoryCatalog, verifyReviewedPlan } from './category-catalog-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const identifier = (value) => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(value)) throw new Error('Invalid database role identifier.');
  return '"' + value + '"';
};
export async function connectCatalog(cfg) {
  const service = cfg.services.catalog;
  const owner = identifier(service.owner);
  const client = new pg.Client({ host: '127.0.0.1', port: cfg.port, database: service.database, user: cfg.adminUser, password: cfg.adminPassword });
  try {
    await client.connect();
    await client.query('SET ROLE ' + owner);
    return client;
  } catch (error) { await client.end(); throw error; }
}

export async function inventoryCatalog(client) {
  const database = (await client.query('SELECT current_database() AS name')).rows[0].name;
  const rows = async (query) => (await client.query(query)).rows;
  // A PostgreSQL client owns one connection; run inventory reads sequentially
  // within the same repeatable-read snapshot rather than queue concurrent queries.
  const queries = [
    'SELECT id::text,code,version::text,schema_revision::text,deprecated_at FROM catalog.product_types WHERE deleted_at IS NULL ORDER BY id',
    'SELECT id::text,parent_id::text,version::text FROM catalog.categories WHERE deleted_at IS NULL ORDER BY id',
    'SELECT id::text,category_id::text,product_type_id::text,version::text,is_active FROM catalog.products WHERE deleted_at IS NULL ORDER BY id',
    'SELECT id::text,code,version::text FROM catalog.specification_groups WHERE deleted_at IS NULL ORDER BY id',
    'SELECT id::text,product_type_id::text,group_id::text,sort_order::text,version::text FROM catalog.product_type_groups WHERE deleted_at IS NULL ORDER BY id',
    'SELECT id::text,product_type_id::text,definition_id::text,type_group_id::text,sort_order::text,is_required,is_public,is_searchable,is_filterable,is_comparable,version::text FROM catalog.product_type_specifications WHERE deleted_at IS NULL ORDER BY id',
    'SELECT id::text,code,value_type,unit_code,minimum_value::text,maximum_value::text,is_public,is_filterable,allow_multiple,text_multiline,text_max_length,deprecated_at,version::text FROM catalog.specification_definitions WHERE deleted_at IS NULL ORDER BY id',
  ];
  const results = [];
  for (const query of queries) results.push(await rows(query));
  const [types, categories, products, groups, placements, assignments, definitions] = results;
  const valueParity = {};
  for (const table of ['product_specification_values', 'product_specification_texts', 'product_specification_choices']) {
    const row = (await client.query(`SELECT count(*)::text AS total,count(*) FILTER(WHERE deleted_at IS NULL)::text AS live,
      md5(coalesce(string_agg(row_to_json(value)::text,E'\n' ORDER BY id),'')) AS content_hash FROM catalog.${table} value`)).rows[0];
    valueParity[table] = row;
  }
  const state = { database, types, categories, products, groups, placements, assignments, definitions, valueParity };
  return { ...state, inventoryHash: digest(state), observedAt: new Date().toISOString(), readOnly: true };
}

async function localFile(name) {
  if (!name) throw new Error('An explicit .local file path is required.');
  const resolved = path.resolve(root, name), directory = path.resolve(root, '.local');
  const relative = path.relative(directory, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Raw inventory/mapping files must stay within this workspace .local directory.');
  if (/^database\.(?:json|env)$|^service-secrets\.json$/i.test(relative)) throw new Error('Existing local configuration cannot be overwritten.');
  // Reject junctions/symlinks before reading or writing review artifacts. A lexical
  // workspace prefix alone does not establish the actual filesystem destination.
  let current = directory;
  for (const component of ['', ...relative.split(path.sep)]) {
    if (component) current = path.join(current, component);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Review artifact paths cannot contain filesystem links.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return resolved;
}
async function writeLocal(name, value) {
  const target = await localFile(name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

async function cli() {
  const [command, ...args] = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index], value = args[index + 1];
    if (!['--output', '--mapping', '--resolutions', '--confirm-database'].includes(name) || !value || value.startsWith('--') || name in options)
      throw new Error('Unknown, missing or duplicate command option.');
    options[name] = value;
  }
  if (!['inventory', 'propose', 'expand', 'backfill', 'validate', 'cutover'].includes(command))
    throw new Error('Use inventory, propose, expand, backfill, validate or cutover.');
  const cfg = config(), database = cfg.services.catalog.database;
  if (['expand', 'backfill', 'cutover'].includes(command) && options['--confirm-database'] !== database)
    throw new Error('Writes require --confirm-database matching the exact owning Catalog database.');
  if (command === 'expand') {
    file(cfg, 'catalog', 'sql/23_category_schema_expand.sql', { owner: true, atomic: true });
    console.log('PASS additive Category schema expansion; existing authority remains unchanged.');
    return;
  }
  const client = await connectCatalog(cfg);
  try {
    const writer = ['backfill', 'cutover'].includes(command);
    await client.query(writer ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='30s'");
    if (writer) await client.query('SELECT catalog.lock_write()');
    const inventory = await inventoryCatalog(client);
    if (command === 'inventory') await writeLocal(options['--output'], inventory);
    if (command === 'propose') {
      const resolutions = options['--resolutions'] ? JSON.parse(await fs.readFile(await localFile(options['--resolutions']), 'utf8')) : {};
      const proposal = planCategoryCatalog(inventory, resolutions);
      await writeLocal(options['--output'], proposal);
      console.log(JSON.stringify({ reviewed: false, issues: proposal.issues, categories: proposal.categoryGroups.length, groupAttributes: proposal.groupAttributes.length }));
    }
    if (['backfill', 'validate', 'cutover'].includes(command)) {
      const mapping = JSON.parse(await fs.readFile(await localFile(options['--mapping']), 'utf8'));
      const plan = verifyReviewedPlan(inventory, mapping);
      if (command === 'backfill') {
        for (const row of plan.groupAttributes) {
          await client.query(`INSERT INTO catalog.attribute_group_attributes(id,group_id,definition_id,sort_order,is_required,is_public,is_searchable,is_filterable,is_comparable)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
          [row.id,row.group_id,row.definition_id,row.sort_order,row.is_required,row.is_public,row.is_searchable,row.is_filterable,row.is_comparable]);
        }
        for (const row of plan.categoryGroups)
          await client.query('INSERT INTO catalog.category_attribute_groups(id,category_id,group_id,sort_order) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING', [row.id,row.category_id,row.group_id,row.sort_order]);
      }
      const actualGroups = (await client.query('SELECT id::text,category_id::text,group_id::text,sort_order::text FROM catalog.category_attribute_groups WHERE deleted_at IS NULL ORDER BY id')).rows;
      const actualMembers = (await client.query('SELECT id::text,group_id::text,definition_id::text,sort_order::text,is_required,is_public,is_searchable,is_filterable,is_comparable FROM catalog.attribute_group_attributes WHERE deleted_at IS NULL ORDER BY id')).rows;
      if (digest(actualGroups) !== digest(plan.categoryGroups) || digest(actualMembers) !== digest(plan.groupAttributes)) throw new Error('Actual relationship rows differ from the reviewed mapping; no overwrite is permitted.');
      const after = await inventoryCatalog(client);
      if (digest(after.valueParity) !== digest(plan.valueParity)) throw new Error('Typed-value identity/content parity failed.');
      await client.query('SELECT catalog.assert_valid_category_relationships()');
      console.log('PASS reviewed relationships and exact retained typed-value parity.');
      if (command === 'cutover') {
        // Keep review validation, the owning write gate and authority switch in one transaction.
        // This reviewed SQL has no psql include/variable commands beyond ON_ERROR_STOP.
        const source = await fs.readFile(path.join(root, 'database/sql/24_category_schema_cutover.sql'), 'utf8');
        const sql = source.replace(/^\\set ON_ERROR_STOP on\r?\n/, '');
        if (/^\s*\\/m.test(sql)) throw new Error('Cutover contains unsupported psql commands.');
        await client.query(sql);
      }
    }
    await client.query('COMMIT');
    if (command === 'cutover') {
      grantRuntime(cfg, 'catalog');
      console.log('PASS category authority cutover and owning runtime grants.');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  cli().catch((error) => { console.error(error.message); process.exitCode = 1; });
