import { usePathname } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { GLAlert, GLHeading } from '@golden-lift/ui';
import { StaffProvider, StaffShell, useStaffApi } from './context';
import { Account, AdminAccounts } from './accounts';
import { Categories } from './categories';
import { Configuration } from './configuration';
import type { ConfigurationResource } from './configuration';
import { MediaLibrary } from './media';
import { ProductEditor, Products } from './products';
import { useAdminTranslation } from './translations';
import { StaffAuthAction } from './auth-actions';
function Dashboard() {
  const t = useAdminTranslation(),
    api = useStaffApi();
  const media = useQuery({
    queryKey: ['staff', 'media-statistics'],
    queryFn: ({ signal }) =>
      api.request(
        '/admin/media/statistics',
        z.object({ pendingJobs: z.string(), pendingEvents: z.string() }),
        undefined,
        'GET',
        signal,
      ),
  });
  return (
    <>
      <GLHeading level={1} role="heading3">
        {t('dashboard')}
      </GLHeading>
      <GLAlert>{t('noStats')}</GLAlert>
      <div className="gl-admin-toolbar">
        <a href="/admin/products/new">
          {t('create')} — {t('products')}
        </a>
        <a href="/admin/categories">{t('categories')}</a>
        <a href="/admin/media">{t('upload')}</a>
      </div>
      {media.data && (
        <p>
          {t('media')} — {t('processing')}: {media.data.pendingJobs}
        </p>
      )}
    </>
  );
}
function Page() {
  const parts = usePathname().split('/').filter(Boolean),
    resource = parts[1],
    id = parts[2];
  if (resource === 'account') return <Account />;
  if (parts[0] === 'super-admin' && resource === 'admins') return <AdminAccounts id={id} />;
  if (resource === 'categories') return <Categories id={id} />;
  if (resource === 'products')
    return id ? <ProductEditor key={id} id={id === 'new' ? undefined : id} /> : <Products />;
  if (resource === 'media') return <MediaLibrary id={id} />;
  if (['product-types', 'attributes', 'attribute-groups', 'units'].includes(resource ?? ''))
    return (
      <Configuration
        key={resource + ':' + id}
        resource={resource as ConfigurationResource}
        id={id}
      />
    );
  return <Dashboard />;
}
export function StaffRoute() {
  const resource = usePathname().split('/')[2];
  if (resource === 'invitation' || resource === 'password-reset' || resource === 'reset-request')
    return (
      <StaffProvider>
        <StaffAuthAction action={resource} />
      </StaffProvider>
    );
  return (
    <StaffProvider>
      <StaffShell>
        <Page />
      </StaffShell>
    </StaffProvider>
  );
}
