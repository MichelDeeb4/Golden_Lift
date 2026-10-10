import type { CatalogTranslation, Uuid } from '@business-platform/contracts';
import type {
  AttributeGroupRepository,
  NamedDraft,
} from '../../application/ports/product-schema.js';
import type { Database } from './client.js';
import { groupDto, groupInclude } from './configuration-mapping.js';
export class PrismaAttributeGroupRepository implements AttributeGroupRepository {
  constructor(private readonly db: Database) {}
  async find(id: Uuid) {
    const row = await this.db.specificationGroups.findFirst({
      where: { id, deleted_at: null },
      include: groupInclude,
    });
    return row ? groupDto(row) : null;
  }
  async list(after: Uuid | null, limit: number) {
    return (
      await this.db.specificationGroups.findMany({
        where: { deleted_at: null, ...(after ? { id: { gt: after } } : {}) },
        include: groupInclude,
        orderBy: { id: 'asc' },
        take: limit,
      })
    ).map(groupDto);
  }
  async create(id: Uuid, input: NamedDraft) {
    await this.db.specificationGroups.create({ data: { id, code: input.code } });
    await this.update(id, input.translations);
  }
  async update(id: Uuid, input: readonly CatalogTranslation[]) {
    await this.db.specificationGroups.update({ where: { id }, data: { updated_at: new Date() } });
    const rows = await this.db.specificationGroupTranslations.findMany({
      where: { group_id: id, deleted_at: null },
    });
    await this.db.specificationGroupTranslations.updateMany({
      where: { group_id: id, deleted_at: null, locale: { notIn: input.map((t) => t.locale) } },
      data: { deleted_at: new Date() },
    });
    for (const t of input) {
      const row = rows.find((x) => x.locale === t.locale),
        data = { name: t.name, description: t.description };
      if (row) await this.db.specificationGroupTranslations.update({ where: { id: row.id }, data });
      else
        await this.db.specificationGroupTranslations.create({
          data: { group_id: id, locale: t.locale, ...data },
        });
    }
  }
  async softDelete(id: Uuid) {
    await this.db.specificationGroups.update({ where: { id }, data: { deleted_at: new Date() } });
  }
}
