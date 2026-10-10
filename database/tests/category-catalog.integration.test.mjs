import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import pg from 'pg';
import { file, grantRuntime } from '../scripts/db.mjs';
import { connectCatalog, inventoryCatalog } from '../scripts/category-catalog.mjs';
import { digest, planCategoryCatalog, verifyReviewedPlan } from '../scripts/category-catalog-plan.mjs';

// Only an explicitly selected task-owned disposable cluster may run these tests.
const profilePath = process.env.BUSINESS_PLATFORM_DATABASE_CONFIG_FILE;
if (!profilePath) throw new Error('Select the disposable BUSINESS_PLATFORM_DATABASE_CONFIG_FILE profile.');
const cfg = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
if (cfg.adminUser !== 'b5_disposable_admin' || !path.resolve(profilePath).startsWith(path.resolve('.local/b5-validation-')))
  throw new Error('Catalog migration tests require a task-owned disposable profile.');
const name = 'category_migration_' + randomUUID().replaceAll('-', '');
const service = { ...cfg.services.catalog, database: name };
const profile = { ...cfg, services: { ...cfg.services, catalog: service } };
const privateDirectory = fs.mkdtempSync(path.resolve('.local/category-migration-test-'));
const privateProfile = path.join(privateDirectory, 'profile.json');
const mappingFile = path.join(privateDirectory, 'mapping.json');
fs.writeFileSync(privateProfile, JSON.stringify(profile), { mode: 0o600 });
function command(operation, mapping) {
  if (mapping) fs.writeFileSync(mappingFile, JSON.stringify(mapping), { mode: 0o600 });
  return spawnSync(process.execPath, ['database/scripts/category-catalog.mjs', operation, '--mapping', mappingFile, '--confirm-database', name, ...(operation === 'retire-binding' ? ['--output', path.join(privateDirectory, 'retirement.json')] : [])],
    { env: { ...process.env, BUSINESS_PLATFORM_DATABASE_CONFIG_FILE: privateProfile }, encoding: 'utf8', windowsHide: true });
}
let admin, client;
const ids = Object.fromEntries(['category', 'group', 'otherGroup', 'definition', 'type', 'placement', 'assignment', 'product', 'media', 'asset', 'value'].map((key) => [key, randomUUID()]));
async function transaction(work) {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try { const result = await work(); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
}
async function category(parent = null) {
  const id = randomUUID();
  await client.query('INSERT INTO catalog.categories(id,parent_id) VALUES($1,$2)', [id, parent]);
  await client.query("INSERT INTO catalog.category_translations(category_id,locale,name) VALUES($1,'ar','Synthetic category')", [id]);
  return id;
}
async function group() {
  const id = randomUUID();
  await client.query('INSERT INTO catalog.specification_groups(id,code) VALUES($1::uuid,$1::text)', [id]);
  await client.query("INSERT INTO catalog.specification_group_translations(group_id,locale,name) VALUES($1,'ar','Synthetic group')", [id]);
  return id;
}
before(async () => {
  admin = new pg.Client({ host: '127.0.0.1', port: cfg.port, database: 'postgres', user: cfg.adminUser, password: cfg.adminPassword });
  await admin.connect();
  const dataDirectory = path.resolve((await admin.query('SHOW data_directory')).rows[0].data_directory);
  const expectedDirectory = path.resolve(path.dirname(profilePath), 'postgres');
  assert.equal(dataDirectory.toLowerCase(), expectedDirectory.toLowerCase(), 'Disposable port must belong to the selected task-owned data directory.');
  await admin.query(`CREATE DATABASE ${name} OWNER ${service.owner} TEMPLATE template0 ENCODING 'UTF8'`);
  file(profile, 'catalog', 'sql/22_catalog_admin_fresh.sql', { owner: true, atomic: true });
  grantRuntime(profile, 'catalog');
  file(profile, 'catalog', 'sql/23_category_schema_expand.sql', { owner: true, atomic: true });
  client = await connectCatalog(profile);
});
after(async () => {
  if (client) await client.end();
  if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await admin.end(); }
  if (path.dirname(privateDirectory) !== path.resolve('.local') || !path.basename(privateDirectory).startsWith('category-migration-test-'))
    throw new Error('Refusing to remove an unowned migration-test directory.');
  fs.rmSync(privateDirectory, { recursive: true });
});

