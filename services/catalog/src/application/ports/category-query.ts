import type { Locale, Uuid } from '@business-platform/contracts';
export interface CategoryCursor {
  readonly sortOrder: string;
  readonly id: Uuid;
}
export interface CategoryList {
  readonly parentId: Uuid | null;
  readonly locale: Locale;
  readonly limit: number;
  readonly after: CategoryCursor | null;
}
