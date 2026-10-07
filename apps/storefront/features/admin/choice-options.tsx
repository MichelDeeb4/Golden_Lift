import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { StaffApiError } from '@golden-lift/api';
import { GLAlert, GLButton, GLInput, GLModal } from '@golden-lift/ui';
import { useStaffApi, useUnsaved } from './context';
import { useAdminTranslation } from './translations';
import {
  ActionFeedback,
  emptyTranslations,
  jsonResponse,
  TranslationFields,
  translationInput,
  useAction,
} from './common';
import type { TranslationForm } from './common';

export function AddChoiceOption({
  definitionId,
  options,
}: {
  definitionId: string;
  options: readonly { code: string; sortOrder: string }[];
}) {
  const api = useStaffApi(),
    t = useAdminTranslation(),
    action = useAction();
  const [open, setOpen] = useState(false),
    [code, setCode] = useState(''),
    [codeError, setCodeError] = useState<string | null>(null);
  const form = useForm<TranslationForm>({ defaultValues: structuredClone(emptyTranslations) });
  useUnsaved(form.formState.isDirty || !!code);
  return (
    <>
      <GLButton onClick={() => setOpen(true)}>{t('addOption')}</GLButton>
      <GLModal
        open={open}
        title={t('addOption')}
        onClose={() => {
          if (!action.isPending) setOpen(false);
        }}
      >
        <p>{t('optionHelp')}</p>
        <form
          onSubmit={form.handleSubmit((values) => {
            const stableCode = code.trim();
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(stableCode)) {
              setCodeError(t('optionCodeHelp'));
              return;
            }
            if (options.some((option) => option.code === stableCode)) {
              setCodeError(t('duplicateOption'));
              return;
            }
            setCodeError(null);
            const last = options.reduce(
              (maximum, option) =>
                BigInt(option.sortOrder) > maximum ? BigInt(option.sortOrder) : maximum,
              0n,
            );
            const next = last <= 9223372036854774783n ? last + 1024n : last;
            action.mutate(
              () =>
                api.request(
                  `/admin/attributes/${definitionId}/options`,
                  jsonResponse,
                  {
                    code: stableCode,
                    translations: translationInput(values).map((translation) => ({
                      ...translation,
                      description: null,
                    })),
                    sortOrder: next.toString(),
                  },
                  'POST',
                ),
              {
                onSuccess: () => {
                  form.reset(structuredClone(emptyTranslations));
                  setCode('');
                  setCodeError(null);
                  setOpen(false);
                },
              },
            );
          })}
        >
          <GLInput
            label={t('code')}
            required
            value={code}
            error={codeError ?? undefined}
            onChange={(event) => {
              setCode(event.target.value);
              setCodeError(null);
              action.reset();
            }}
          />
          <p className="gl-muted">{t('optionCodeHelp')}</p>
          <TranslationFields form={form} labelsOnly />
          {action.error instanceof StaffApiError && action.error.code === 'CONFLICT' ? (
            <GLAlert tone="error">{t('duplicateOption')}</GLAlert>
          ) : (
            <ActionFeedback action={action} />
          )}
          <GLButton type="submit" loading={action.isPending}>
            {t('save')}
          </GLButton>
          <GLButton variant="secondary" disabled={action.isPending} onClick={() => setOpen(false)}>
            {t('cancel')}
          </GLButton>
        </form>
      </GLModal>
    </>
  );
}