test('reviewed backfill retains a real exact numeric value, its identity and the old product schema authority', async () => {
  await transaction(async () => {
    ids.category = await category(); ids.group = await group();
    await client.query('INSERT INTO catalog.specification_definitions(id,code,value_type,is_public) VALUES($1::uuid,$1::text,\'NUMBER\',true)', [ids.definition]);
    await client.query("INSERT INTO catalog.specification_translations(definition_id,locale,label) VALUES($1,'ar','Synthetic length')", [ids.definition]);
    await client.query('INSERT INTO catalog.product_types(id,code) VALUES($1::uuid,$1::text)', [ids.type]);
    await client.query("INSERT INTO catalog.product_type_translations(product_type_id,locale,name) VALUES($1,'ar','Synthetic legacy type')", [ids.type]);
    await client.query('INSERT INTO catalog.product_type_groups(id,product_type_id,group_id) VALUES($1,$2,$3)', [ids.placement, ids.type, ids.group]);
    await client.query('INSERT INTO catalog.product_type_specifications(id,product_type_id,definition_id,is_public) VALUES($1,$2,$3,true)', [ids.assignment, ids.type, ids.definition]);
    await client.query("INSERT INTO catalog.media_asset_refs(id,media_kind,source_version,ready_at) VALUES($1,'IMAGE',1,clock_timestamp())", [ids.asset]);
    await client.query('INSERT INTO catalog.products(id,category_id,product_type_id,cover_media_id) VALUES($1,$2,$3,$4)', [ids.product, ids.category, ids.type, ids.media]);
    await client.query("INSERT INTO catalog.product_translations(product_id,locale,name) VALUES($1,'ar','Synthetic product')", [ids.product]);
    await client.query('INSERT INTO catalog.product_media(id,product_id,asset_id) VALUES($1,$2,$3)', [ids.media, ids.product, ids.asset]);
    const reservation = (await client.query('INSERT INTO catalog.product_code_reservations(product_id,code) VALUES($1::uuid,$1::text) RETURNING id', [ids.product])).rows[0];
    await client.query('UPDATE catalog.products SET current_model_code_id=$1 WHERE id=$2', [reservation.id, ids.product]);
    await client.query("INSERT INTO catalog.product_specification_values(id,product_id,definition_id,value_type,number_value) VALUES($1,$2,$3,'NUMBER','99999999999999.123456')", [ids.value, ids.product, ids.definition]);
    for (const [index, kind] of ['BOOLEAN', 'TEXT', 'CHOICE'].entries()) {
      const definition = randomUUID(), valueId = randomUUID();
      await client.query('INSERT INTO catalog.specification_definitions(id,code,value_type,is_public,allow_multiple) VALUES($1::uuid,$1::text,$2,true,$3)', [definition, kind, kind === 'CHOICE']);
      await client.query("INSERT INTO catalog.specification_translations(definition_id,locale,label) VALUES($1,'ar',$2)", [definition, 'Synthetic ' + kind]);
      await client.query('INSERT INTO catalog.product_type_specifications(product_type_id,definition_id,type_group_id,sort_order,is_public) VALUES($1,$2,$3,$4,true)', [ids.type, definition, ids.placement, String((index + 2) * 1024)]);
      await client.query('INSERT INTO catalog.product_specification_values(id,product_id,definition_id,value_type,boolean_value) VALUES($1,$2,$3,$4,$5)', [valueId, ids.product, definition, kind, kind === 'BOOLEAN' ? false : null]);
      if (kind === 'TEXT') {
        await client.query("INSERT INTO catalog.product_specification_texts(value_id,locale,text_value) VALUES($1,'ar','نص محفوظ'),($1,'en','Retained translation')", [valueId]);
        await client.query("UPDATE catalog.product_specification_texts SET deleted_at=clock_timestamp() WHERE value_id=$1 AND locale='en'", [valueId]);
      }
      if (kind === 'CHOICE') {
        for (let optionIndex = 0; optionIndex < 2; optionIndex++) {
          const option = randomUUID();
          await client.query('INSERT INTO catalog.specification_options(id,definition_id,code) VALUES($1,$2,$3)', [option, definition, 'OPTION-' + optionIndex]);
          await client.query("INSERT INTO catalog.specification_option_translations(option_id,locale,label) VALUES($1,'ar','Synthetic option')", [option]);
          await client.query('INSERT INTO catalog.product_specification_choices(value_id,definition_id,option_id) VALUES($1,$2,$3)', [valueId, definition, option]);
          if (optionIndex === 1) await client.query('UPDATE catalog.product_specification_choices SET deleted_at=clock_timestamp() WHERE value_id=$1 AND option_id=$2', [valueId, option]);
        }
      }
    }
  });
  const before = await inventoryCatalog(client);
  assert.equal(planCategoryCatalog(before).issues[0].kind, 'UNGROUPED_ATTRIBUTE');
  const mapping = { ...planCategoryCatalog(before, { [ids.assignment]: ids.group }), reviewed: true };
  verifyReviewedPlan(before, mapping);
  const unreviewed = command('backfill', { ...mapping, reviewed: false });
  assert.equal(unreviewed.status, 1);
  const ambiguous = command('backfill', { ...mapping, resolutions: {} });
  assert.equal(ambiguous.status, 1);
  assert.match(ambiguous.stderr, /ambiguous/);
  assert.equal((await client.query('SELECT count(*)::text AS n FROM catalog.attribute_group_attributes')).rows[0].n, '0');
  const apply = command('backfill', mapping);
  assert.equal(apply.status, 0, apply.stderr);
  assert.match(apply.stdout, /exact retained typed-value parity/);
  const repeat = command('backfill', mapping);
  assert.equal(repeat.status, 0, repeat.stderr);
  const validate = command('validate', mapping);
  assert.equal(validate.status, 0, validate.stderr);
  const stale = command('backfill', { ...mapping, inventoryHash: 'stale' });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /current inventory/);
  const member = mapping.groupAttributes.find((row) => row.definition_id === ids.definition);
  await transaction(() => client.query('UPDATE catalog.attribute_group_attributes SET sort_order=8192 WHERE id=$1', [member.id]));
  const conflict = command('backfill', mapping);
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /no overwrite is permitted/);
  assert.equal((await client.query('SELECT sort_order::text FROM catalog.attribute_group_attributes WHERE id=$1', [member.id])).rows[0].sort_order, '8192');
  await transaction(() => client.query('UPDATE catalog.attribute_group_attributes SET sort_order=$1 WHERE id=$2', [member.sort_order, member.id]));
  const after = await inventoryCatalog(client);
  assert.equal(before.valueParity.product_specification_values.live, '4');
  assert.equal(before.valueParity.product_specification_texts.total, '2');
  assert.equal(before.valueParity.product_specification_texts.live, '1');
  assert.equal(before.valueParity.product_specification_choices.total, '2');
  assert.equal(before.valueParity.product_specification_choices.live, '1');
  assert.equal(digest(after.valueParity), digest(before.valueParity));
  assert.equal(after.inventoryHash, before.inventoryHash);
  const value = (await client.query('SELECT id::text,number_value::text FROM catalog.product_specification_values WHERE id=$1', [ids.value])).rows[0];
  assert.deepEqual(value, { id: ids.value, number_value: '99999999999999.123456' });
  assert.equal((await client.query('SELECT product_type_id FROM catalog.products WHERE id=$1', [ids.product])).rows[0].product_type_id, ids.type);
});

