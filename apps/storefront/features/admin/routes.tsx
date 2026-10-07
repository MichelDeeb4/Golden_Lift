import { usePathname } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { GLAlert, GLPageHeader } from '@golden-lift/ui';
import { pageSchema, productRowSchema, mediaAssetSchema } from '@golden-lift/api';
import { useLocale } from '@golden-lift/i18n';
import { TableState } from './common';
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
    api = useStaffApi(),
    { locale } = useLocale();
  const products = useQuery({
    queryKey: ['staff', 'dashboard-products', locale],
    queryFn: ({ signal }) =>
      api.request(
        '/admin/products?limit=5&locale=' + locale,
        pageSchema(productRowSchema),
        undefined,
        'GET',
        signal,
      ),
  });
  const assets = useQuery({
    queryKey: ['staff', 'dashboard-assets'],
    queryFn: ({ signal }) =>
      api.request(
        '/admin/media/assets?limit=5',
        z.object({ items: z.array(mediaAssetSchema), next: z.string().nullable() }),
        undefined,
        'GET',
        signal,
      ),
  });
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
      <GLPageHeader title={t('dashboard')} description={t('operationalHelp')} />
      <div className="gl-launchpad">
        <div>
          <h2 className="gl-launchpad-title">{t('createProductHelp')}</h2>
          <a className="gl-button gl-button-primary gl-button-md" href="/admin/products/new">
            {t('create')} — {t('products')}
          </a>
        </div>
        <div className="gl-launchpad-links">
          <a href="/admin/products">
            {t('products')} <span aria-hidden="true">↗</span>
          </a>
          <a href="/admin/categories">
            {t('categories')} <span aria-hidden="true">↗</span>
          </a>
          <a href="/admin/media">
            {t('uploadMedia')} <span aria-hidden="true">↗</span>
          </a>
          <a href="/admin/product-types">
            {t('types')} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
      <div className="gl-recent-work">
        <section aria-label={t('products')}>
          <h2>{t('products')}</h2>
          <p className="gl-feed-help">{t('boundedFeed')}</p>
          <TableState
            presentation="content"
            pending={products.isPending}
            error={products.error}
            empty={!products.data?.items.length}
          >
            {products.data?.items.map((product) => (
              <a key={product.id} href={'/admin/products/' + product.id}>
                {product.name}
                <small>
                  <bdi>{product.modelCode}</bdi> · {product.categoryName} ·{' '}
                  {product.active ? t('active') : t('inactive')} ·{' '}
                  <time dateTime={product.updatedAt}>
                    {new Date(product.updatedAt).toLocaleDateString(locale)}
                  </time>
                </small>
              </a>
            ))}
          </TableState>
        </section>
        <section aria-label={t('media')}>
          <h2>{t('media')}</h2>
          <p className="gl-feed-help">{t('boundedFeed')}</p>
          <TableState
            presentation="content"
            pending={assets.isPending}
            error={assets.error}
            empty={!assets.data?.items.length}
          >
            {assets.data?.items.map((asset) => (
              <a key={asset.id} href={'/admin/media/' + asset.id}>
                {asset.name}
                <small>
                  {asset.kind} / {asset.status}
                </small>
              </a>
            ))}
          </TableState>
          {media.isPending && <p>{t('loading')}</p>}
          {media.error && <GLAlert tone="error">{t('error')}</GLAlert>}
          {media.data && (
            <>
              <div className="gl-operational-metric">
                <span>{t('processing')}</span>
                <strong>
                  <bdi>{media.data.pendingJobs}</bdi>
                </strong>
              </div>
            </>
          )}
        </section>
      </div>
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
