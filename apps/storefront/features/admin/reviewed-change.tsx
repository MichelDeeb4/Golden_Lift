import { useEffect, useState } from 'react';
import { z } from 'zod';
import { GLButton, GLModal } from '@golden-lift/ui';
import { useStaffApi, useStaffFeedback } from './context';
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
  reload,
  onPending,
}: {
  path: string;
  version: string;
  schemaRevision: string | null;
  change: unknown;
  label: string;
  onSaved?: () => void;
  reload?: () => void;
  onPending?: (pending: boolean) => void;
}) {
  const api = useStaffApi(),
    t = useAdminTranslation(),
    action = useAction('configuration', false),
    [impact, setImpact] = useState<z.infer<typeof impactSchema> | null>(null),
    [open, setOpen] = useState(false),
    [reviewed, setReviewed] = useState<{
      change: unknown;
      version: string;
      schemaRevision: string | null;
    } | null>(null);
  const notify = useStaffFeedback();
  const reloadLatest = reload
    ? () => {
        setOpen(false);
        setImpact(null);
        setReviewed(null);
        action.reset();
        reload();
      }
    : undefined;
  useEffect(() => {
    onPending?.(action.isPending);
  }, [action.isPending, onPending]);
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
      {!open && <ActionFeedback action={action} reload={reloadLatest} />}
      <GLModal
        open={open}
        onClose={() => {
          if (!action.isPending) setOpen(false);
        }}
        title={t('impact')}
      >
        <p>
          {t('products')}: {impact?.affectedProductCount} · {t('status')}:{' '}
          {impact?.invalidProductCount}
        </p>
        {impact?.blockers.length ? <p role="alert">{t('error')}</p> : null}
        <ActionFeedback action={action} reload={reloadLatest} />
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
                  notify?.(t('saved'));
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