test('the same attribute in two reusable groups resolves once with conservative disclosure and requiredness OR', async () => {
  await transaction(async () => {
    ids.otherGroup = await group();
    await client.query('INSERT INTO catalog.attribute_group_attributes(group_id,definition_id,is_required,is_public) VALUES($1,$2,true,false)', [ids.otherGroup, ids.definition]);
    await client.query('INSERT INTO catalog.category_attribute_groups(category_id,group_id,sort_order) VALUES($1,$2,2048)', [ids.category, ids.otherGroup]);
  });
  const rows = (await client.query('SELECT definition_id,group_id,is_required,is_public FROM catalog.category_effective_attributes WHERE category_id=$1 AND definition_id=$2', [ids.category, ids.definition])).rows;
  assert.deepEqual(rows, [{ definition_id: ids.definition, group_id: ids.group, is_required: true, is_public: false }]);
  assert.equal((await client.query('SELECT count(*)::text AS n FROM catalog.product_specification_values WHERE product_id=$1 AND definition_id=$2 AND deleted_at IS NULL', [ids.product, ids.definition])).rows[0].n, '1');
});

test('leaf-group ownership blocks attaching a group to a branch and adding children to a configured leaf', async () => {
  const root = await transaction(async () => { const id = await category(); await category(id); return id; });
  await assert.rejects(transaction(() => client.query('INSERT INTO catalog.category_attribute_groups(category_id,group_id) VALUES($1,$2)', [root, ids.group])), (error) => error.code === '23514');
  const emptyLeaf = await transaction(async () => { const id = await category(); await client.query('INSERT INTO catalog.category_attribute_groups(category_id,group_id) VALUES($1,$2)', [id, ids.group]); return id; });
  await assert.rejects(transaction(() => category(emptyLeaf)), (error) => error.code === '23514');
});

