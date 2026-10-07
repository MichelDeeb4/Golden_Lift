import type {
  AuthenticatedActor,
  CategorySchemaResponse,
  Locale,
  Uuid,
} from '@golden-lift/contracts';
import { requireContentAdmin } from '../../domain/category.js';
import { categoryFormSchema } from '../../domain/effective-schema.js';
import type { CategorySchemaReader } from '../ports/category-schema.js';

export class ReadCategorySchema {
  constructor(private readonly reader: CategorySchemaReader) {}
  async execute(
    categoryId: Uuid,
    language: Locale,
    actor: AuthenticatedActor,
  ): Promise<CategorySchemaResponse> {
    requireContentAdmin(actor);
    const configuration = await this.reader.schema(categoryId);
    return { configuration, form: categoryFormSchema(configuration, language) };
  }
}
