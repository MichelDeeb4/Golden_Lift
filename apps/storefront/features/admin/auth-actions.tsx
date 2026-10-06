import { useStaffActionToken } from './action-token';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GLButton, GLHeading, GLInput, GLLanguageSwitcher } from '@golden-lift/ui';
import { useStaffApi } from './context';
import { ActionFeedback, useAction } from './common';
import { useAdminTranslation } from './translations';

const passwordForm = z
  .object({ password: z.string().min(15).max(128), confirmation: z.string() })
  .refine((v) => v.password === v.confirmation, { path: ['confirmation'] });
const emailForm = z.object({ email: z.string().email().max(254) });
/** Action tokens remain in memory and are removed from the address bar before submission. */
export function StaffAuthAction({
  action: kind,
}: {
  action: 'invitation' | 'password-reset' | 'reset-request';
}) {
  const api = useStaffApi(),
    t = useAdminTranslation(),
    action = useAction();
  const { token, clear } = useStaffActionToken(`/admin/${kind}`);
  const password = useForm<z.infer<typeof passwordForm>>({ resolver: zodResolver(passwordForm) });
  const email = useForm<z.infer<typeof emailForm>>({ resolver: zodResolver(emailForm) });
  return (
    <main className="gl-admin-login">
      <GLLanguageSwitcher />
      <GLHeading level={1} role="heading3">
        {kind === 'invitation' ? t('invite') : t('changePassword')}
      </GLHeading>
      <ActionFeedback action={action} />
      {kind === 'reset-request' ? (
        <form
          onSubmit={email.handleSubmit((v) =>
            action.mutate(() =>
              api.request(
                '/auth/password/reset-request',
                z.object({ accepted: z.literal(true) }),
                v,
                'POST',
              ),
            ),
          )}
        >
          <GLInput
            label={t('email')}
            type="email"
            autoComplete="username"
            {...email.register('email')}
            error={email.formState.errors.email ? t('error') : undefined}
          />
          <GLButton type="submit" loading={action.isPending}>
            {t('apply')}
          </GLButton>
        </form>
      ) : (
        <form
          onSubmit={password.handleSubmit((v) =>
            action.mutate(
              () =>
                api.request(
                  kind === 'invitation' ? '/auth/invitations/accept' : '/auth/password/reset',
                  z.unknown(),
                  { token, password: v.password },
                  'POST',
                ),
              {
                onSuccess: () => {
                  password.reset();
                  clear();
                },
              },
            ),
          )}
        >
          <GLInput
            label={t('newPassword')}
            type="password"
            autoComplete="new-password"
            {...password.register('password')}
            error={password.formState.errors.password ? t('error') : undefined}
          />
          <GLInput
            label={t('confirm')}
            type="password"
            autoComplete="new-password"
            {...password.register('confirmation')}
            error={password.formState.errors.confirmation ? t('error') : undefined}
          />
          <GLButton type="submit" disabled={!token || action.saved} loading={action.isPending}>
            {t('apply')}
          </GLButton>
        </form>
      )}
      <a href="/admin/login">{t('login')}</a>
    </main>
  );
}
