import { ApplicationError } from '@golden-lift/contracts';
import type { CategoryDto, Locale, Uuid } from '@golden-lift/contracts';
import type { CategoryList, CategoryReader } from '../ports/catalog.js';
export class ReadCategories {
  constructor(private readonly categories: CategoryReader) {}
  async detail(id: Uuid, locale: Locale): Promise<CategoryDto> {
    const result = await this.categories.find(id, locale);
    if (!result) throw new ApplicationError('NOT_FOUND', 'Category not found.');
    return result;
  }
  async list(input: CategoryList): Promise<readonly CategoryDto[]> {
    if (input.parentId && !(await this.categories.find(input.parentId, input.locale)))
      throw new ApplicationError('NOT_FOUND', 'Parent category not found.');
    return this.categories.list(input);
  }
}
