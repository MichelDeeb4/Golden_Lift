import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config, file, grantRuntime } from './db.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function fail(message) {
  throw new Error(message);
}
export async function inventory(cfg = config()) {
  const client = new pg.Client({
    host: '127.0.0.1',
    port: cfg.port,
    user: cfg.adminUser,
    password: cfg.adminPassword,
    database: cfg.services.catalog.database,
  });
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables = [
      'products',
      'categories',
      'category_specifications',
      'specification_definitions',
      'specification_translations',
      'specification_options',
      'specification_option_translations',
      'units',
      'product_translations',
      'product_code_reservations',
      'product_media',
      'product_specification_values',
      'product_specification_texts',
      'product_specification_choices',
      'technical_sheets',
      'technical_sheet_sources',
      'technical_configurations',
      'technical_conditions',
      'technical_measurements',
      'technical_source_observations',
      'technical_notes',
      'product_technical_sheets',
      'product_technical_configurations',
      'category_technical_sheets',
    ];
    const records = {};
    for (const table of tables) {
      const columns = (
        await client.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema='catalog' AND table_name=$1 AND data_type IN ('bigint','numeric') ORDER BY ordinal_position",
          [table],
        )
      ).rows.map((r) => r.column_name);
      if (columns.some((c) => !/^[a-z_]+$/.test(c)))
        fail('Unexpected inventory column identifier.');
      const exact = columns.length
        ? ' || jsonb_build_object(' +
          columns.map((c) => "'" + c + "',t." + c + '::text').join(',') +
          ')'
        : '';
      records[table] = (
        await client.query(
          'SELECT to_jsonb(t)' +
            exact +
            ' data FROM catalog.' +
            table +
            ' t ORDER BY ' +
            (table === 'units' ? 'code' : 'id'),
        )
      ).rows.map((r) => r.data);
    }
    const final = (
      await client.query(
        "SELECT to_regprocedure('catalog.assert_valid_dynamic_catalog()') IS NOT NULL final,to_regclass('catalog.product_types') IS NOT NULL expanded",
      )
    ).rows[0];
    await client.query('COMMIT');
    const activeProducts = records.products.filter((p) => p.deleted_at === null);
    return {
      inspectedAt: new Date().toISOString(),
      database: cfg.services.catalog.database,
      inspection: 'succeeded',
      stage: final.final ? 'final' : final.expanded ? 'expanded' : 'v1.1',
      genuinelyEmpty:
        records.products.length === 0 &&
        records.category_specifications.length === 0 &&
        records.specification_definitions.length === 0,
      activeProductCount: activeProducts.length,
      deletedProductCount: records.products.length - activeProducts.length,
      records,
      requiredReview: {
        semanticTypeMapping:
          activeProducts.length > 0 ||
          records.category_specifications.some((a) => a.deleted_at === null),
        globalDisclosure: records.specification_definitions.length > 0,
        unitLabels: records.units.some((u) => u.deleted_at === null),
      },
    };
  } finally {
    await client.end();
  }
}
export function proposedMapping(report) {
  return {
    formatVersion: 1,
    database: report.database,
    reviewed: false,
    types: [],
    categoryTypes: [],
    productTypes: [],
    definitionDisclosure: report.records.specification_definitions
      .filter((d) => d.deleted_at === null)
      .map((d) => ({ definitionId: d.id, public: null })),
    unitTranslations: report.records.units
      .filter((u) => u.deleted_at === null)
      .map((u) => ({ code: u.code, translations: [] })),
    suggestedSignatures: report.records.categories
      .filter((c) => c.deleted_at === null)
      .map((c) => ({
        categoryId: c.id,
        definitionIds: report.records.category_specifications
          .filter((a) => a.category_id === c.id && a.deleted_at === null)
          .map((a) => a.definition_id)
          .sort(),
      })),
    note: 'Signatures are review suggestions only. Supply stable UUIDs and explicit semantic mappings; no types are inferred from category names.',
  };
}
const validUuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function validateTranslations(rows) {
  if (!Array.isArray(rows) || rows.length > 3 || !rows.some((x) => x.locale === 'ar'))
    fail('Reviewed translations require Arabic and at most three locales.');
  const locales = new Set();
  for (const row of rows) {
    if (
      !['ar', 'en', 'ckb'].includes(row.locale) ||
      locales.has(row.locale) ||
      typeof row.name !== 'string' ||
      !row.name.trim() ||
      row.name.length > 300 ||
      (row.description != null &&
        (typeof row.description !== 'string' || row.description.length > 10000))
    )
      fail('Invalid or duplicate reviewed translation.');
    locales.add(row.locale);
  }
}
function assignmentId(typeId, definitionId) {
  const hash = crypto
    .createHash('sha256')
    .update('golden-lift/type-assignment/' + typeId + '/' + definitionId)
    .digest('hex');
  return (
    hash.slice(0, 8) +
    '-' +
    hash.slice(8, 12) +
    '-5' +
    hash.slice(13, 16) +
    '-a' +
    hash.slice(17, 20) +
    '-' +
    hash.slice(20, 32)
  );
}
function migrationPlan(report, mapping) {
  const categoryTypes = new Map(mapping.categoryTypes.map((x) => [x.categoryId, x.typeId])),
    productTypes = new Map(mapping.productTypes.map((x) => [x.productId, x.typeId]));
  const products = report.records.products
    .filter((p) => p.deleted_at === null)
    .map((p) => ({
      productId: p.id,
      typeId: productTypes.get(p.id) ?? categoryTypes.get(p.category_id),
      categoryId: p.category_id,
    }));
  const sources = [
    ...mapping.categoryTypes.map((c) => ({ categoryId: c.categoryId, typeId: c.typeId })),
    ...products.map((p) => ({ categoryId: p.categoryId, typeId: p.typeId })),
  ];
  const assignments = new Map();
  for (const source of sources)
    for (const a of report.records.category_specifications.filter(
      (a) => a.category_id === source.categoryId && a.deleted_at === null,
    )) {
      const key = source.typeId + '/' + a.definition_id,
        existing = assignments.get(key);
      if (existing && existing.sortOrder !== a.sort_order)
        fail(
          'Mapped categories have conflicting attribute ordering; review separate types before backfill.',
        );
      assignments.set(key, {
        id: assignmentId(source.typeId, a.definition_id),
        typeId: source.typeId,
        definitionId: a.definition_id,
        sortOrder: a.sort_order,
        public:
          mapping.definitionDisclosure.find((d) => d.definitionId === a.definition_id)?.public ===
          true,
      });
    }
  const eligibility = [...assignments.values()];
  for (const p of products)
    for (const v of report.records.product_specification_values.filter(
      (v) => v.product_id === p.productId && v.deleted_at === null,
    ))
      if (!eligibility.some((a) => a.typeId === p.typeId && a.definitionId === v.definition_id))
        fail('Reviewed mapping would lose active value eligibility for ' + p.productId + '.');
  return { products, eligibility };
}
export function validateMapping(report, mapping) {
  if (
    mapping.formatVersion !== 1 ||
    mapping.database !== report.database ||
    mapping.reviewed !== true
  )
    fail('Mapping needs explicit review and the exact target database.');
  for (const key of [
    'types',
    'categoryTypes',
    'productTypes',
    'definitionDisclosure',
    'unitTranslations',
  ])
    if (!Array.isArray(mapping[key])) fail('Mapping is missing ' + key + '.');
  const typeIds = new Set(),
    typeCodes = new Set();
  for (const t of mapping.types) {
    if (
      !validUuid(t.id) ||
      typeIds.has(t.id) ||
      typeCodes.has(t.code) ||
      typeof t.code !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(t.code) ||
      !Array.isArray(t.translations) ||
      !t.translations.some((x) => x.locale === 'ar' && typeof x.name === 'string' && x.name.trim())
    )
      fail('Types require unique stable UUIDs/codes and reviewed Arabic names.');
    typeIds.add(t.id);
    typeCodes.add(t.code);
  }
  for (const t of mapping.types) validateTranslations(t.translations);
  const categoryIds = new Set(),
    productIds = new Set();
  for (const row of mapping.categoryTypes) {
    if (
      !validUuid(row.categoryId) ||
      categoryIds.has(row.categoryId) ||
      !typeIds.has(row.typeId) ||
      !report.records.categories.some((c) => c.id === row.categoryId && c.deleted_at === null)
    )
      fail('Invalid or duplicate active category mapping.');
    categoryIds.add(row.categoryId);
  }
  for (const row of mapping.productTypes) {
    if (
      !validUuid(row.productId) ||
      productIds.has(row.productId) ||
      !typeIds.has(row.typeId) ||
      !report.records.products.some((p) => p.id === row.productId && p.deleted_at === null)
    )
      fail('Invalid or duplicate active product mapping.');
    productIds.add(row.productId);
  }
  for (const p of report.records.products.filter((p) => p.deleted_at === null))
    if (
      !mapping.productTypes.some((x) => x.productId === p.id) &&
      !mapping.categoryTypes.some((x) => x.categoryId === p.category_id)
    )
      fail('Every active product needs an explicit mapped type.');
  for (const a of report.records.category_specifications.filter((a) => a.deleted_at === null))
    if (!mapping.categoryTypes.some((x) => x.categoryId === a.category_id))
      fail('Every active legacy eligibility configuration needs an explicit mapped type.');
  const disclosureIds = new Set();
  for (const row of mapping.definitionDisclosure) {
    if (
      typeof row.public !== 'boolean' ||
      disclosureIds.has(row.definitionId) ||
      !report.records.specification_definitions.some(
        (d) => d.id === row.definitionId && d.deleted_at === null,
      )
    )
      fail('Definition disclosure must be explicit and unambiguous.');
    disclosureIds.add(row.definitionId);
  }
  for (const d of report.records.specification_definitions.filter((d) => d.deleted_at === null))
    if (!disclosureIds.has(d.id)) fail('Classify every active legacy definition before cutover.');
  for (const u of report.records.units.filter((u) => u.deleted_at === null))
    if (
      !mapping.unitTranslations.some(
        (x) =>
          x.code === u.code &&
          Array.isArray(x.translations) &&
          x.translations.some(
            (t) => t.locale === 'ar' && typeof t.name === 'string' && t.name.trim(),
          ),
      )
    )
      fail('Every active canonical unit needs reviewed Arabic labels.');
  const unitCodes = new Set();
  for (const u of mapping.unitTranslations) {
    if (
      unitCodes.has(u.code) ||
      !report.records.units.some((x) => x.code === u.code && x.deleted_at === null)
    )
      fail('Invalid or duplicate active unit mapping.');
    unitCodes.add(u.code);
    validateTranslations(u.translations);
  }
  return mapping;
}
export async function backfill(
  cfg,
  mapping,
  { dryRun = true, batchSize = 100, confirmDatabase = null } = {},
) {
  const started = performance.now(),
    batchTimingsMs = [];
  const report = await inventory(cfg);
  validateMapping(report, mapping);
  if (report.stage === 'v1.1') fail('Expand the Catalog before backfill.');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500)
    fail('Backfill batch size must be 1–500.');
  if (!dryRun && confirmDatabase !== cfg.services.catalog.database)
    fail('Applying backfill requires exact --confirm-database.');
  const { products: plans, eligibility } = migrationPlan(report, mapping);
  const result = {
    database: report.database,
    dryRun,
    activeProducts: plans.length,
    deletedProductsUntouched: report.deletedProductCount,
    assignments: eligibility.length,
    batches: Math.ceil(plans.length / batchSize),
    mappingSha256: crypto.createHash('sha256').update(JSON.stringify(mapping)).digest('hex'),
    validation: 'passed',
  };
  if (dryRun) return result;
  const client = new pg.Client({
    host: '127.0.0.1',
    port: cfg.port,
    user: cfg.adminUser,
    password: cfg.adminPassword,
    database: cfg.services.catalog.database,
  });
  await client.connect();
  const owner = cfg.services.catalog.owner;
  if (!/^business_platform_catalog_owner$/.test(owner)) fail('Unexpected migration owner role.');
  const transaction = async (work) => {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      await client.query('SET LOCAL ROLE ' + owner);
      await client.query("SET LOCAL lock_timeout='3s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      await work();
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  };
  try {
    await transaction(async () => {
      for (const t of mapping.types) {
        await client.query(
          'INSERT INTO catalog.product_types(id,code) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',
          [t.id, t.code],
        );
        const row = (
          await client.query('SELECT code,deleted_at FROM catalog.product_types WHERE id=$1', [
            t.id,
          ])
        ).rows[0];
        if (row.code !== t.code || row.deleted_at !== null)
          fail('Retained type conflicts with the reviewed mapping.');
        for (const x of t.translations) {
          if (
            !['ar', 'en', 'ckb'].includes(x.locale) ||
            typeof x.name !== 'string' ||
            !x.name.trim()
          )
            fail('Invalid type translation.');
          await client.query(
            'INSERT INTO catalog.product_type_translations(product_type_id,locale,name,description) SELECT $1,$2,$3,$4 WHERE NOT EXISTS(SELECT 1 FROM catalog.product_type_translations WHERE product_type_id=$1 AND locale=$2 AND deleted_at IS NULL)',
            [t.id, x.locale, x.name, x.description ?? null],
          );
        }
      }
      for (const a of eligibility) {
        await client.query(
          'INSERT INTO catalog.product_type_specifications(id,product_type_id,definition_id,sort_order,is_public) SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS(SELECT 1 FROM catalog.product_type_specifications WHERE product_type_id=$2 AND definition_id=$3 AND deleted_at IS NULL)',
          [a.id, a.typeId, a.definitionId, a.sortOrder, a.public],
        );
        const row = (
          await client.query(
            'SELECT id,sort_order::text,is_public,is_required FROM catalog.product_type_specifications WHERE product_type_id=$1 AND definition_id=$2 AND deleted_at IS NULL',
            [a.typeId, a.definitionId],
          )
        ).rows[0];
        if (
          row.id !== a.id ||
          row.sort_order !== a.sortOrder ||
          row.is_public !== a.public ||
          row.is_required
        )
          fail('Existing assignment conflicts with the stable reviewed mapping.');
      }
      for (const d of mapping.definitionDisclosure)
        await client.query(
          'UPDATE catalog.specification_definitions SET is_public=$2 WHERE id=$1 AND deleted_at IS NULL AND is_public IS DISTINCT FROM $2',
          [d.definitionId, d.public],
        );
      for (const u of mapping.unitTranslations)
        for (const t of u.translations)
          await client.query(
            'INSERT INTO catalog.unit_translations(unit_code,locale,label) SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM catalog.unit_translations WHERE unit_code=$1 AND locale=$2 AND deleted_at IS NULL)',
            [u.code, t.locale, t.name],
          );
    });
    for (let i = 0; i < plans.length; i += batchSize) {
      const batchStarted = performance.now();
      await transaction(async () => {
        for (const p of plans.slice(i, i + batchSize)) {
          const row = (
            await client.query(
              'SELECT product_type_id FROM catalog.products WHERE id=$1 AND deleted_at IS NULL',
              [p.productId],
            )
          ).rows[0];
          if (!row)
            fail('Active product state changed during backfill; pause writes and re-inventory.');
          if (row.product_type_id && row.product_type_id !== p.typeId)
            fail('Product already has a conflicting type.');
          await client.query(
            'UPDATE catalog.products SET product_type_id=$2 WHERE id=$1 AND deleted_at IS NULL AND product_type_id IS NULL',
            [p.productId, p.typeId],
          );
        }
      });
      batchTimingsMs.push(performance.now() - batchStarted);
    }
    return { ...result, elapsedMs: performance.now() - started, batchTimingsMs };
  } finally {
    await client.end();
  }
}
export async function expand(cfg, { confirmDatabase } = {}) {
  if (confirmDatabase !== cfg.services.catalog.database)
    fail('Expansion requires exact --confirm-database.');
  const state = await inventory(cfg);
  if (state.stage !== 'v1.1') return { stage: state.stage, changed: false };
  file(cfg, 'catalog', 'sql/13_dynamic_catalog_expand.sql', { owner: true, atomic: true });
  grantRuntime(cfg, 'catalog');
  return { stage: 'expanded', changed: true };
}
export async function validateBackfill(cfg, mapping) {
  const report = await inventory(cfg);
  validateMapping(report, mapping);
  if (report.stage === 'v1.1') fail('Expand the Catalog before validation.');
  const plan = migrationPlan(report, mapping);
  for (const p of plan.products)
    if (report.records.products.find((x) => x.id === p.productId).product_type_id !== p.typeId)
      fail('Backfill is incomplete or conflicts with the reviewed product mapping.');
  const client = new pg.Client({
    host: '127.0.0.1',
    port: cfg.port,
    user: cfg.adminUser,
    password: cfg.adminPassword,
    database: cfg.services.catalog.database,
  });
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    for (const t of mapping.types) {
      const row = (
        await client.query(
          'SELECT code,deprecated_at FROM catalog.product_types WHERE id=$1 AND deleted_at IS NULL',
          [t.id],
        )
      ).rows[0];
      if (!row || row.code !== t.code || row.deprecated_at !== null)
        fail('Backfilled type differs from the reviewed mapping.');
    }
    for (const a of plan.eligibility) {
      const row = (
        await client.query(
          'SELECT id,sort_order::text,is_public,is_required FROM catalog.product_type_specifications WHERE product_type_id=$1 AND definition_id=$2 AND deleted_at IS NULL',
          [a.typeId, a.definitionId],
        )
      ).rows[0];
      if (
        !row ||
        row.id !== a.id ||
        row.sort_order !== a.sortOrder ||
        row.is_public !== a.public ||
        row.is_required
      )
        fail('Backfill eligibility differs from the reviewed mapping.');
    }
    for (const d of mapping.definitionDisclosure) {
      const row = (
        await client.query(
          'SELECT is_public FROM catalog.specification_definitions WHERE id=$1 AND deleted_at IS NULL',
          [d.definitionId],
        )
      ).rows[0];
      if (row?.is_public !== d.public)
        fail('Backfill disclosure differs from the reviewed mapping.');
    }
    await client.query('COMMIT');
    return {
      database: report.database,
      validation: 'passed',
      activeProducts: plan.products.length,
      assignments: plan.eligibility.length,
    };
  } finally {
    await client.end();
  }
}
export async function cutover(cfg, mapping, { confirmDatabase } = {}) {
  if (confirmDatabase !== cfg.services.catalog.database)
    fail('Cutover requires exact --confirm-database and a coordinated write pause.');
  await validateBackfill(cfg, mapping);
  const state = await inventory(cfg);
  if (state.stage === 'final') return { stage: 'final', changed: false };
  file(cfg, 'catalog', 'sql/14_dynamic_catalog_cutover.sql', { owner: true, atomic: true });
  grantRuntime(cfg, 'catalog');
  return { stage: 'final', changed: true };
}
async function main() {
  const args = process.argv.slice(2),
    command = args.shift() ?? 'inventory',
    options = new Map();
  while (args.length) {
    const key = args.shift();
    if (
      !['--apply', '--mapping', '--batch-size', '--confirm-database', '--output'].includes(key) ||
      options.has(key)
    )
      fail('Unexpected or duplicate CLI option.');
    if (key === '--apply') options.set(key, true);
    else {
      const value = args.shift();
      if (!value || value.startsWith('--')) fail('Missing CLI option value.');
      options.set(key, value);
    }
  }
  const cfg = config(),
    confirmation = options.get('--confirm-database'),
    report = await inventory(cfg);
  let result;
  if (command === 'inventory') result = report;
  else if (command === 'propose') result = proposedMapping(report);
  else if (command === 'expand') result = await expand(cfg, { confirmDatabase: confirmation });
  else {
    const mappingPath = options.get('--mapping');
    if (typeof mappingPath !== 'string') fail('Supply a reviewed --mapping JSON file.');
    const mapping = JSON.parse(fs.readFileSync(path.resolve(mappingPath), 'utf8'));
    if (command === 'backfill')
      result = await backfill(cfg, mapping, {
        dryRun: options.get('--apply') !== true,
        batchSize: Number(options.get('--batch-size') ?? 100),
        confirmDatabase: confirmation,
      });
    else if (command === 'validate') result = await validateBackfill(cfg, mapping);
    else if (command === 'cutover')
      result = await cutover(cfg, mapping, { confirmDatabase: confirmation });
    else fail('Use inventory, propose, expand, backfill, validate or cutover.');
  }
  const output = options.get('--output');
  if (typeof output === 'string') {
    const target = path.resolve(output);
    if (!target.startsWith(root + path.sep) || !target.endsWith('.json'))
      fail('Evidence output must be a JSON file inside this workspace.');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
    console.log('Saved ' + path.relative(root, target));
  } else console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(
      error.code
        ? 'Catalog migration failed (' + error.code + '); inspect operator evidence.'
        : error.message,
    );
    process.exitCode = 1;
  });
