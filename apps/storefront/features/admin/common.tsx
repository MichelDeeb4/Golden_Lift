import { useState } from 'react';
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
  GLToast,
} from '@golden-lift/ui';
import type { UseFormReturn } from 'react-hook-form';
import { useStaffApi, StaffError } from './context';
import { useAdminTranslation } from './translations';
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
export function useAction() {
  const query = useQueryClient(),
    t = useAdminTranslation(),
    [saved, setSaved] = useState(false);
  const mutation = useMutation({
    mutationFn: (work: () => Promise<unknown>) => work(),
    onMutate: () => setSaved(false),
    onSuccess: async () => {
      setSaved(true);
      await query.invalidateQueries({ queryKey: ['staff'] });
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
  const t = useAdminTranslation();
  return (
    <>
      {action.error && <StaffError error={action.error} reload={reload} />}
      <GLToast message={action.saved ? t('saved') : null} onClose={() => action.setSaved(false)} />
    </>
  );
}
export function Confirm({
  title,
  work,
  children,
  label,
  disabled = false,
}: {
  title: string;
  work: () => Promise<unknown>;
  children?: ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [reviewedWork, setReviewedWork] = useState<(() => Promise<unknown>) | null>(null),
    action = useAction(),
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
export function TranslationFields({ form }: { form: UseFormReturn<TranslationForm> }) {
  const t = useAdminTranslation();
  return (
    <section>
      <GLHeading level={2} role="heading5">
        {t('translations')}
      </GLHeading>
      <p>{t('requiredArabic')}</p>
      {(['ar', 'en', 'ckb'] as const).map((locale) => (
        <div key={locale} dir={locale === 'en' ? 'ltr' : 'rtl'} className="gl-admin-grid">
          <GLInput
            label={`${t('name')} (${locale})`}
            required={locale === 'ar'}
            {...form.register(`names.${locale}`)}
          />
          <GLTextarea
            label={`${t('description')} (${locale})`}
            {...form.register(`descriptions.${locale}`)}
          />
        </div>
      ))}
    </section>
  );
}
export function TableState({
  pending,
  error,
  empty,
  children,
}: {
  pending: boolean;
  error: unknown;
  empty: boolean;
  children: ReactNode;
}) {
  const t = useAdminTranslation();
  if (pending) return <GLSpinner label={t('loading')} />;
  if (error) return <StaffError error={error} />;
  if (empty) return <GLAlert>{t('empty')}</GLAlert>;
  return <div className="gl-admin-table">{children}</div>;
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
  return <Confirm title={label} work={() => api.request(path, jsonResponse, body, method)} />;
}
