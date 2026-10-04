import { ApplicationError, uuid, version } from '@golden-lift/contracts';
import type { CatalogTranslation, EffectiveTypeSchema, Uuid } from '@golden-lift/contracts';
import type {
  AssignmentDraft,
  NamedDraft,
  ProductTypeRepository,
} from '../../application/ports/product-schema.js';
import type { Database } from './client.js';
import {
  definitionDto,
  definitionInclude,
  groupDto,
  groupInclude,
  typeDto,
  typeInclude,
} from './configuration-mapping.js';
export class PrismaProductTypeRepository implements ProductTypeRepository {
  constructor(private readonly db: Database) {}
  async find(id: Uuid) {
    const row = await this.db.productTypes.findFirst({
      where: { id, deleted_at: null },
      include: typeInclude,
    });
    return row ? typeDto(row) : null;
  }
  async list(after: Uuid | null, limit: number) {
    return (
      await this.db.productTypes.findMany({
        where: { deleted_at: null, ...(after ? { id: { gt: after } } : {}) },
        include: typeInclude,
        orderBy: { id: 'asc' },
        take: limit,
      })
    ).map(typeDto);
  }
  async create(id: Uuid, input: NamedDraft) {
    await this.db.productTypes.create({ data: { id, code: input.code } });
    await this.putMetadata(id, input.translations);
  }
  async putMetadata(id: Uuid, input: readonly CatalogTranslation[]) {
    await this.db.productTypes.update({ where: { id }, data: { updated_at: new Date() } });
    const rows = await this.db.productTypeTranslations.findMany({
      where: { product_type_id: id, deleted_at: null },
    });
    await this.db.productTypeTranslations.updateMany({
      where: {
        product_type_id: id,
        deleted_at: null,
        locale: { notIn: input.map((t) => t.locale) },
      },
      data: { deleted_at: new Date() },
    });
    for (const t of input) {
      const existing = rows.find((x) => x.locale === t.locale),
        data = { name: t.name, description: t.description };
      if (existing)
        await this.db.productTypeTranslations.update({ where: { id: existing.id }, data });
      else
        await this.db.productTypeTranslations.create({
          data: { product_type_id: id, locale: t.locale, ...data },
        });
    }
  }
  async deprecate(id: Uuid) {
    await this.db.productTypes.update({ where: { id }, data: { deprecated_at: new Date() } });
  }
  async softDelete(id: Uuid) {
    await this.db.productTypes.update({ where: { id }, data: { deleted_at: new Date() } });
  }
  async schema(id: Uuid): Promise<EffectiveTypeSchema> {
    const type = await this.find(id);
    if (!type) throw new ApplicationError('NOT_FOUND', 'Product type not found.');
    const groups = await this.db.productTypeGroups.findMany({
      where: { product_type_id: id, deleted_at: null },
      include: { specification_groups: { include: groupInclude } },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      take: 501,
    });
    const fields = await this.db.productTypeSpecifications.findMany({
      where: { product_type_id: id, deleted_at: null },
      include: { specification_definitions: { include: definitionInclude } },
      orderBy: [{ type_group_id: 'asc' }, { sort_order: 'asc' }, { id: 'asc' }],
      take: 501,
    });
    if (groups.length > 500 || fields.length > 500)
      throw new ApplicationError(
        'INVALID_STATE',
        'Type configuration exceeds the supported bounded editing schema.',
      );
    const groupOrder = new Map(groups.map((g, i) => [g.id, i]));
    fields.sort(
      (a, b) =>
        (groupOrder.get(a.type_group_id ?? '') ?? groups.length) -
          (groupOrder.get(b.type_group_id ?? '') ?? groups.length) ||
        (a.sort_order < b.sort_order
          ? -1
          : a.sort_order > b.sort_order
            ? 1
            : a.id.localeCompare(b.id)),
    );
    return {
      type,
      groups: groups.map((g) => ({
        id: uuid(g.id),
        group: groupDto(g.specification_groups),
        sortOrder: g.sort_order.toString(),
        version: version(g.version.toString()),
      })),
      attributes: fields.map((a) => ({
        id: uuid(a.id),
        definition: definitionDto(a.specification_definitions),
        groupPlacementId: a.type_group_id ? uuid(a.type_group_id) : null,
        sortOrder: a.sort_order.toString(),
        version: version(a.version.toString()),
        required: a.is_required,
        public: a.is_public,
        searchable: a.is_searchable && a.is_public && a.specification_definitions.is_public,
        filterable:
          a.is_filterable &&
          a.is_public &&
          a.specification_definitions.is_public &&
          a.specification_definitions.is_filterable,
        comparable: a.is_comparable && a.is_public && a.specification_definitions.is_public,
      })),
    };
  }
  async putAssignment(typeId: Uuid, id: Uuid, input: AssignmentDraft) {
    const data = {
      product_type_id: typeId,
      definition_id: input.definitionId,
      type_group_id: input.groupPlacementId,
      sort_order: BigInt(input.sortOrder),
      is_required: input.required,
      is_public: input.public,
      is_searchable: input.searchable,
      is_filterable: input.filterable,
      is_comparable: input.comparable,
    };
    const row = await this.db.productTypeSpecifications.findFirst({
      where: { id, product_type_id: typeId, deleted_at: null },
    });
    if (row) await this.db.productTypeSpecifications.update({ where: { id }, data });
    else await this.db.productTypeSpecifications.create({ data: { id, ...data } });
  }
  async removeAssignment(id: Uuid) {
    await this.db.productTypeSpecifications.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }
  async putGroup(typeId: Uuid, id: Uuid, groupId: Uuid, sortOrder: string) {
    const data = { product_type_id: typeId, group_id: groupId, sort_order: BigInt(sortOrder) };
    const row = await this.db.productTypeGroups.findFirst({
      where: { id, product_type_id: typeId, deleted_at: null },
    });
    if (row) await this.db.productTypeGroups.update({ where: { id }, data });
    else await this.db.productTypeGroups.create({ data: { id, ...data } });
  }
  async removeGroup(id: Uuid, moveTo: Uuid | null) {
    await this.db.productTypeSpecifications.updateMany({
      where: { type_group_id: id, deleted_at: null },
      data: { type_group_id: moveTo },
    });
    await this.db.productTypeGroups.update({ where: { id }, data: { deleted_at: new Date() } });
  }
  async order(typeId: Uuid, kind: 'groups' | 'attributes', orderedIds: readonly Uuid[]) {
    for (const [i, id] of orderedIds.entries()) {
      const data = { sort_order: BigInt(i + 1) * 1024n };
      if (kind === 'groups')
        await this.db.productTypeGroups.update({
          where: { id, product_type_id: typeId, deleted_at: null },
          data,
        });
      else
        await this.db.productTypeSpecifications.update({
          where: { id, product_type_id: typeId, deleted_at: null },
          data,
        });
    }
  }
}