test('relationship versions advance while owner identity, physical deletion and duplicate live links stay protected', async () => {
  const row = (await client.query('SELECT id,version::text FROM catalog.attribute_group_attributes WHERE group_id=$1', [ids.otherGroup])).rows[0];
  await transaction(() => client.query('UPDATE catalog.attribute_group_attributes SET sort_order=4096 WHERE id=$1', [row.id]));
  assert.equal((await client.query('SELECT version::text FROM catalog.attribute_group_attributes WHERE id=$1', [row.id])).rows[0].version, (BigInt(row.version) + 1n).toString());
  await assert.rejects(transaction(() => client.query('UPDATE catalog.attribute_group_attributes SET group_id=$1 WHERE id=$2', [ids.group, row.id])), (error) => error.code === '23514');
  await assert.rejects(transaction(() => client.query('DELETE FROM catalog.attribute_group_attributes WHERE id=$1', [row.id])), (error) => error.code === '23514');
  await assert.rejects(transaction(() => client.query('INSERT INTO catalog.attribute_group_attributes(group_id,definition_id) VALUES($1,$2)', [ids.group, ids.definition])), (error) => error.code === '23505');
});

test('soft deleting a reusable group retains typed product content and only retires its live relationships', async () => {
  const before = (await inventoryCatalog(client)).valueParity;
  await transaction(() => client.query('UPDATE catalog.specification_groups SET deleted_at=clock_timestamp() WHERE id=$1', [ids.otherGroup]));
  assert.equal(digest((await inventoryCatalog(client)).valueParity), digest(before));
  assert.equal((await client.query('SELECT count(*)::text AS n FROM catalog.category_attribute_groups WHERE group_id=$1 AND deleted_at IS NULL', [ids.otherGroup])).rows[0].n, '0');
  assert.equal((await client.query('SELECT count(*)::text AS n FROM catalog.attribute_group_attributes WHERE group_id=$1 AND deleted_at IS NULL', [ids.otherGroup])).rows[0].n, '0');
  assert.equal((await client.query('SELECT is_public FROM catalog.category_effective_attributes WHERE category_id=$1 AND definition_id=$2', [ids.category, ids.definition])).rows[0].is_public, true);
});

test('effective eligibility respects global disclosure and filterability even when a membership grants them', async () => {
  await transaction(() => client.query('UPDATE catalog.attribute_group_attributes SET is_filterable=true WHERE group_id=$1', [ids.group]));
  assert.equal((await client.query('SELECT is_public,is_filterable FROM catalog.category_effective_attributes WHERE category_id=$1 AND definition_id=$2', [ids.category, ids.definition])).rows[0].is_filterable, false);
  await transaction(() => client.query('UPDATE catalog.specification_definitions SET is_public=false WHERE id=$1', [ids.definition]));
  assert.deepEqual((await client.query('SELECT is_public,is_filterable FROM catalog.category_effective_attributes WHERE category_id=$1 AND definition_id=$2', [ids.category, ids.definition])).rows[0], { is_public: false, is_filterable: false });
});

