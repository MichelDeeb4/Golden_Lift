import type {
  ConfigurationCollectionQuery,
  ConfigurationCollectionReader,
} from '../../application/ports/configuration-collection.js';
import type { Database } from './client.js';
import type { Prisma } from './generated/client.js';
import {
  definitionDto,
  definitionInclude,
  groupDto,
  groupInclude,
  unitDto,
  unitInclude,
} from './configuration-mapping.js';
export class PrismaConfigurationCollection implements ConfigurationCollectionReader {
  constructor(private readonly db: Database) {}
  async page(input: ConfigurationCollectionQuery) {
    if (input.resource !== 'definitions' && input.deprecated)
      return { items: [], page: 1, pageSize: input.pageSize, totalItems: 0, nextCursor: null };
    const search = input.search
      ? { contains: input.search, mode: 'insensitive' as const }
      : undefined;
    const bounds = (totalItems: number) => {
      const page = Math.min(input.page, Math.max(1, Math.ceil(totalItems / input.pageSize)));
      return {
        page,
        pageSize: input.pageSize,
        totalItems,
        nextCursor: null,
        skip: (page - 1) * input.pageSize,
      };
    };
    if (input.resource === 'definitions') {
      const where: Prisma.SpecificationDefinitionsWhereInput = {
        deleted_at: null,
        ...(input.kind ? { value_type: input.kind } : {}),
        ...(input.public !== undefined ? { is_public: input.public } : {}),
        ...(input.deprecated !== undefined
          ? { deprecated_at: input.deprecated ? { not: null } : null }
          : {}),
        ...(search
          ? {
              OR: [
                { code: search },
                { specification_translations: { some: { deleted_at: null, label: search } } },
              ],
            }
          : {}),
      };
      const { skip, ...metadata } = bounds(await this.db.specificationDefinitions.count({ where }));
      const rows = await this.db.specificationDefinitions.findMany({
        where,
        include: definitionInclude,
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        skip,
        take: input.pageSize,
      });
      return { ...metadata, items: rows.map(definitionDto) };
    }
    if (input.resource === 'groups') {
      const where: Prisma.SpecificationGroupsWhereInput = {
        deleted_at: null,
        ...(search
          ? {
              OR: [
                { code: search },
                { specification_group_translations: { some: { deleted_at: null, name: search } } },
              ],
            }
          : {}),
      };
      const { skip, ...metadata } = bounds(await this.db.specificationGroups.count({ where }));
      const rows = await this.db.specificationGroups.findMany({
        where,
        include: groupInclude,
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        skip,
        take: input.pageSize,
      });
      return { ...metadata, items: rows.map(groupDto) };
    }
    const where: Prisma.UnitsWhereInput = {
      deleted_at: null,
      ...(search
        ? {
            OR: [
              { code: search },
              { unit_translations: { some: { deleted_at: null, label: search } } },
            ],
          }
        : {}),
    };
    const { skip, ...metadata } = bounds(await this.db.units.count({ where }));
    const rows = await this.db.units.findMany({
      where,
      include: unitInclude,
      orderBy: { code: 'asc' },
      skip,
      take: input.pageSize,
    });
    return { ...metadata, items: rows.map(unitDto) };
  }
}
