import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { databaseFixture } from '../../../packages/platform/tests/support/database-fixture.js';
interface Mapping {
  formatVersion: 1;
  database: string;
  reviewed: boolean;
  types: unknown[];
  categoryTypes: unknown[];
  productTypes: unknown[];
  definitionDisclosure: unknown[];
  unitTranslations: unknown[];
}
interface Inventory {
  stage: string;
  genuinelyEmpty: boolean;
  activeProductCount: number;
  deletedProductCount: number;
  records: Record<string, readonly Record<string, unknown>[]>;
}
interface MigrationTools {
  inventory(cfg: unknown): Promise<Inventory>;
  proposedMapping(report: Inventory): Mapping;
  expand(cfg: unknown, options: { confirmDatabase: string }): Promise<unknown>;
  backfill(
    cfg: unknown,
    mapping: Mapping,
    options?: { dryRun?: boolean; confirmDatabase?: string; batchSize?: number },
  ): Promise<{ validation: string; elapsedMs?: number; batchTimingsMs?: readonly number[] }>;
  cutover(cfg: unknown, mapping: Mapping, options: { confirmDatabase: string }): Promise<unknown>;
  validateBackfill(cfg: unknown, mapping: Mapping): Promise<unknown>;
}
const migrations = (await import(
  pathToFileURL(path.join(process.cwd(), 'database/scripts/dynamic-catalog.mjs')).href
)) as MigrationTools;
test('v1.1 technical reference evidence survives cutover without ordinary type assignments', async () => {
  const f = await databaseFixture('catalog', { catalogProfile: 'v1.1' });
  try {
    const fixtureSql = fs
      .readFileSync('database/tests/fixtures/v1.1/technical.sql', 'utf8')
      .split('SET CONSTRAINTS ALL IMMEDIATE;')[0]!
      .replace(/^\uFEFF/, '')
      .replace('\\set ON_ERROR_STOP on', '');
    await f.pool.query(
      'BEGIN ISOLATION LEVEL SERIALIZABLE;\n' +
        fixtureSql.slice(fixtureSql.indexOf('INSERT INTO catalog.media_asset_refs')) +
        '\nCOMMIT;',
    );
    const technicalTables = [
      'technical_measurements',
      'technical_source_observations',
      'technical_notes',
      'technical_note_translations',
      'technical_configurations',
      'technical_conditions',
      'technical_sheet_sources',
      'product_technical_sheets',
    ];
    const snapshot = async () => {
      const rows: Record<string, unknown[]> = {};
      for (const table of technicalTables)
        rows[table] = (
          await f.pool.query('SELECT to_jsonb(t) data FROM catalog.' + table + ' t ORDER BY id')
        ).rows.map((r: { data: unknown }) => r.data);
      return rows;
    };
    const before = await snapshot(),
      report = await migrations.inventory(f.configuration),
      mapping = migrations.proposedMapping(report),
      type = randomUUID(),
      options = { confirmDatabase: f.configuration.services.catalog.database };
    mapping.reviewed = true;
    mapping.types = [
      {
        id: type,
        code: 'synthetic-reference-owner',
        translations: [{ locale: 'ar', name: 'Synthetic reference owner', description: null }],
      },
    ];
    mapping.productTypes = report.records['products']!.filter((p) => p['deleted_at'] === null).map(
      (p) => ({ productId: p['id'], typeId: type }),
    );
    mapping.definitionDisclosure = report.records['specification_definitions']!.map((d) => ({
      definitionId: d['id'],
      public: false,
    }));
    mapping.unitTranslations = report.records['units']!.map((u) => ({
      code: u['code'],
      translations: [{ locale: 'ar', name: 'Synthetic canonical unit' }],
    }));
    await migrations.expand(f.configuration, options);
    await migrations.backfill(f.configuration, mapping, { dryRun: false, ...options });
    await migrations.cutover(f.configuration, mapping, options);
    assert.deepEqual(await snapshot(), before);
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM catalog.product_type_specifications')).rows[0]
        .count,
      '0',
    );
    await assert.rejects(
      f.pool.query(
        "BEGIN ISOLATION LEVEL SERIALIZABLE; UPDATE catalog.specification_definitions SET unit_code=NULL WHERE code='test_width'; COMMIT",
      ),
    );
    await f.pool.query('ROLLBACK');
  } finally {
    await f.dispose();
  }
});
test('empty v1.1 expansion/backfill/cutover invents no types and remains idempotent', async () => {
  const f = await databaseFixture('catalog', { catalogProfile: 'v1.1' });
  try {
    const initial = await migrations.inventory(f.configuration);
    assert.equal(initial.stage, 'v1.1');
    assert.equal(initial.genuinelyEmpty, true);
    const mapping = migrations.proposedMapping(initial);
    mapping.reviewed = true;
    const options = { confirmDatabase: f.configuration.services.catalog.database };
    await migrations.expand(f.configuration, options);
    await migrations.backfill(f.configuration, mapping, { dryRun: false, ...options });
    await migrations.cutover(f.configuration, mapping, options);
    await migrations.cutover(f.configuration, mapping, options);
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM catalog.product_types')).rows[0].count,
      '0',
    );
    assert.equal((await migrations.inventory(f.configuration)).stage, 'final');
  } finally {
    await f.dispose();
  }
});
test('reviewed nonempty migration preserves typed values, codes and deleted rows; dry run/repeated batches are safe', async () => {
  const f = await databaseFixture('catalog', { catalogProfile: 'v1.1' }),
    category = randomUUID(),
    deletedCategory = randomUUID(),
    definition = randomUUID(),
    type = randomUUID(),
    product = randomUUID(),
    deletedProduct = randomUUID(),
    media = randomUUID(),
    deletedMedia = randomUUID(),
    asset = randomUUID(),
    value = randomUUID();
  const client = await f.pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query('INSERT INTO catalog.categories(id) VALUES($1),($2)', [
      category,
      deletedCategory,
    ]);
    await client.query(
      "INSERT INTO catalog.category_translations(category_id,locale,name) VALUES($1,'ar','Synthetic legacy'),($2,'ar','Synthetic deleted legacy')",
      [category, deletedCategory],
    );
    await client.query(
      "INSERT INTO catalog.media_asset_refs(id,media_kind,source_version,ready_at) VALUES($1,'IMAGE',1,clock_timestamp())",
      [asset],
    );
    await client.query(
      'INSERT INTO catalog.products(id,category_id,cover_media_id) VALUES($1,$2,$3),($4,$5,$6)',
      [product, category, media, deletedProduct, deletedCategory, deletedMedia],
    );
    await client.query(
      "INSERT INTO catalog.product_translations(product_id,locale,name) VALUES($1,'ar','Synthetic active legacy'),($2,'ar','Synthetic deleted legacy')",
      [product, deletedProduct],
    );
    await client.query(
      'INSERT INTO catalog.product_media(id,product_id,asset_id) VALUES($1,$2,$3),($4,$5,$3)',
      [media, product, asset, deletedMedia, deletedProduct],
    );
    await client.query(
      "INSERT INTO catalog.specification_definitions(id,code,value_type) VALUES($1,'synthetic-legacy-number','NUMBER')",
      [definition],
    );
    await client.query(
      "INSERT INTO catalog.specification_translations(definition_id,locale,label) VALUES($1,'ar','Synthetic legacy label')",
      [definition],
    );
    await client.query(
      'INSERT INTO catalog.category_specifications(category_id,definition_id) VALUES($1,$2)',
      [category, definition],
    );
    await client.query(
      "INSERT INTO catalog.product_specification_values(id,product_id,definition_id,value_type,number_value) VALUES($1,$2,$3,'NUMBER','90071992547409.123456')",
      [value, product, definition],
    );
    const code = (
      await client.query(
        "INSERT INTO catalog.product_code_reservations(product_id,code) VALUES($1,'SYNTHETIC-RETAINED-MIGRATION') RETURNING id",
        [product],
      )
    ).rows[0].id;
    await client.query('UPDATE catalog.products SET current_model_code_id=$2 WHERE id=$1', [
      product,
      code,
    ]);
    await client.query('SELECT catalog.soft_delete_branch($1,1)', [deletedCategory]);
    await client.query('COMMIT');
    const deletedBefore = (
      await f.pool.query('SELECT to_jsonb(p) data FROM catalog.products p WHERE id=$1', [
        deletedProduct,
      ])
    ).rows[0].data;
    const report = await migrations.inventory(f.configuration),
      mapping = migrations.proposedMapping(report);
    assert.equal(report.activeProductCount, 1);
    assert.equal(report.deletedProductCount, 1);
    assert.equal(report.genuinelyEmpty, false);
    assert.equal(
      report.records['product_specification_values']?.[0]?.['number_value'],
      '90071992547409.123456',
    );
    const options = { confirmDatabase: f.configuration.services.catalog.database };
    await migrations.expand(f.configuration, options);
    await assert.rejects(migrations.backfill(f.configuration, mapping), /review/);
    mapping.reviewed = true;
    mapping.types = [
      {
        id: type,
        code: 'reviewed-synthetic-type',
        translations: [{ locale: 'ar', name: 'Reviewed synthetic type', description: null }],
      },
    ];
    mapping.categoryTypes = [{ categoryId: category, typeId: type }];
    mapping.definitionDisclosure = [{ definitionId: definition, public: false }];
    await assert.rejects(
      migrations.backfill(f.configuration, { ...mapping, categoryTypes: [] }),
      /mapped type/,
    );
    await assert.rejects(
      migrations.backfill(f.configuration, { ...mapping, definitionDisclosure: [] }),
      /Classify/,
    );
    await assert.rejects(migrations.cutover(f.configuration, mapping, options), /incomplete/);
    const dry = await migrations.backfill(f.configuration, mapping);
    assert.equal(dry.validation, 'passed');
    assert.equal(
      (await f.pool.query('SELECT product_type_id FROM catalog.products WHERE id=$1', [product]))
        .rows[0].product_type_id,
      null,
    );
    const batchEvidence = await migrations.backfill(f.configuration, mapping, {
      dryRun: false,
      batchSize: 1,
      ...options,
    });
    const stableAssignment = (
      await f.pool.query('SELECT id FROM catalog.product_type_specifications')
    ).rows[0].id;
    fs.writeFileSync(
      '.local/dynamic-backfill-performance.json',
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          fixture: { activeProducts: 1, deletedProducts: 1, batchSize: 1 },
          elapsedMs: batchEvidence.elapsedMs,
          batchTimingsMs: batchEvidence.batchTimingsMs,
          scope: 'Real-shape synthetic disposable v1.1 upgrade; not a scale/production claim.',
        },
        null,
        2,
      ) + '\n',
    );
    // Simulate interruption before a remaining product batch, using the owner on this disposable DB.
    await f.pool.query(
      "BEGIN ISOLATION LEVEL SERIALIZABLE; UPDATE catalog.products SET product_type_id=NULL WHERE id='" +
        product +
        "'; COMMIT",
    );
    await assert.rejects(migrations.validateBackfill(f.configuration, mapping), /incomplete/);
    await migrations.backfill(f.configuration, mapping, {
      dryRun: false,
      batchSize: 1,
      ...options,
    });
    assert.equal(
      (await f.pool.query('SELECT id FROM catalog.product_type_specifications')).rows[0].id,
      stableAssignment,
    );
    await migrations.validateBackfill(f.configuration, mapping);
    await migrations.cutover(f.configuration, mapping, options);
    assert.equal(
      (await f.pool.query('SELECT product_type_id FROM catalog.products WHERE id=$1', [product]))
        .rows[0].product_type_id,
      type,
    );
    assert.equal(
      (
        await f.pool.query(
          'SELECT number_value::text n FROM catalog.product_specification_values WHERE id=$1',
          [value],
        )
      ).rows[0].n,
      '90071992547409.123456',
    );
    const deletedAfter = (
      await f.pool.query('SELECT to_jsonb(p) data FROM catalog.products p WHERE id=$1', [
        deletedProduct,
      ])
    ).rows[0].data;
    delete deletedAfter.product_type_id;
    assert.deepEqual(deletedAfter, deletedBefore);
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM catalog.product_type_specifications')).rows[0]
        .count,
      '1',
    );
    assert.equal(
      (await f.pool.query('SELECT count(*) FROM catalog.category_specifications')).rows[0].count,
      '1',
    );
    await assert.rejects(
      f.pool.query(
        'BEGIN ISOLATION LEVEL SERIALIZABLE; INSERT INTO catalog.category_specifications(category_id,definition_id) SELECT category_id,definition_id FROM catalog.category_specifications LIMIT 1; COMMIT;',
      ),
    );
    await f.pool.query('ROLLBACK');
  } finally {
    client.release();
    await f.dispose();
  }
});
