import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deletionImpactSchema,
  deletionOperationSchema,
  deletionResultSchema,
} from '@golden-lift/api';
import { GLModal, GLButton, GLAlert, GLActionBar } from '@golden-lift/ui';
import type { z } from 'zod';
import { StaffError, useStaffApi, useStaffFeedback, useStaffSession } from './context';
import { useAction } from './common';
import { useAdminTranslation } from './translations';

export function DeletionDialog({
  path,
  scope,
  onClose,
  onAccepted,
}: {
  path: string;
  scope: 'products' | 'categories' | 'configuration' | 'media';
  onClose: () => void;
  onAccepted?: () => void;
}) {
  const api = useStaffApi(),
    t = useAdminTranslation(),
    notify = useStaffFeedback(),
    cache = useQueryClient(),
    action = useAction(scope, false),
    session = useStaffSession();
  const [operation, setOperation] = useState<z.infer<typeof deletionOperationSchema> | null>(null);
  const preview = useQuery({
    queryKey: ['staff', 'deletion-impact', path],
    queryFn: ({ signal }) =>
      api.request(path + '/deletion-impact', deletionImpactSchema, undefined, 'GET', signal),
    enabled: !operation,
    staleTime: 0,
  });
  const status = useQuery({
    queryKey: ['staff', 'deletion-operation', operation?.id],
    enabled: !!operation && operation.status !== 'COMPLETED',
    refetchInterval: 2000,
    queryFn: ({ signal }) =>
      api.request(
        (scope === 'media'
          ? '/admin/media/deletion-operations/'
          : '/admin/products/deletion-operations/') + operation!.id,
        deletionOperationSchema,
        undefined,
        'GET',
        signal,
      ),
  });
  const completed = operation?.status === 'COMPLETED' || status.data?.status === 'COMPLETED';
  useEffect(() => {
    if (completed) {
      notify?.(t('deletionCompleted'));
      onAccepted?.();
      void action.mutateAsync(async () => undefined).then(onClose);
    }
  }, [completed]);
  const impact = preview.data,
    failed = status.data?.status === 'RETRYABLE',
    rejected = status.data?.failureCode === 'DELETE_IMPACT_CHANGED';
  useEffect(() => {
    if (rejected) void cache.invalidateQueries({ queryKey: ['staff'] });
  }, [rejected]);
  return (
    <GLModal
      open
      title={operation ? t('deletionStarted') : t('deletionImpact')}
      className="gl-admin-overlay"
      onClose={() => {
        if (!action.isPending) onClose();
      }}
    >
      {!operation && (
        <>
          {preview.isPending && <p role="status">{t('checkingDependencies')}</p>}
          {preview.error && (
            <StaffError error={preview.error} reload={() => void preview.refetch()} />
          )}
          {impact && (
            <>
              <p>
                <strong>{impact.entity.displayName}</strong>
              </p>
              <GLAlert tone={impact.allowed ? 'warning' : 'error'}>
                {impact.allowed ? t('permanentDeletion') : t('deletionBlocked')}
              </GLAlert>
              {impact.blockingDependencies.map((item) => (
                <section key={item.type}>
                  <p>
                    {item.type}: {item.count}
                  </p>
                  {item.examples?.map((example) => (
                    <p key={example.id}>{example.displayName}</p>
                  ))}
                </section>
              ))}
              {impact.cascadingDeletes.map((item) => (
                <p key={item.type}>
                  {item.type}: {item.count}
                </p>
              ))}
              {impact.detachedReferences.map((item) => (
                <p key={item.type}>
                  {item.type}: {item.count}
                </p>
              ))}
              {!!impact.unaffectedEntities.length && (
                <p>
                  {t('preservedEntities')}:{' '}
                  {impact.unaffectedEntities.map((item) => item.type).join(', ')}
                </p>
              )}
              {impact.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </>
          )}
          {action.error && (
            <StaffError error={action.error} reload={() => void preview.refetch()} />
          )}
          <GLActionBar>
            <GLButton variant="ghost" disabled={action.isPending} onClick={onClose}>
              {impact && !impact.allowed ? t('close') : t('cancel')}
            </GLButton>
            {impact?.allowed && (
              <GLButton
                variant="destructive"
                loading={action.isPending}
                onClick={() =>
                  action.mutate(
                    async () => {
                      const result = await api.request(
                        path,
                        deletionResultSchema,
                        {
                          expectedVersion: impact.expectedVersion,
                          impactRevision: impact.impactRevision,
                          confirmed: true,
                        },
                        'DELETE',
                      );
                      await cache.invalidateQueries({
                        queryKey: ['staff', 'deletion-impact'],
                        refetchType: 'none',
                      });
                      if ('id' in result) {
                        setOperation(result);
                        if (session.data) {
                          const key = 'gl.deletion-operations.' + session.data.account.id;
                          const entry = { id: result.id, media: scope === 'media' };
                          try {
                            const history = readHistory(key);
                            localStorage.setItem(
                              key,
                              JSON.stringify(
                                [entry, ...history.filter((x) => x.id !== entry.id)].slice(0, 20),
                              ),
                            );
                          } catch {
                            /* The accepted operation remains available through its ID when browser storage is unavailable. */
                          }
                          await cache.invalidateQueries({
                            queryKey: ['staff', 'deletion-history'],
                          });
                        }
                        if (result.status !== 'COMPLETED') notify?.(t('deletionStarted'));
                      } else {
                        notify?.(t('deletionCompleted'));
                        onClose();
                      }
                      onAccepted?.();
                    },
                    { onError: () => void preview.refetch() },
                  )
                }
              >
                {action.isPending ? t('deleting') : t('permanentlyDelete')}
              </GLButton>
            )}
          </GLActionBar>
        </>
      )}
      {operation && (
        <>
          <p role="status">
            {completed
              ? t('deletionCompleted')
              : rejected
                ? t('deletionRejected')
                : failed
                  ? t('deletionFailed')
                  : t('deletionInProgress')}
          </p>
          <p>
            <bdi>{operation.id}</bdi>
          </p>
          {status.error && <StaffError error={status.error} reload={() => void status.refetch()} />}
          <GLButton variant="ghost" onClick={onClose}>
            {t('close')}
          </GLButton>
        </>
      )}
    </GLModal>
  );
}

type OperationLink = { id: string; media: boolean };
function readHistory(key: string): OperationLink[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value)
      ? value
          .filter(
            (x): x is OperationLink =>
              typeof x?.id === 'string' &&
              /^[0-9a-f-]{36}$/.test(x.id) &&
              typeof x.media === 'boolean',
          )
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
/** Browser history stores operational IDs only; owning services remain the source of status. */
export function DeletionOperations() {
  const session = useStaffSession(),
    api = useStaffApi(),
    t = useAdminTranslation();
  const [selected, setSelected] = useState<OperationLink | null>(null);
  const history = useQuery({
    queryKey: ['staff', 'deletion-history', session.data?.account.id],
    enabled: !!session.data,
    queryFn: () => readHistory('gl.deletion-operations.' + session.data!.account.id),
  });
  const status = useQuery({
    queryKey: ['staff', 'deletion-history-status', selected?.id],
    enabled: !!selected,
    queryFn: ({ signal }) =>
      api.request(
        (selected!.media
          ? '/admin/media/deletion-operations/'
          : '/admin/products/deletion-operations/') + selected!.id,
        deletionOperationSchema,
        undefined,
        'GET',
        signal,
      ),
  });
  if (!history.data?.length) return null;
  return (
    <section aria-label={t('deletionOperations')}>
      <h2>{t('deletionOperations')}</h2>
      <p>{t('deletionHistoryHelp')}</p>
      {history.data.map((entry) => (
        <GLButton
          key={entry.id}
          variant="ghost"
          onClick={() => {
            setSelected(entry);
            if (selected?.id === entry.id) void status.refetch();
          }}
        >
          <bdi>{entry.id}</bdi>
        </GLButton>
      ))}
      {status.data && (
        <p role="status">
          {status.data.status === 'COMPLETED'
            ? t('deletionCompleted')
            : status.data.failureCode === 'DELETE_IMPACT_CHANGED'
              ? t('deletionRejected')
              : status.data.status === 'RETRYABLE'
                ? t('deletionFailed')
                : t('deletionInProgress')}{' '}
          {status.data.failureCode}
        </p>
      )}
      {status.error && <StaffError error={status.error} reload={() => void status.refetch()} />}
    </section>
  );
}