test('relationship writes use the existing serialization gate across separate PostgreSQL connections', async () => {
  const other = await connectCatalog(profile);
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query('SELECT catalog.lock_write()');
    await other.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await other.query("SET LOCAL lock_timeout='100ms'");
    await assert.rejects(other.query('UPDATE catalog.attribute_group_attributes SET sort_order=8192 WHERE group_id=$1', [ids.group]), (error) => error.code === '55P03');
    await other.query('ROLLBACK');
    await client.query('ROLLBACK');
  } finally {
    await client.query('ROLLBACK');
    await other.query('ROLLBACK');
    await other.end();
  }
});

test('additive expansion grants neither migration DDL nor new relation writes to the old runtime role', async () => {
  const runtime = new pg.Client({ host: '127.0.0.1', port: cfg.port, database: name, user: service.user, password: service.password });
  await runtime.connect();
  try {
    await assert.rejects(runtime.query('ALTER TABLE catalog.categories ADD COLUMN unauthorized boolean'), (error) => error.code === '42501');
    await assert.rejects(runtime.query('INSERT INTO catalog.category_attribute_groups(category_id,group_id) VALUES($1,$2)', [ids.category, ids.group]), (error) => error.code === '42501');
  } finally { await runtime.end(); }
});

test('reviewed authority cutover retains numeric bytes and permits category-only inactive drafts while blocking incomplete publication', async () => {
  const before = (await inventoryCatalog(client)).valueParity;
  file(profile, 'catalog', 'sql/24_category_schema_cutover.sql', { owner: true, atomic: true });
  grantRuntime(profile, 'catalog');
  assert.equal(digest((await inventoryCatalog(client)).valueParity), digest(before));
  assert.equal((await client.query("SELECT to_regprocedure('catalog.assert_valid_dynamic_catalog()') IS NULL AS retired")).rows[0].retired, true);
  await assert.rejects(transaction(() => client.query('UPDATE catalog.product_types SET updated_at=clock_timestamp() WHERE id=$1', [ids.type])), (error) => error.code === '23514');
  const draft = randomUUID();
  await transaction(async () => {
    await client.query('UPDATE catalog.attribute_group_attributes SET is_required=true WHERE group_id=$1 AND definition_id=$2 AND deleted_at IS NULL', [ids.group, ids.definition]);
    await client.query('INSERT INTO catalog.products(id,category_id,is_active) VALUES($1,$2,false)', [draft, ids.category]);
    await client.query("INSERT INTO catalog.product_translations(product_id,locale,name) VALUES($1,'ar','Synthetic inactive draft')", [draft]);
  });
  await assert.rejects(transaction(() => client.query('UPDATE catalog.products SET is_active=true WHERE id=$1', [draft])), (error) => error.code === '23514');
  const media = randomUUID();
  await transaction(async () => {
    await client.query('INSERT INTO catalog.product_media(id,product_id,asset_id) VALUES($1,$2,$3)', [media, draft, ids.asset]);
    await client.query('UPDATE catalog.products SET cover_media_id=$1 WHERE id=$2', [media, draft]);
  });
  await assert.rejects(transaction(() => client.query('UPDATE catalog.products SET is_active=true WHERE id=$1', [draft])), (error) => error.code === '23514' && /required category/.test(error.message));
  await transaction(async () => {
    await client.query("INSERT INTO catalog.product_specification_values(product_id,definition_id,value_type,number_value) VALUES($1,$2,'NUMBER','0')", [draft, ids.definition]);
    await client.query('UPDATE catalog.products SET is_active=true WHERE id=$1', [draft]);
  });
});

