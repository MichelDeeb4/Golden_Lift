import { createHash } from 'node:crypto';
import { ApplicationError, uuid } from '@golden-lift/contracts';
import type { AttributeOptionDto } from '@golden-lift/contracts';
import type {
  ConfigurationTarget,
  SchemaChangeFacts,
  SchemaChangeReader,
} from '../../application/ports/product-schema.js';
import type { Database } from './client.js';
import { PrismaCategorySchemaRepository } from './category-schema-repository.js';
import { PrismaAttributeDefinitionRepository } from './attribute-definition-repository.js';
import { PrismaAttributeGroupRepository } from './attribute-group-repository.js';
import { PrismaUnitRepository } from './unit-repository.js';
import { PrismaProductRepository } from './product-repository.js';
export class PrismaSchemaChangeReader implements SchemaChangeReader {
  constructor(private readonly db: Database) {}
  precondition(scope: unknown, state: string) {
    return (
      's1-' +
      createHash('sha256')
        .update(JSON.stringify(scope) + '\n' + state)
        .digest('hex')
    );
  }
  async facts(target: ConfigurationTarget): Promise<SchemaChangeFacts> {
    const categories = new PrismaCategorySchemaRepository(this.db),
      definitions = new PrismaAttributeDefinitionRepository(this.db),
      products = new PrismaProductRepository(this.db);
    const object =
      target.resource === 'definitions'
        ? await definitions.find(target.id)
        : target.resource === 'options'
          ? await definitions.option(target.id)
          : target.resource === 'groups'
            ? await new PrismaAttributeGroupRepository(this.db).find(target.id)
            : await new PrismaUnitRepository(this.db).find(target.id);
    if (!object) throw new ApplicationError('NOT_FOUND', 'Catalog configuration not found.');
    const definitionId =
      target.resource === 'definitions'
        ? target.id
        : target.resource === 'options'
          ? (object as AttributeOptionDto).definitionId
          : null;
    const affected = await this.db.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT c.id FROM catalog.categories c WHERE c.deleted_at IS NULL AND EXISTS(
        SELECT 1 FROM catalog.category_attribute_groups g LEFT JOIN catalog.attribute_group_attributes a ON a.group_id=g.group_id AND a.deleted_at IS NULL
        LEFT JOIN catalog.specification_definitions d ON d.id=a.definition_id
        WHERE g.category_id=c.id AND g.deleted_at IS NULL AND
          (a.definition_id=${definitionId}::uuid OR (${target.resource === 'units'} AND d.unit_code=${target.id}::text)
          OR g.group_id=${target.resource === 'groups' ? target.id : null}::uuid)) ORDER BY c.id LIMIT 101`;
    if (affected.length > 100)
      throw new ApplicationError(
        'INVALID_STATE',
        'Interactive changes support at most 100 affected categories; use coordinated staged configuration changes.',
      );
    const ids = affected.map((t) => uuid(t.id)),
      schemas = [] as SchemaChangeFacts['schemas'][number][],
      rows = await this.db.products.findMany({
        where: { category_id: { in: ids }, deleted_at: null },
        select: { id: true },
        take: 1001,
      });
    if (rows.length > 1000)
      throw new ApplicationError(
        'INVALID_STATE',
        'Interactive impact validation supports at most 1000 products; stage and partition the change.',
      );
    const flat = [] as SchemaChangeFacts['products'][number][];
    for (const id of ids) {
      schemas.push(await categories.schema(id));
      flat.push(...(await products.productsByCategory(id, 1001)));
    }
    const [usage] = await this.db.$queryRaw<
      { references: string; documents: string; bounds: string[]; state: string }[]
    >`WITH m AS(SELECT m.* FROM catalog.technical_measurements m WHERE m.definition_id=${definitionId}::uuid AND m.deleted_at IS NULL),s AS(SELECT DISTINCT x.id,x.version FROM catalog.technical_sheet_sources x JOIN m ON m.sheet_id=x.sheet_id WHERE x.deleted_at IS NULL AND x.download_enabled) SELECT (SELECT count(*)::text FROM m) references,(SELECT count(*)::text FROM s) documents,coalesce((SELECT array_agg(number_value::text) FROM m WHERE value_state='KNOWN'),ARRAY[]::text[]) bounds,coalesce((SELECT string_agg('m:'||id::text||':'||version::text,',' ORDER BY id) FROM m),'')||coalesce((SELECT string_agg('s:'||id::text||':'||version::text,',' ORDER BY id) FROM s),'') state`;
    const activeReferenceCount =
      target.resource === 'groups'
        ? schemas
            .reduce((n, s) => n + s.groups.filter((g) => g.group.id === target.id).length, 0)
            .toString()
        : target.resource === 'units'
          ? (
              await this.db.specificationDefinitions.count({
                where: { unit_code: target.id, deleted_at: null },
              })
            ).toString()
          : target.resource === 'options'
            ? flat
                .reduce(
                  (n, p) =>
                    n +
                    p.values.filter(
                      (v) =>
                        v.value.kind === 'CHOICE' &&
                        v.value.optionIds.some((id) => id === target.id),
                    ).length,
                  0,
                )
                .toString()
            : (
                BigInt(usage?.references ?? '0') +
                BigInt(
                  schemas.reduce(
                    (n, s) => n + s.attributes.filter((a) => a.definition.id === target.id).length,
                    0,
                  ),
                )
              ).toString();
    return {
      target: object,
      schemas,
      products: flat,
      retainedSemanticUse: definitionId
        ? await products.retainedDefinitionUsage(definitionId)
        : false,
      activeReferenceCount,
      downloadableDocumentCount: usage?.documents ?? '0',
      technicalBounds: usage?.bounds ?? [],
      state:
        JSON.stringify(object) +
        '\n' +
        schemas.map((s) => s.categoryId + ':' + s.schemaRevision).join(',') +
        '\n' +
        (await products.impactState(ids)) +
        '\n' +
        (usage?.state ?? ''),
    };
  }
}
