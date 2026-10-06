import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { pageSchema, staffAccountSchema } from '@golden-lift/api';
import { GLAlert, GLButton, GLHeading, GLInput } from '@golden-lift/ui';
import { useStaffApi, useStaffSession, useUnsaved } from './context';
import { useAdminTranslation } from './translations';
import { ActionFeedback, ApiCommand, TableState, jsonResponse, useAction } from './common';
const inviteSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1).max(150),
});
export function AdminAccounts({ id }: { id?: string }) {
  const api = useStaffApi(),
    t = useAdminTranslation(),
    [cursor, setCursor] = useState(''),
    [deliveryFailed, setDeliveryFailed] = useState(false),
    action = useAction(),
    form = useForm<z.infer<typeof inviteSchema>>({ resolver: zodResolver(inviteSchema) });
  const rows = useQuery({
    queryKey: ['staff', 'admins', cursor],
    queryFn: ({ signal }) =>
      api.request(
        '/staff/admins?limit=25' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
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
      <GLHeading level={1} role="heading3">
        {t('admins')}
      </GLHeading>
      <ActionFeedback action={action} />
      {deliveryFailed && <GLAlert tone="error">{t('deliveryFailed')}</GLAlert>}
      {!id && (
        <form
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
          <div className="gl-admin-grid">
            <GLInput
              label={t('displayName')}
              {...form.register('displayName')}
              error={form.formState.errors.displayName ? t('error') : undefined}
            />
            <GLInput
              label={t('email')}
              type="email"
              {...form.register('email')}
              error={form.formState.errors.email ? t('error') : undefined}
            />
          </div>
          <GLButton type="submit" loading={action.isPending}>
            {t('invite')}
          </GLButton>
        </form>
      )}
      <TableState
        pending={id ? detail.isPending : rows.isPending}
        error={id ? detail.error : rows.error}
        empty={!records.length}
      >
        <table>
          <thead>
            <tr>
              <th>{t('name')}</th>
              <th>{t('email')}</th>
              <th>{t('status')}</th>
              <th>{t('version')}</th>
              <th>{t('edit')}</th>
            </tr>
          </thead>
          <tbody>
            {records.map((row) => (
              <tr key={row.id}>
                <td>
                  <a href={'/super-admin/admins/' + row.id}>{row.displayName}</a>
                </td>
                <td>{row.email}</td>
                <td>{row.status}</td>
                <td>{row.version}</td>
                <td>
                  <div className="gl-admin-toolbar">
                    <ApiCommand
                      path={`/staff/admins/${row.id}/${row.status === 'DISABLED' ? 'enable' : 'disable'}`}
                      body={{ expectedVersion: row.version }}
                      label={row.status === 'DISABLED' ? t('enable') : t('disable')}
                    />
                    {row.status === 'INVITED' && (
                      <ApiCommand
                        path={`/staff/admins/${row.id}/invitation`}
                        body={{ expectedVersion: row.version }}
                        label={t('resend')}
                      />
                    )}
                    <ApiCommand
                      path={`/staff/admins/${row.id}`}
                      method="DELETE"
                      body={{ expectedVersion: row.version }}
                      label={t('remove')}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableState>
      {!id && rows.data?.nextCursor && (
        <GLButton variant="secondary" onClick={() => setCursor(rows.data!.nextCursor!)}>
          {t('next')}
        </GLButton>
      )}
    </>
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
    form = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });
  useUnsaved(form.formState.isDirty);
  return (
    <>
      <GLHeading level={1} role="heading3">
        {t('account')}
      </GLHeading>
      <p>
        {session.data?.account.displayName} · {session.data?.account.email}
      </p>
      <p>
        {t('expires')}: {session.data?.expiresAt}
      </p>
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
        <GLInput
          label={t('oldPassword')}
          type="password"
          autoComplete="current-password"
          {...form.register('oldPassword')}
        />
        <GLInput
          label={t('newPassword')}
          type="password"
          autoComplete="new-password"
          {...form.register('password')}
          error={form.formState.errors.password ? t('error') : undefined}
        />
        <ActionFeedback action={action} />
        <GLButton type="submit" loading={action.isPending}>
          {t('changePassword')}
        </GLButton>
      </form>
    </>
  );
}