test('category schema revisions follow reusable group and definition changes through their reverse dependencies', async () => {
  const before = (await client.query('SELECT schema_revision::text FROM catalog.categories WHERE id=$1', [ids.category])).rows[0];
  const groupBefore = (await client.query('SELECT version::text FROM catalog.specification_groups WHERE id=$1', [ids.group])).rows[0];
  await transaction(() => client.query('UPDATE catalog.attribute_group_attributes SET sort_order=16384 WHERE group_id=$1 AND deleted_at IS NULL', [ids.group]));
  const after = (await client.query('SELECT schema_revision::text FROM catalog.categories WHERE id=$1', [ids.category])).rows[0];
  assert.ok(BigInt(after.schema_revision) > BigInt(before.schema_revision));
  assert.ok(BigInt((await client.query('SELECT version::text FROM catalog.specification_groups WHERE id=$1', [ids.group])).rows[0].version) > BigInt(groupBefore.version));
  await transaction(() => client.query('UPDATE catalog.specification_definitions SET is_public=true WHERE id=$1', [ids.definition]));
  assert.ok(BigInt((await client.query('SELECT schema_revision::text FROM catalog.categories WHERE id=$1', [ids.category])).rows[0].schema_revision) > BigInt(after.schema_revision));
});

test('category changes retain nonapplicable values but prevent editing or public exposure outside the destination schema', async () => {
  const destination = await transaction(() => category());
  const before = (await inventoryCatalog(client)).valueParity;
  await transaction(() => client.query('UPDATE catalog.products SET category_id=$1,is_active=false WHERE id=$2', [destination, ids.product]));
  assert.equal(digest((await inventoryCatalog(client)).valueParity), digest(before));
  assert.equal((await client.query('SELECT count(*)::text AS n FROM catalog.public_product_specification_values WHERE product_id=$1', [ids.product])).rows[0].n, '0');
  await assert.rejects(transaction(() => client.query('UPDATE catalog.products SET is_active=true WHERE id=$1', [ids.product])), (error) => error.code === '23514' && /retained attributes/.test(error.message));
  await assert.rejects(transaction(() => client.query("UPDATE catalog.product_specification_values SET number_value='2' WHERE id=$1", [ids.value])), (error) => error.code === '23514');
  await transaction(() => client.query('UPDATE catalog.products SET category_id=$1,is_active=true WHERE id=$2', [ids.category, ids.product]));
  assert.equal((await client.query('SELECT number_value::text FROM catalog.product_specification_values WHERE id=$1', [ids.value])).rows[0].number_value, '99999999999999.123456');
});

test('Gateway HTTP returns the authoritative deduplicated category form with locale fallback and rejects non-content roles and unsupported input', async () => {
  const { catalogApplication } = await import('../../services/catalog/dist/composition/application.js');
  const { gatewayApplication } = await import('../../services/gateway/dist/composition/application.js');
  const { httpConfig } = await import('@business-platform/platform');
  const { ApplicationError, uuid, version } = await import('@business-platform/contracts');
  // Reader needs only SELECT, not new configuration write privileges.
  await client.query(`GRANT SELECT ON catalog.category_attribute_groups,catalog.attribute_group_attributes,catalog.category_effective_attributes TO ${service.user}`);
  await transaction(async () => {
    const shared = await group();
    await client.query('INSERT INTO catalog.attribute_group_attributes(group_id,definition_id,is_public) VALUES($1,$2,false)', [shared, ids.definition]);
    await client.query('INSERT INTO catalog.category_attribute_groups(category_id,group_id,sort_order) VALUES($1,$2,32768)', [ids.category, shared]);
  });
  const pool = new pg.Pool({ host: '127.0.0.1', port: cfg.port, database: name, user: service.user, password: service.password });
  const catalog = await catalogApplication(httpConfig('catalog', {}), pool, {
    // Explicit transport fixture; production composition still uses live Identity.
    authenticate: async (request) => {
      if (!request.sessionToken) throw new ApplicationError('UNAUTHENTICATED', 'Staff session required.');
      return { id: uuid(randomUUID()), role: request.sessionToken === 'fixture-super' ? 'SUPER_ADMIN' : 'ADMIN', authVersion: version('1') };
    },
  });
  let gateway;
  try {
    await catalog.listen(0, '127.0.0.1');
    const upstream = await catalog.getUrl();
    gateway = await gatewayApplication(httpConfig('gateway', {}), { catalog: upstream, identity: upstream, media: upstream, inquiries: upstream });
    await gateway.listen(0, '127.0.0.1');
    const url = await gateway.getUrl();
    const base = url + '/api/v1/admin/categories/' + ids.category + '/schema';
    const response = await fetch(base + '?locale=en', { headers: { cookie: 'bp_staff=fixture-admin' } });
    assert.equal(response.status, 200, await response.clone().text());
    const schema = await response.json();
    assert.equal(schema.configuration.categoryId, ids.category);
    assert.equal(schema.form.categoryId, ids.category);
    assert.equal(schema.configuration.groups.length, 2);
    assert.equal(schema.configuration.attributes.length, 4);
    assert.equal(schema.form.fields.length, 4);
    const field = schema.form.fields.find((entry) => entry.definitionId === ids.definition);
    assert.equal(field.required, true);
    assert.equal(field.resolvedLabelLocale, 'ar');
    assert.equal(schema.configuration.attributes.find((entry) => entry.definition.id === ids.definition).public, false);
    assert.equal('productTypeId' in schema.form, false);
    assert.equal((await fetch(base, { headers: { cookie: 'bp_staff=fixture-super' } })).status, 403);
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base + '?unsupported=true', { headers: { cookie: 'bp_staff=fixture-admin' } })).status, 400);
    assert.equal((await fetch(url + '/api/v1/admin/categories/' + randomUUID() + '/schema', { headers: { cookie: 'bp_staff=fixture-admin' } })).status, 404);
  } finally {
    if (gateway) await gateway.close();
    await catalog.close();
  }
});

