import { useState } from 'react';
import { z } from 'zod';
import { GLButton, GLModal } from '@golden-lift/ui';
import { useStaffApi } from './context';
import { useAdminTranslation } from './translations';
import { ActionFeedback, jsonResponse, useAction } from './common';
const impactSchema = z.object({
  precondition: z.string(),
  affectedProductCount: z.string(),
  invalidProductCount: z.string(),
  blockers: z.array(z.string()),
});
export function ReviewedChange({
  path,
  version,
  schemaRevision,
  change,
  label,
  onSaved,
}: {
  path: string;
  version: string;
  schemaRevision: string | null;
  change: unknown;
  label: string;
  onSaved?: () => void;
}) {
  const api = useStaffApi(),
    t = useAdminTranslation(),
    action = useAction(),
    [impact, setImpact] = useState<z.infer<typeof impactSchema> | null>(null),
    [open, setOpen] = useState(false),
    [reviewed, setReviewed] = useState<{
      change: unknown;
      version: string;
      schemaRevision: string | null;
    } | null>(null);
  return (
    <>
      <GLButton
        variant="secondary"
        loading={action.isPending}
        onClick={() =>
          action.mutate(
            () =>
              api.request(
                path + '/changes/preview',
                impactSchema,
                { change, expectedVersion: version, expectedSchemaRevision: schemaRevision },
                'POST',
              ),
            {
              onSuccess: (value) => {
                action.setSaved(false);
                setImpact(value as z.infer<typeof impactSchema>);
                setReviewed({ change, version, schemaRevision });
                setOpen(true);
              },
            },
          )
        }
      >
        {label}
      </GLButton>
      <GLModal open={open} onClose={() => setOpen(false)} title={t('impact')}>
        <p>
          {t('products')}: {impact?.affectedProductCount} · {t('status')}:{' '}
          {impact?.invalidProductCount}
        </p>
        {impact?.blockers.length ? <p role="alert">{t('error')}</p> : null}
        <ActionFeedback action={action} />
        <GLButton
          disabled={!impact || !!impact.blockers.length}
          loading={action.isPending}
          onClick={() =>
            action.mutate(
              () =>
                api.request(
                  path + '/changes',
                  jsonResponse,
                  {
                    change: reviewed!.change,
                    expectedVersion: reviewed!.version,
                    expectedSchemaRevision: reviewed!.schemaRevision,
                    precondition: impact!.precondition,
                    confirm: true,
                  },
                  'POST',
                ),
              {
                onSuccess: () => {
                  setOpen(false);
                  onSaved?.();
                },
              },
            )
          }
        >
          {t('apply')}
        </GLButton>
      </GLModal>
    </>
  );
}
