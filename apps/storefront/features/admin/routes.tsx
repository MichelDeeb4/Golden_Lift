import { Plus } from '@business-platform/icons';
import { DeletionOperations } from './deletion';
import { usePathname } from 'expo-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { BPAlert, BPPageHeader, BPButton } from '@business-platform/ui';
import { pageSchema, productRowSchema, mediaAssetSchema } from '@business-platform/api';
import { useLocale } from '@business-platform/i18n';
import { TableState } from './common';
import { StaffShell, useStaffApi } from './context';
import { Account, AdminAccounts } from './accounts';
import { Categories } from './categories';
import { Configuration } from './configuration';
import type { ConfigurationResource } from './configuration';
import { MediaLibrary } from './media';
import { ProductEditor, Products } from './products';
import { CreateProduct } from './create-product';
import { useAdminTranslation } from './translations';
import { StaffAuthAction } from './auth-actions';
function Dashboard() {
  const [creating, setCreating] = useState(false);
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
      <BPPageHeader title={t('dashboard')} description={t('operationalHelp')} />
      <CreateProduct open={creating} onClose={() => setCreating(false)} />
      <DeletionOperations />
      <div className="bp-launchpad">
        <div>
          <h2 className="bp-launchpad-title">{t('createProductHelp')}</h2>
          <BPButton onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden="true" />
            {t('createProduct')}
          </BPButton>
        </div>
        <div className="bp-launchpad-links">
          <a href="/admin/products">
            {t('products')} <span aria-hidden="true">↗</span>
          </a>
          <a href="/admin/categories">
            {t('categories')} <span aria-hidden="true">↗</span>
          </a>
          <a href="/admin/media">
            {t('uploadMedia')} <span aria-hidden="true">↗</span>
          </a>
          <a href="/admin/attribute-groups">{t('groups')}</a>
        </div>
      </div>
      <div className="bp-recent-work">
        <section aria-label={t('products')}>
          <h2>{t('products')}</h2>
          <p className="bp-feed-help">{t('boundedFeed')}</p>
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
          <p className="bp-feed-help">{t('boundedFeed')}</p>
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
          {media.error && <BPAlert tone="error">{t('error')}</BPAlert>}
          {media.data && (
            <>
              <div className="bp-operational-metric">
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
  const t = useAdminTranslation();
  const parts = usePathname().split('/').filter(Boolean),
    resource = parts[1],
    id = parts[2];
  if (resource === 'account') return <Account />;
  if (parts[0] === 'super-admin' && resource === 'admins') return <AdminAccounts id={id} />;
  if (resource === 'categories') return <Categories id={id} />;
  if (resource === 'products')
    return id === 'new' ? (
      <Products create />
    ) : id ? (
      <ProductEditor key={id} id={id} />
    ) : (
      <Products />
    );
  if (resource === 'media') return <MediaLibrary id={id} />;
  if (['attributes', 'attribute-groups', 'units'].includes(resource ?? ''))
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
    return <StaffAuthAction action={resource} />;
  return (
    <StaffShell>
      <Page />
    </StaffShell>
  );
}
