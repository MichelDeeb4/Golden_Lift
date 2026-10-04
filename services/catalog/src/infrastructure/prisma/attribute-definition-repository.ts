import type { Uuid } from '@golden-lift/contracts';
import type {
  AttributeDefinitionRepository,
  DefinitionDraft,
  OptionDraft,
} from '../../application/ports/product-schema.js';
import type { Database } from './client.js';
import {
  definitionDto,
  definitionInclude,
  optionDto,
  optionInclude,
} from './configuration-mapping.js';
export class PrismaAttributeDefinitionRepository implements AttributeDefinitionRepository {
  constructor(private readonly db: Database) {}
  async find(id: Uuid) {
    const row = await this.db.specificationDefinitions.findFirst({
      where: { id, deleted_at: null },
      include: definitionInclude,
    });
    return row ? definitionDto(row) : null;
  }
  async list(after: Uuid | null, limit: number) {
    return (
      await this.db.specificationDefinitions.findMany({
        where: { deleted_at: null, ...(after ? { id: { gt: after } } : {}) },
        include: definitionInclude,
        orderBy: { id: 'asc' },
        take: limit,
      })
    ).map(definitionDto);
  }
  private data(input: DefinitionDraft) {
    return {
      value_type: input.kind,
      unit_code: input.unitCode,
      minimum_value: input.minimum,
      maximum_value: input.maximum,
      allow_multiple: input.allowMultiple,
      is_public: input.public,
      is_filterable: input.filterable,
      text_multiline: input.textMultiline,
      text_max_length: input.textMaxLength,
    };
  }
  async create(id: Uuid, input: DefinitionDraft) {
    await this.db.specificationDefinitions.create({
      data: { id, code: input.code, ...this.data(input) },
    });
    await this.translations(id, input);
  }
  async update(id: Uuid, input: DefinitionDraft) {
    await this.db.specificationDefinitions.update({ where: { id }, data: this.data(input) });
    await this.translations(id, input);
  }
  private async translations(id: Uuid, input: DefinitionDraft) {
    const rows = await this.db.specificationTranslations.findMany({
      where: { definition_id: id, deleted_at: null },
    });
    await this.db.specificationTranslations.updateMany({
      where: {
        definition_id: id,
        deleted_at: null,
        locale: { notIn: input.translations.map((t) => t.locale) },
      },
      data: { deleted_at: new Date() },
    });
    for (const t of input.translations) {
      const row = rows.find((x) => x.locale === t.locale),
        data = { label: t.name, help_text: t.description };
      if (row) await this.db.specificationTranslations.update({ where: { id: row.id }, data });
      else
        await this.db.specificationTranslations.create({
          data: { definition_id: id, locale: t.locale, ...data },
        });
    }
  }
  async deprecate(id: Uuid) {
    await this.db.specificationDefinitions.update({
      where: { id },
      data: { deprecated_at: new Date() },
    });
  }
  async softDelete(id: Uuid) {
    await this.db.specificationDefinitions.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }
  async option(id: Uuid) {
    const row = await this.db.specificationOptions.findFirst({
      where: { id, deleted_at: null },
      include: optionInclude,
    });
    return row ? optionDto(row) : null;
  }
  async createOption(definitionId: Uuid, id: Uuid, input: OptionDraft) {
    await this.db.specificationOptions.create({
      data: {
        id,
        definition_id: definitionId,
        code: input.code,
        sort_order: BigInt(input.sortOrder),
      },
    });
    await this.optionTranslations(id, input);
  }
  async updateOption(id: Uuid, input: OptionDraft) {
    await this.db.specificationOptions.update({
      where: { id },
      data: { sort_order: BigInt(input.sortOrder) },
    });
    await this.optionTranslations(id, input);
  }
  private async optionTranslations(id: Uuid, input: OptionDraft) {
    const rows = await this.db.specificationOptionTranslations.findMany({
      where: { option_id: id, deleted_at: null },
    });
    await this.db.specificationOptionTranslations.updateMany({
      where: {
        option_id: id,
        deleted_at: null,
        locale: { notIn: input.translations.map((t) => t.locale) },
      },
      data: { deleted_at: new Date() },
    });
    for (const t of input.translations) {
      const row = rows.find((x) => x.locale === t.locale);
      if (row)
        await this.db.specificationOptionTranslations.update({
          where: { id: row.id },
          data: { label: t.name },
        });
      else
        await this.db.specificationOptionTranslations.create({
          data: { option_id: id, locale: t.locale, label: t.name },
        });
    }
  }
  async deprecateOption(id: Uuid) {
    await this.db.specificationOptions.update({
      where: { id },
      data: { deprecated_at: new Date() },
    });
  }
  async softDeleteOption(id: Uuid) {
    await this.db.specificationOptions.update({ where: { id }, data: { deleted_at: new Date() } });
  }
}
