import { ApplicationError, locale, locales, uuid, version } from '@golden-lift/contracts';
import type { AuthenticatedActor, Locale, Uuid, Version } from '@golden-lift/contracts';
export interface Translation {
  readonly locale: Locale;
  readonly name: string;
  readonly description: string | null;
  readonly slug: string | null;
}
export interface CategoryDraft {
  readonly groupIds?: readonly Uuid[];
  readonly coverAssetId?: Uuid | null;
  readonly parentId: Uuid | null;
  readonly expectedParentVersion: Version | null;
  readonly translations: readonly Translation[];
}
export function requireContentAdmin(actor: AuthenticatedActor): void {
  if (actor.role !== 'ADMIN')
    throw new ApplicationError('FORBIDDEN', 'Content management requires an Admin account.');
}
export function categoryDraft(input: CategoryDraft): CategoryDraft {
  const seen = new Set<Locale>();
  const translations = input.translations.map((item) => {
    const language = locale(item.locale);
    if (seen.has(language))
      throw new ApplicationError('VALIDATION_FAILED', 'Duplicate translation locale.');
    seen.add(language);
    const name = item.name.trim();
    if (!name || name.length > 300)
      throw new ApplicationError(
        'VALIDATION_FAILED',
        'Category names must contain 1 to 300 characters.',
      );
    return {
      locale: language,
      name,
      description: item.description?.trim() || null,
      slug: item.slug?.trim() || null,
    };
  });
  if (!seen.has('ar') || translations.length > locales.length)
    throw new ApplicationError('VALIDATION_FAILED', 'An Arabic category name is required.');
  const parentId = input.parentId === null ? null : uuid(input.parentId);
  const expectedParentVersion =
    input.expectedParentVersion === null ? null : version(input.expectedParentVersion);
  if ((parentId === null) !== (expectedParentVersion === null))
    throw new ApplicationError(
      'VALIDATION_FAILED',
      'Child creation requires its parent version; root creation has no parent version.',
    );
  return {
    ...(input.groupIds === undefined ? {} : { groupIds: input.groupIds.map(uuid) }),
    parentId,
    expectedParentVersion,
    translations,
    ...(input.coverAssetId === undefined
      ? {}
      : { coverAssetId: input.coverAssetId === null ? null : uuid(input.coverAssetId) }),
  };
}
