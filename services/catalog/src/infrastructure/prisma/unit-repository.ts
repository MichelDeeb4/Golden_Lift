import type { CatalogTranslation } from '@business-platform/contracts';
import type { UnitDraft, UnitRepository } from '../../application/ports/product-schema.js';
import type { Database } from './client.js';
import { unitDto, unitInclude } from './configuration-mapping.js';
export class PrismaUnitRepository implements UnitRepository {
  constructor(private readonly db: Database) {}
  async find(code: string) {
    const row = await this.db.units.findFirst({
      where: { code, deleted_at: null },
      include: unitInclude,
    });
    return row ? unitDto(row) : null;
  }
  async list(after: string | null, limit: number) {
    return (
      await this.db.units.findMany({
        where: { deleted_at: null, ...(after ? { code: { gt: after } } : {}) },
        include: unitInclude,
        orderBy: { code: 'asc' },
        take: limit,
      })
    ).map(unitDto);
  }
  async create(input: UnitDraft) {
    await this.db.units.create({
      data: { code: input.code, symbol: input.symbol, dimension: input.dimension },
    });
    await this.update(input.code, input.translations);
  }
  async update(code: string, input: readonly CatalogTranslation[]) {
    await this.db.units.update({ where: { code }, data: { updated_at: new Date() } });
    const rows = await this.db.unitTranslations.findMany({
      where: { unit_code: code, deleted_at: null },
    });
    await this.db.unitTranslations.updateMany({
      where: { unit_code: code, deleted_at: null, locale: { notIn: input.map((t) => t.locale) } },
      data: { deleted_at: new Date() },
    });
    for (const t of input) {
      const row = rows.find((x) => x.locale === t.locale);
      if (row)
        await this.db.unitTranslations.update({ where: { id: row.id }, data: { label: t.name } });
      else
        await this.db.unitTranslations.create({
          data: { unit_code: code, locale: t.locale, label: t.name },
        });
    }
  }
  async softDelete(code: string) {
    await this.db.units.update({ where: { code }, data: { deleted_at: new Date() } });
  }
}
