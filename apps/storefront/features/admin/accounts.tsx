import { useLocale } from '@business-platform/i18n';
import { Plus, X, Save, Trash2, CircleCheck, CircleOff, Link } from '@business-platform/icons';
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { pageSchema, staffAccountSchema } from '@business-platform/api';
import {
  BPAlert,
  BPStatusBadge,
  BPButton,
  BPActionMenu,
  BPModal,
  BPPageHeader,
  BPFormSection,
  BPInput,
  BPFilterToolbar,
} from '@business-platform/ui';
import { useStaffApi, useStaffSession, useUnsaved, useConfirmDiscard, StaffError } from './context';
import { useAdminTranslation } from './translations';
import { ActionFeedback, TableState, FocusedEditor, jsonResponse, useAction } from './common';
import { AdminPagination, useAdminPagination } from './pagination';
const inviteSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1).max(150),
});
export function AdminAccounts({ id }: { id?: string }) {
  const [editingAccount, setEditingAccount] = useState<z.infer<typeof staffAccountSchema> | null>(
    null,
  );
  const api = useStaffApi(),
    { locale } = useLocale(),
    t = useAdminTranslation(),
    [deliveryFailed, setDeliveryFailed] = useState(false),
    [reviewed, setReviewed] = useState<{
      account: z.infer<typeof staffAccountSchema>;
      operation: 'disable' | 'enable' | 'invitation' | 'delete';
      label: string;
    } | null>(null),
    action = useAction(),
    form = useForm<z.infer<typeof inviteSchema>>({ resolver: zodResolver(inviteSchema) });
  const pagination = useAdminPagination('cursor');
  const collectionHref = '/super-admin/admins' + window.location.search;
  const rows = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['staff', 'admins', pagination.pageSize, pagination.cursor],
    queryFn: ({ signal }) =>
      api.request(
        '/staff/admins?limit=' +
          pagination.pageSize +
          (pagination.cursor ? '&cursor=' + encodeURIComponent(pagination.cursor) : ''),
        pageSchema(staffAccountSchema),
        undefined,
        'GET',
        signal,
      ),
  });
  const detail = useQuery({
    queryKey: ['staff', 'admins', 'detail', id],
    queryFn: ({ signal }) =>
      api.request('/staff/admins/' + id, staffAccountSchema, undefined, 'GET', signal),
    enabled: !!id,
  });
  useUnsaved(form.formState.isDirty);
  const records = id ? (detail.data ? [detail.data] : []) : (rows.data?.items ?? []);
  return (
    <>
      <BPPageHeader
        title={t('admins')}
        description={t('accountHelp')}
        breadcrumbs={[
          { label: t('staff'), href: collectionHref },
          {
            label: id ? t('view') : t('admins'),
            href: id ? '/super-admin/admins/' + id : '/super-admin/admins',
          },
        ]}
      />
      <ActionFeedback action={action} />
      {deliveryFailed && <BPAlert tone="error">{t('deliveryFailed')}</BPAlert>}
      {!id && (
        <BPFormSection title={t('invite')}>
          <form
            className="bp-staff-invitation"
            onSubmit={form.handleSubmit((v) =>
              action.mutate(
                () =>
                  api.request(
                    '/staff/admins',
                    z.object({ account: staffAccountSchema, delivery: z.enum(['SENT', 'FAILED']) }),
                    v,
                    'POST',
                  ),
                {
                  onSuccess: (result) => {
                    setDeliveryFailed(
                      (result as { delivery: 'SENT' | 'FAILED' }).delivery === 'FAILED',
                    );
                    form.reset();
                  },
                },
              ),
            )}
          >
            <div className="bp-admin-grid bp-invitation-grid">
              <BPInput
                label={t('displayName')}
                {...form.register('displayName')}
                error={form.formState.errors.displayName ? t('error') : undefined}
              />
              <BPInput
                label={t('email')}
                type="email"
                {...form.register('email')}
                error={form.formState.errors.email ? t('error') : undefined}
              />
            </div>
            <BPButton type="submit" loading={action.isPending}>
              <Plus size={18} aria-hidden="true" />
              {t('invite')}
            </BPButton>
          </form>
        </BPFormSection>
      )}
      {!id && (
        <BPFilterToolbar label={t('admins')}>
          <span>
            {t('showing')}: {rows.data?.items.length ?? 0} {t('of')} {rows.data?.totalItems ?? '—'}
          </span>
        </BPFilterToolbar>
      )}
      <TableState
        pending={id ? detail.isPending : rows.isPending}
        error={id ? detail.error : rows.error}
        empty={!records.length}
        onRetry={() => void (id ? detail.refetch() : rows.refetch())}
      >
        <table>
          <thead>
            <tr>
              <th>{t('name')}</th>
              <th>{t('email')}</th>
              <th>{t('role')}</th>
              <th>{t('status')}</th>
              <th>{t('updated')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {records.map((row) => (
              <tr key={row.id}>
                <td>
                  <a href={'/super-admin/admins/' + row.id + window.location.search}>
                    {row.displayName}
                  </a>
                </td>
                <td>
                  <bdi>{row.email}</bdi>
                </td>
                <td>{row.role === 'SUPER_ADMIN' ? t('superAdminRole') : t('adminRole')}</td>
                <td>
                  <BPStatusBadge state={row.status} />
                </td>
                <td>
                  <time dateTime={row.updatedAt} title={row.updatedAt}>
                    <bdi>
                      {new Date(row.updatedAt).toLocaleDateString(
                        locale === 'ckb' ? 'ar-IQ' : locale,
                      )}
                    </bdi>
                  </time>
                </td>
                <td>
                  <BPActionMenu
                    label={t('actions')}
                    items={[
                      {
                        label: t('edit'),
                        icon: 'edit',
                        onSelect: () => setEditingAccount(row),
                      },
                      {
                        label: row.status === 'DISABLED' ? t('enable') : t('disable'),
                        icon: row.status === 'DISABLED' ? 'enable' : 'disable',
                        tone: row.status === 'DISABLED' ? 'success' : 'warning',
                        onSelect: () =>
                          setReviewed({
                            account: row,
                            operation: row.status === 'DISABLED' ? 'enable' : 'disable',
                            label: row.status === 'DISABLED' ? t('enable') : t('disable'),
                          }),
                      },
                      ...(row.status === 'INVITED'
                        ? [
                            {
                              label: t('resend'),
                              icon: 'link' as const,
                              onSelect: () =>
                                setReviewed({
                                  account: row,
                                  operation: 'invitation',
                                  label: t('resend'),
                                }),
                            },
                          ]
                        : []),
                      {
                        label: t('remove'),
                        icon: 'delete',
                        destructive: true,
                        onSelect: () =>
                          setReviewed({ account: row, operation: 'delete', label: t('remove') }),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableState>
      {editingAccount && (
        <StaffAccountEditor
          key={editingAccount.id}
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
        />
      )}
      <BPModal
        open={!!reviewed}
        title={reviewed?.label ?? t('confirm')}
        onClose={() => {
          if (!action.isPending) setReviewed(null);
        }}
      >
        <p>
          {reviewed?.account.displayName} — {reviewed?.account.email}
        </p>
        <p>{t('confirmAction')}</p>
        <ActionFeedback action={action} />
        <BPButton
          variant={
            reviewed?.operation === 'delete'
              ? 'destructive'
              : reviewed?.operation === 'enable'
                ? 'success'
                : 'warning'
          }
          loading={action.isPending}
          onClick={() => {
            if (!reviewed) return;
            const { account, operation } = reviewed;
            action.mutate(
              () =>
                api.request(
                  `/staff/admins/${account.id}${operation === 'delete' ? '' : '/' + operation}`,
                  jsonResponse,
                  { expectedVersion: account.version },
                  operation === 'delete' ? 'DELETE' : 'POST',
                ),
              { onSuccess: () => setReviewed(null) },
            );
          }}
        >
          {reviewed?.operation === 'delete' ? (
            <Trash2 size={18} aria-hidden="true" />
          ) : reviewed?.operation === 'enable' ? (
            <CircleCheck size={18} aria-hidden="true" />
          ) : reviewed?.operation === 'invitation' ? (
            <Link size={18} aria-hidden="true" />
          ) : (
            <CircleOff size={18} aria-hidden="true" />
          )}
          {t('confirm')}
        </BPButton>
        <BPButton variant="secondary" disabled={action.isPending} onClick={() => setReviewed(null)}>
          <X size={18} aria-hidden="true" />
          {t('cancel')}
        </BPButton>
      </BPModal>
      {!id && (
        <AdminPagination
          pagination={pagination}
          data={rows.data}
          loading={rows.isFetching}
          placeholder={rows.isPlaceholderData}
        />
      )}
    </>
  );
}
function StaffAccountEditor({
  account,
  onClose,
}: {
  account: z.infer<typeof staffAccountSchema>;
  onClose: () => void;
}) {
  const api = useStaffApi(),
    t = useAdminTranslation(),
    action = useAction(),
    confirmDiscard = useConfirmDiscard();
  const [snapshot, setSnapshot] = useState(account);
  const [reloadError, setReloadError] = useState<unknown>(null);
  const [reloading, setReloading] = useState(false);
  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { displayName: account.displayName, email: account.email },
  });
  useUnsaved(form.formState.isDirty);
  const reload = async () => {
    if (form.formState.isDirty && !(await confirmDiscard())) return;
    setReloading(true);
    try {
      const latest = await api.request('/staff/admins/' + account.id, staffAccountSchema);
      setSnapshot(latest);
      form.reset({ displayName: latest.displayName, email: latest.email });
      action.reset();
      setReloadError(null);
    } catch (error) {
      setReloadError(error);
    } finally {
      setReloading(false);
    }
  };
  return (
    <FocusedEditor
      dialog
      open
      title={t('edit')}
      dirty={form.formState.isDirty}
      pending={action.isPending || reloading}
      onClose={onClose}
    >
      <p>{snapshot.displayName}</p>
      <form
        onSubmit={form.handleSubmit((input) =>
          action.mutate(
            () =>
              api.request(
                '/staff/admins/' + account.id,
                staffAccountSchema,
                { ...input, expectedVersion: snapshot.version },
                'PATCH',
              ),
            { onSuccess: onClose },
          ),
        )}
      >
        <BPInput
          label={t('displayName')}
          disabled={action.isPending || reloading}
          {...form.register('displayName')}
          error={form.formState.errors.displayName ? t('error') : undefined}
        />
        <BPInput
          label={t('email')}
          disabled={action.isPending || reloading}
          type="email"
          {...form.register('email')}
          error={form.formState.errors.email ? t('error') : undefined}
        />
        <ActionFeedback action={action} reload={() => void reload()} />
        {reloadError != null && <StaffError error={reloadError} reload={() => void reload()} />}
        <div className="bp-dialog-actions">
          <BPButton
            variant="secondary"
            disabled={action.isPending || reloading}
            onClick={async () => {
              if (!form.formState.isDirty || (await confirmDiscard())) onClose();
            }}
          >
            <X size={18} aria-hidden="true" />
            {t('cancel')}
          </BPButton>
          <BPButton type="submit" loading={action.isPending || reloading}>
            <Save size={18} aria-hidden="true" />
            {t('save')}
          </BPButton>
        </div>
      </form>
    </FocusedEditor>
  );
}
const passwordSchema = z.object({
  oldPassword: z.string().min(1).max(512),
  password: z.string().min(15).max(128),
});
export function Account() {
  const api = useStaffApi(),
    session = useStaffSession(),
    action = useAction(),
    t = useAdminTranslation(),
    form = useForm<z.infer<typeof passwordSchema>>({
      resolver: zodResolver(passwordSchema),
      defaultValues: { oldPassword: '', password: '' },
    });
  useUnsaved(form.formState.isDirty);
  return (
    <>
      <BPPageHeader title={t('account')} />
      <BPFormSection title={t('identity')}>
        <p>
          {session.data?.account.displayName} · {session.data?.account.email}
        </p>
        <p>
          {t('expires')}: {session.data?.expiresAt}
        </p>
      </BPFormSection>
      <BPFormSection title={t('changePassword')}>
        <form
          onSubmit={form.handleSubmit((v) =>
            action.mutate(() => api.request('/auth/password/change', jsonResponse, v, 'POST'), {
              onSuccess: () => {
                form.reset();
                void api.logout().catch(() => {});
              },
            }),
          )}
        >
          <BPInput
            label={t('oldPassword')}
            type="password"
            autoComplete="current-password"
            {...form.register('oldPassword')}
          />
          <BPInput
            label={t('newPassword')}
            type="password"
            autoComplete="new-password"
            {...form.register('password')}
            error={form.formState.errors.password ? t('error') : undefined}
          />
          <ActionFeedback action={action} />
          <p role="status">{form.formState.isDirty ? t('dirty') : t('saved')}</p>
          <BPButton type="submit" loading={action.isPending}>
            {t('changePassword')}
          </BPButton>
        </form>
      </BPFormSection>
    </>
  );
}
