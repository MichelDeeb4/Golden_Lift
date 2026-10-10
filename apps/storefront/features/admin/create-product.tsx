import { Plus, X } from '@business-platform/icons';
import { useConfirmDiscard } from './context';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { categorySchema, StaffApiError } from '@business-platform/api';
import { BPButton, BPInput, BPDrawer, BPActionBar, BPAlert } from '@business-platform/ui';
import { useStaffApi, useStaffFeedback, useUnsaved } from './context';
import { useAdminTranslation } from './translations';
import {
  ActionFeedback,
  FocusedEditor,
  useAction,
  emptyTranslations,
  TranslationFields,
  translationInput,
} from './common';
import type { TranslationForm } from './common';
import { CategoryPicker } from './categories';

const createdProduct = z.object({
  id: z.string().uuid(),
  version: z.string(),
  active: z.literal(false),
});
export function CreateProduct({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useStaffApi(),
    t = useAdminTranslation(),
    confirmDiscard = useConfirmDiscard(),
    router = useRouter(),
    action = useAction('products', false),
    notify = useStaffFeedback(),
    query = useQueryClient(),
    helpId = useId();
  const defaults = { ...structuredClone(emptyTranslations), categoryId: '', modelCode: '' };
  const form = useForm<TranslationForm>({ defaultValues: defaults });
  const [category, setCategory] = useState<z.infer<typeof categorySchema> | null>(null),
    [categoryOpen, setCategoryOpen] = useState(false);
  const categoryId = form.watch('categoryId'),
    arabicName = form.watch('names.ar');
  const eligible = !!category?.canAddProducts && category.id === categoryId && !!arabicName?.trim();
  const dirty = form.formState.isDirty;
  useUnsaved(open && dirty);
  useEffect(() => {
    if (!open) {
      form.reset(defaults);
      setCategory(null);
      setCategoryOpen(false);
    }
  }, [open]);
  return (
    <>
      <FocusedEditor
        dialog
        open={open}
        dirty={dirty}
        pending={action.isPending}
        title={t('createProduct')}
        onClose={onClose}
      >
        <p>{t('minimalDraftHelp')}</p>
        <form
          noValidate
          onSubmit={form.handleSubmit((input) => {
            if (!eligible || action.isPending) return;
            action.mutate(
              () =>
                api.request(
                  '/admin/products',
                  createdProduct,
                  {
                    categoryId: input.categoryId,
                    translations: translationInput(input),
                    modelCode: input.modelCode?.trim() || null,
                  },
                  'POST',
                ),
              {
                onError: (error) => {
                  if (
                    error instanceof StaffApiError &&
                    ['INVALID_STATE', 'NOT_FOUND'].includes(error.code)
                  )
                    void query.invalidateQueries({ queryKey: ['staff', 'categories'] });
                },
                onSuccess: (response) => {
                  const result = createdProduct.parse(response);
                  const returnTo =
                    window.location.pathname === '/admin/products'
                      ? window.location.pathname + window.location.search
                      : '/admin/products';
                  form.reset(defaults);
                  setCategory(null);
                  onClose();
                  notify?.(t('productCreated'));
                  router.push({
                    pathname: '/admin/[...path]',
                    params: {
                      path: ['products', result.id],
                      returnTo,
                    },
                  });
                },
              },
            );
          })}
        >
          <input
            type="hidden"
            {...form.register('categoryId', { required: t('chooseLeafCategory') })}
          />
          <BPButton
            variant="secondary"
            disabled={action.isPending}
            onClick={() => setCategoryOpen(true)}
          >
            {t('selectCategory')}: {category?.name ?? t('choose')}
          </BPButton>
          <BPInput label={t('code')} maxLength={128} {...form.register('modelCode')} />
          <TranslationFields form={form} labelsOnly />
          {action.error instanceof StaffApiError && action.error.code === 'INVALID_STATE' ? (
            <BPAlert tone="error">{t('leafCategoryOnly')}</BPAlert>
          ) : action.error instanceof StaffApiError && action.error.code === 'NOT_FOUND' ? (
            <BPAlert tone="error">{t('categoryGone')}</BPAlert>
          ) : action.error instanceof StaffApiError && action.error.code === 'CONFLICT' ? (
            <BPAlert tone="error">{t('modelCodeTaken')}</BPAlert>
          ) : action.error instanceof StaffApiError &&
            action.error.code === 'DEPENDENCY_UNAVAILABLE' ? (
            <BPAlert tone="error">{t('createUnavailable')}</BPAlert>
          ) : (
            <ActionFeedback action={action} />
          )}
          <p id={helpId} role="status" aria-live="polite">
            {!category
              ? t('chooseLeafCategory')
              : !arabicName?.trim()
                ? t('requiredArabic')
                : t('draftHelp')}
          </p>
          <BPActionBar>
            <BPButton
              type="submit"
              loading={action.isPending}
              disabled={!eligible || action.isPending}
              aria-describedby={helpId}
            >
              <Plus size={18} aria-hidden="true" />
              {t('createProduct')}
            </BPButton>
            <BPButton
              variant="secondary"
              disabled={action.isPending}
              onClick={async () => {
                if (!dirty || (await confirmDiscard())) onClose();
              }}
            >
              <X size={18} aria-hidden="true" />
              {t('cancel')}
            </BPButton>
          </BPActionBar>
        </form>
      </FocusedEditor>
      <BPDrawer open={categoryOpen} title={t('category')} onClose={() => setCategoryOpen(false)}>
        <CategoryPicker
          leaf
          onSelect={(selected) => {
            setCategory(selected);
            form.setValue('categoryId', selected?.id ?? '', {
              shouldDirty: true,
              shouldValidate: true,
            });
            setCategoryOpen(false);
          }}
        />
      </BPDrawer>
    </>
  );
}
