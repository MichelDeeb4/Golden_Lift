import { useEffect, useState } from 'react';
import { useUnsaved } from './context';
import { useForm } from 'react-hook-form';
import { GLButton, GLInput } from '@golden-lift/ui';
import { ReviewedChange } from './reviewed-change';
import { TranslationFields, translationDefaults, translationInput } from './common';
import type { TranslationForm } from './common';
import { useAdminTranslation } from './translations';
type Translation = { locale: 'ar' | 'en' | 'ckb'; name: string; description: string | null };
export function OptionEditor({
  option,
}: {
  option: {
    id: string;
    code: string;
    version: string;
    sortOrder: string;
    translations: Translation[];
  };
}) {
  const t = useAdminTranslation(),
    form = useForm<TranslationForm>({ defaultValues: translationDefaults(option.translations) }),
    [order, setOrder] = useState(option.sortOrder);
  useUnsaved(form.formState.isDirty || order !== option.sortOrder);
  return (
    <details>
      <summary>
        {t('edit')} — {option.code}
      </summary>
      <TranslationFields form={form} labelsOnly />
      <GLInput label={t('order')} value={order} onChange={(e) => setOrder(e.target.value)} />
      <ReviewedChange
        path={`/admin/attribute-options/${option.id}`}
        version={option.version}
        schemaRevision={null}
        change={{
          kind: 'option.update',
          option: {
            code: option.code,
            translations: translationInput(form.watch()),
            sortOrder: order,
          },
        }}
        label={t('save')}
        onSaved={() => form.reset(form.getValues())}
      />
    </details>
  );
}
type Assignment = {
  id: string;
  definition: { id: string; code: string };
  groupPlacementId: string | null;
  sortOrder: string;
  required: boolean;
  public: boolean;
  filterable: boolean;
  searchable: boolean;
  comparable: boolean;
};
