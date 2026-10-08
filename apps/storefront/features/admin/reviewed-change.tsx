import { useEffect, useRef, useState } from 'react';
import { Save, Trash2, Archive, X } from '@golden-lift/icons';
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
  onCommitted,
  entityName,
  autoOpen = false,
  onDismiss,
}: {
  path: string;
  version: string;
  schemaRevision: string | null;
  change: unknown;
  label: string;
  onSaved?: () => void;
  reload?: () => void;
  onPending?: (pending: boolean) => void;
  onCommitted?: () => Promise<void> | void;
  entityName?: string;
  autoOpen?: boolean;
  onDismiss?: () => void;
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
  const kind =
    typeof change === 'object' && change !== null && 'kind' in change ? String(change.kind) : '';
  const destructive = kind.endsWith('.delete') || kind.endsWith('.remove');
  const warning = kind.endsWith('.deprecate');
  const Icon = destructive ? Trash2 : warning ? Archive : Save;
  const preview = () =>
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
    );
  const started = useRef(false);
  useEffect(() => {
    if (autoOpen && !started.current) {
      started.current = true;
      preview();
    }
  }, [autoOpen, preview]);
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
      {!autoOpen && (
        <>
          <GLButton
            variant={destructive ? 'destructive' : warning ? 'warning' : 'primary'}
            loading={action.isPending}
            onClick={preview}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </GLButton>
        </>
      )}
      {!open && <ActionFeedback action={action} reload={reloadLatest} />}
      <GLModal
        open={open}
        onClose={() => {
          if (!action.isPending) {
            setOpen(false);
            onDismiss?.();
          }
        }}
        title={t('impact')}
      >
        {entityName && (
          <p>
            <strong>{entityName}</strong>
          </p>
        )}
        {destructive && <p>{t('noRestore')}</p>}
        <p>
          {t('products')}: {impact?.affectedProductCount} · {t('status')}:{' '}
          {impact?.invalidProductCount}
        </p>
        {impact?.blockers.length ? <p role="alert">{t('error')}</p> : null}
        <ActionFeedback action={action} reload={reloadLatest} />
        <GLButton
          variant={destructive ? 'destructive' : warning ? 'warning' : 'primary'}
          disabled={!impact || !!impact.blockers.length}
          loading={action.isPending}
          onClick={() =>
            action.mutate(
              async () => {
                const result = await api.request(
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
                );
                await onCommitted?.();
                return result;
              },
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
          <Icon size={18} aria-hidden="true" />
          {t('apply')}
        </GLButton>
        <GLButton
          variant="secondary"
          disabled={action.isPending}
          onClick={() => {
            setOpen(false);
            onDismiss?.();
          }}
        >
          <X size={18} aria-hidden="true" />
          {t('cancel')}
        </GLButton>
      </GLModal>
    </>
  );
}