test('physical binding retirement archives deleted products immutably, retains exact content and view identity, and denies runtime archive access', async () => {
  await transaction(() => client.query('UPDATE catalog.products SET is_active=false,deleted_at=clock_timestamp() WHERE id=$1', [ids.product]));
  const before = await inventoryCatalog(client);
  const bindings = (await client.query('SELECT id::text product_id,product_type_id::text legacy_type_id FROM catalog.products ORDER BY id')).rows;
  const view = (await client.query("SELECT 'catalog.live_products'::regclass::oid::text oid")).rows[0].oid;
  const products = (await client.query("SELECT to_jsonb(p)-'product_type_id' content FROM catalog.products p ORDER BY id")).rows;
  const retire = command('retire-binding');
  assert.equal(retire.status, 0, retire.stderr);
  assert.equal((await client.query("SELECT count(*)::text n FROM information_schema.columns WHERE table_schema='catalog' AND table_name='products' AND column_name='product_type_id'")).rows[0].n, '0');
  assert.deepEqual((await client.query('SELECT product_id::text,legacy_type_id::text FROM catalog.retired_product_bindings ORDER BY product_id')).rows, bindings);
  assert.deepEqual((await client.query('SELECT to_jsonb(p) content FROM catalog.products p ORDER BY id')).rows, products);
  assert.equal((await client.query("SELECT 'catalog.live_products'::regclass::oid::text oid")).rows[0].oid, view);
  const after = await inventoryCatalog(client);
  assert.deepEqual(after.valueParity, before.valueParity);
  assert.equal(after.inventoryHash, before.inventoryHash);
  assert.equal((await client.query('SELECT count(*)::text n FROM catalog.live_products WHERE product_type_id IS NOT NULL')).rows[0].n, '0');
  for (const sql of ['DELETE FROM catalog.retired_product_bindings', 'UPDATE catalog.retired_product_bindings SET legacy_type_id=NULL'])
    await assert.rejects(transaction(() => client.query(sql)), (error) => error.code === '23514');
  const runtime = new pg.Client({ host: '127.0.0.1', port: cfg.port, database: name, user: service.user, password: service.password });
  await runtime.connect();
  try {
    await assert.rejects(runtime.query('SELECT * FROM catalog.retired_product_bindings'), (error) => error.code === '42501');
    assert.equal((await runtime.query('SELECT count(*)::text n FROM catalog.products')).rows[0].n, String(bindings.length));
  } finally { await runtime.end(); }
});
