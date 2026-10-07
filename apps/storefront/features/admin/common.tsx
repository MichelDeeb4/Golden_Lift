import { useEffect, useId, useState } from 'react';
import { languageNames } from '@golden-lift/i18n';
import type { ReactNode } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pageSchema } from '@golden-lift/api';
import { z } from 'zod';
import {
  GLButton,
  GLHeading,
  GLInput,
  GLTextarea,
  GLModal,
  GLAlert,
  GLSpinner,
  GLTabs,
  GLFormSection,
  GLSkeleton,
  GLEmptyState,
} from '@golden-lift/ui';
import type { UseFormReturn } from 'react-hook-form';
import { useStaffApi, StaffError, useStaffFeedback } from './context';
import { useAdminTranslation } from './translations';
import { usePublicCatalogInvalidation } from '../../providers/storefront';
export function FocusedEditor({
  open,
  title,
  children,
  onClose,
  dialog = false,
  dirty = false,
  pending = false,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  dialog?: boolean;
  dirty?: boolean;
  pending?: boolean;
}) {
  const id = useId();
  const t = useAdminTranslation();
  if (dialog)
    return (
      <GLModal
        open={open}
        keepMounted
        className="gl-admin-modal"
        title={title}
        onClose={() => {
          if (!pending && (!dirty || window.confirm(t('unsaved')))) onClose();
        }}
      >
        <div className="gl-admin-modal-body">{children}</div>
      </GLModal>
    );
  return open ? (
    <section className="gl-inline-editor" aria-labelledby={id}>
      <GLHeading level={2} role="heading4" id={id}>
        {title}
      </GLHeading>
      {children}
    </section>
  ) : null;
}
export const jsonResponse = z.unknown();
export function useStaffOptions<T extends z.ZodTypeAny>(path: string, schema: T, enabled = true) {
  const api = useStaffApi();
  const query = useInfiniteQuery({
    queryKey: ['staff', 'options', path],
    initialPageParam: '',
    enabled,
    queryFn: ({ signal, pageParam }) =>
      api.request(
        `${path}?limit=100${pageParam ? '&cursor=' + encodeURIComponent(pageParam) : ''}`,
        pageSchema(schema),
        undefined,
        'GET',
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  return { ...query, items: query.data?.pages.flatMap((page) => page.items) ?? [] };
}
export function MoreOptions({
  query,
  label,
}: {
  query: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => Promise<unknown>;
  };
  label: string;
}) {
  const t = useAdminTranslation();
  return query.hasNextPage ? (
    <GLButton
      variant="secondary"
      loading={query.isFetchingNextPage}
      onClick={() => void query.fetchNextPage()}
    >
      {t('next')} — {label}
    </GLButton>
  ) : null;
}
export function useAction(scope = 'account', feedback = true) {
  const notify = useStaffFeedback();
  const invalidatePublic = usePublicCatalogInvalidation();
  const query = useQueryClient(),
    t = useAdminTranslation(),
    [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onMutate: () => setSaved(false),
    onSuccess: async () => {
      setSaved(true);
      if (feedback) notify?.(t('saved'));
      const keys: Record<string, readonly string[]> = {
        categories: [
          'categories',
          'category',
          'category-picker',
          'breadcrumbs',
          'category-delete-preview',
          'category-source',
          'move-destinations',
          'products',
          'product-category-context',
          'dashboard-products',
        ],
        products: [
          'product-form',
          'category-schema',
          'products',
          'product',
          'dashboard-products',
          'categories',
          'category',
          'category-picker',
        ],
        configuration: [
          'category-schema',
          'configuration',
          'configuration-schema',
          'options',
          'product-form',
          'type-change-schema',
          'product',
          'products',
          'dashboard-products',
        ],
        media: [
          'media',
          'media-detail',
          'media-usage',
          'media-preview',
          'upload-asset',
          'products',
          'product',
          'categories',
          'category',
          'dashboard-products',
          'dashboard-assets',
          'media-statistics',
        ],
        account: ['session', 'admins', 'account'],
      };
      await query.invalidateQueries({
        predicate: (entry) =>
          entry.queryKey[0] === 'staff' &&
          (keys[scope] ?? []).some(
            (key) =>
              String(entry.queryKey[1]) === key || String(entry.queryKey[1]).startsWith(key + '-'),
          ),
      });
      if (scope !== 'account') await invalidatePublic?.();
    },
  });
  return { ...mutation, saved, setSaved, t };
}
export function ActionFeedback({
  action,
  reload,
}: {
  action: ReturnType<typeof useAction>;
  reload?: () => void;
}) {
  return <>{action.error && <StaffError error={action.error} reload={reload} />}</>;
}
export function Confirm({
  title,
  work,
  children,
  label,
  disabled = false,
  scope = 'account',
}: {
  title: string;
  work: () => Promise<unknown>;
  children?: ReactNode;
  label?: string;
  disabled?: boolean;
  scope?: string;
}) {
  const [open, setOpen] = useState(false),
    [reviewedWork, setReviewedWork] = useState<(() => Promise<unknown>) | null>(null),
    action = useAction(scope),
    t = useAdminTranslation();
  return (
    <>
      <GLButton
        variant="destructive"
        disabled={disabled}
        onClick={() => {
          setReviewedWork(() => work);
          setOpen(true);
        }}
      >
        {label ?? title}
      </GLButton>
      <GLModal
        open={open}
        onClose={() => {
          if (!action.isPending) setOpen(false);
        }}
        title={title}
      >
        <p>{children ?? t('confirmAction')}</p>
        <ActionFeedback action={action} />
        <GLButton
          variant="destructive"
          loading={action.isPending}
          onClick={() => action.mutate(reviewedWork!, { onSuccess: () => setOpen(false) })}
        >
          {t('confirm')}
        </GLButton>
        <GLButton variant="secondary" disabled={action.isPending} onClick={() => setOpen(false)}>
          {t('cancel')}
        </GLButton>
      </GLModal>
    </>
  );
}
export interface TranslationForm {
  categoryId?: string;
  modelCode?: string;
  names: { ar: string; en: string; ckb: string };
  descriptions: { ar: string; en: string; ckb: string };
}
export const emptyTranslations: TranslationForm = {
  names: { ar: '', en: '', ckb: '' },
  descriptions: { ar: '', en: '', ckb: '' },
};
export function translationInput(v: TranslationForm) {
  return (['ar', 'en', 'ckb'] as const)
    .filter((locale) => v.names[locale].trim())
    .map((locale) => ({
      locale,
      name: v.names[locale].trim(),
      description: v.descriptions[locale] || null,
    }));
}
export function translationDefaults(
  rows: readonly { locale: 'ar' | 'en' | 'ckb'; name: string; description: string | null }[],
): TranslationForm {
  const result = structuredClone(emptyTranslations);
  for (const row of rows) {
    result.names[row.locale] = row.name;
    result.descriptions[row.locale] = row.description ?? '';
  }
  return result;
}
export function TranslationFields({
  form,
  labelsOnly = false,
}: {
  form: UseFormReturn<TranslationForm>;
  labelsOnly?: boolean;
}) {
  const t = useAdminTranslation(),
    [language, setLanguage] = useState<'ar' | 'en' | 'ckb'>('ar'),
    prefix = useId();
  const arabicError = form.formState.errors.names?.ar?.message;
  useEffect(() => {
    if (arabicError) setLanguage('ar');
  }, [arabicError]);
  return (
    <GLFormSection
      title={t('translations')}
      description={t('requiredArabic')}
      className="gl-translation-section"
    >
      <GLTabs
        idPrefix={prefix}
        value={language}
        onChange={(value) => setLanguage(value as typeof language)}
        tabs={(['ar', 'en', 'ckb'] as const).map((id) => ({ id, label: languageNames[id] }))}
      />
      {(['ar', 'en', 'ckb'] as const).map((locale) => (
        <div
          key={locale}
          hidden={language !== locale}
          role="tabpanel"
          id={prefix + 'panel-' + locale}
          aria-labelledby={prefix + 'tab-' + locale}
          dir={locale === 'en' ? 'ltr' : 'rtl'}
          className="gl-translation-panel"
        >
          <GLInput
            label={`${t('name')} (${locale})`}
            required={locale === 'ar' && language === 'ar'}
            error={form.formState.errors.names?.[locale]?.message}
            {...form.register(
              `names.${locale}`,
              locale === 'ar'
                ? { validate: (value) => value.trim().length > 0 || t('requiredArabic') }
                : undefined,
            )}
          />
          {!labelsOnly && (
            <GLTextarea
              label={`${t('description')} (${locale})`}
              {...form.register(`descriptions.${locale}`)}
            />
          )}
        </div>
      ))}
    </GLFormSection>
  );
}
export function TableState({
  pending,
  error,
  empty,
  children,
  emptyTitle,
  emptyDescription,
  emptyAction,
  presentation = 'table',
}: {
  pending: boolean;
  error: unknown;
  empty: boolean;
  children: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  presentation?: 'table' | 'content';
}) {
  const t = useAdminTranslation();
  if (pending)
    return (
      <div className="gl-admin-skeleton" role="status" aria-label={t('loading')}>
        {[0, 1, 2].map((row) => (
          <GLSkeleton key={row} className="gl-admin-skeleton-row" />
        ))}
      </div>
    );
  if (error) return <StaffError error={error} />;
  if (empty)
    return (
      <GLEmptyState
        title={emptyTitle ?? t('empty')}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  return (
    <div className={presentation === 'table' ? 'gl-admin-table' : 'gl-admin-content-state'}>
      {children}
    </div>
  );
}
export function ApiCommand({
  path,
  method = 'POST',
  body,
  label,
}: {
  path: string;
  method?: string;
  body: unknown;
  label: string;
}) {
  const api = useStaffApi();
  return (
    <Confirm
      scope={
        path.includes('/categories')
          ? 'categories'
          : path.includes('/products')
            ? 'products'
            : path.includes('/media')
              ? 'media'
              : 'configuration'
      }
      title={label}
      work={() => api.request(path, jsonResponse, body, method)}
    />
  );
}
