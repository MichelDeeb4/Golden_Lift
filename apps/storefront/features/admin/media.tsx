import { DeletionDialog } from './deletion';
import {
  ArrowUpDown,
  Upload as UploadIcon,
  FilterX,
  Play,
  FileText,
} from '@business-platform/icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { mediaAssetSchema, uploadSchema } from '@business-platform/api';
import {
  BPAlert,
  BPButton,
  BPBadge,
  BPStatusBadge,
  BPFilterToolbar,
  BPActionMenu,
  BPHeading,
  BPInput,
  BPModal,
  BPSelect,
  BPPageHeader,
  BPDrawer,
  BPConfirmDialog,
} from '@business-platform/ui';
import { StaffError, useStaffApi } from './context';
import { useAdminTranslation } from './translations';
import { ActionFeedback, Confirm, TableState, jsonResponse, useAction } from './common';
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
import { AdminPagination, useAdminPagination } from './pagination';
import { useLocalSearchParams } from 'expo-router';
const librarySchema = z.object({
  items: z.array(mediaAssetSchema),
  next: z.string().nullable(),
  totalItems: z.number().int().nonnegative(),
});
const grantSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        !url.username &&
        !url.password &&
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
      );
    }),
  expiresAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  method: z.literal('GET'),
});
export function PdfDownload({ assetId }: { assetId: string }) {
  const api = useStaffApi(),
    t = useAdminTranslation(),
    action = useAction('media'),
    [grant, setGrant] = useState<z.infer<typeof grantSchema> | null>(null);
  useEffect(() => {
    if (!grant) return;
    const timer = setTimeout(
      () => setGrant(null),
      Math.max(0, Date.parse(grant.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [grant]);
  return (
    <>
      <BPButton
        variant="secondary"
        onClick={() =>
          action.mutate(
            () =>
              api.request(
                `/admin/media/assets/${assetId}/variants/original/authorization?action=DOWNLOAD`,
                grantSchema,
              ),
            { onSuccess: (result) => setGrant(result as z.infer<typeof grantSchema>) },
          )
        }
      >
        {t('open')} — PDF
      </BPButton>
      <ActionFeedback action={action} />
      {grant && (
        <a
          href={grant.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setGrant(null)}
        >
          {t('documents')}
        </a>
      )}
    </>
  );
}
export function MediaPreview({
  asset,
  profile,
}: {
  asset: Pick<MediaAsset, 'id' | 'kind'> &
    Partial<Pick<MediaAsset, 'status' | 'security' | 'version'>>;
  profile?: string;
}) {
  const api = useStaffApi(),
    t = useAdminTranslation(),
    [failed, setFailed] = useState(false),
    [visible, setVisible] = useState(false),
    host = useRef<HTMLDivElement>(null),
    refreshes = useRef(0),
    selected =
      profile ??
      (asset.kind === 'IMAGE' ? 'thumbnail' : asset.kind === 'VIDEO' ? 'poster' : 'preview');
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: '256px' },
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setFailed(false);
    refreshes.current = 0;
  }, [asset.id, asset.version, selected]);
  const grant = useQuery({
    queryKey: ['staff', 'media-preview', asset.id, selected, asset.version],
    queryFn: ({ signal }) =>
      api.request(
        `/admin/media/assets/${asset.id}/variants/${selected}/authorization`,
        grantSchema,
        undefined,
        'GET',
        signal,
      ),
    enabled:
      visible &&
      (asset.status === undefined || asset.status === 'READY') &&
      asset.security !== 'BLOCKED',
    staleTime: 0,
    refetchInterval: visible ? 30000 : false,
  });
  function content() {
    if (grant.error) return <StaffError error={grant.error} reload={() => void grant.refetch()} />;
    if (failed)
      return (
        <BPAlert tone="error">
          {t('error')}
          <BPButton
            variant="secondary"
            onClick={() =>
              void grant.refetch().then((result) => {
                if (!result.isError) {
                  refreshes.current = 0;
                  setFailed(false);
                }
              })
            }
          >
            <ArrowUpDown size={18} aria-hidden="true" />
            {t('retry')}
          </BPButton>
        </BPAlert>
      );
    if (!grant.data || Date.parse(grant.data.expiresAt) <= Date.now())
      return <BPAlert>{t(asset.status === 'READY' ? 'preview' : 'processing')}</BPAlert>;
    return selected === 'playback' ? (
      <video controls preload="metadata" src={grant.data.url} aria-label={t('preview')} />
    ) : (
      <img
        src={grant.data.url}
        alt={t('preview')}
        loading="lazy"
        onError={() => {
          if (refreshes.current++ === 0) void grant.refetch();
          else setFailed(true);
        }}
      />
    );
  }
  return (
    <div ref={host} className="bp-admin-preview">
      {content()}
    </div>
  );
}
export function Upload({ allowedKind }: { allowedKind?: MediaAsset['kind'] }) {
  const api = useStaffApi(),
    t = useAdminTranslation(),
    action = useAction('media'),
    [file, setFile] = useState<File | null>(null),
    [session, setSession] = useState<z.infer<typeof uploadSchema> | null>(null),
    [progress, setProgress] = useState(0),
    abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const capabilities = useQuery({
    queryKey: ['staff', 'media-capabilities'],
    queryFn: ({ signal }) =>
      api.request(
        '/admin/media/capabilities',
        z.object({
          scannerAvailable: z.boolean(),
          mimeTypes: z.object({
            IMAGE: z.array(z.string()),
            VIDEO: z.array(z.string()),
            PDF: z.array(z.string()),
          }),
          limits: z.object({
            maxBytes: z.object({ IMAGE: z.number(), VIDEO: z.number(), PDF: z.number() }),
          }),
        }),
        undefined,
        'GET',
        signal,
      ),
    refetchInterval: 10000,
  });
  const selectedKind =
    file && capabilities.data
      ? (['IMAGE', 'VIDEO', 'PDF'] as const).find((kind) =>
          capabilities.data!.mimeTypes[kind].includes(file.type),
        )
      : undefined;
  const fileProblem =
    file && capabilities.data
      ? !selectedKind || (allowedKind && selectedKind !== allowedKind)
        ? t('unsupportedUpload')
        : file.size > capabilities.data.limits.maxBytes[selectedKind]
          ? t('uploadTooLarge')
          : null
      : null;
  async function send() {
    if (!file) return;
    const kind = selectedKind;
    if (!kind) throw new Error('unsupported');
    if (allowedKind && kind !== allowedKind) throw new Error('unsupported');
    const freshCapabilities = await api.request(
      '/admin/media/capabilities',
      z.object({ scannerAvailable: z.boolean() }),
    );
    if (!freshCapabilities.scannerAvailable) throw new Error('unavailable');
    if (fileProblem) throw new Error('invalid');
    abort.current = new AbortController();
    let current = session
      ? await api.request(`/admin/media/uploads/${session.id}/authorize`, uploadSchema, {}, 'POST')
      : await api.request(
          '/admin/media/uploads',
          uploadSchema,
          {
            kind,
            name: file.name,
            bytes: String(file.size),
            purpose: 'CATALOG',
            idempotencyKey: crypto.randomUUID(),
          },
          'POST',
        );
    setSession(current);
    for (let number = 1; number <= current.upload.partCount; number++) {
      if (abort.current.signal.aborted) throw new Error('cancelled');
      if (current.parts.some((part) => part.number === number)) {
        setProgress(Math.round((number / current.upload.partCount) * 100));
        continue;
      }
      current = await api.part(
        current,
        number,
        file.slice(
          (number - 1) * current.upload.partBytes,
          Math.min(number * current.upload.partBytes, file.size),
        ),
        abort.current.signal,
      );
      setSession(current);
      setProgress(Math.round((number / current.upload.partCount) * 100));
    }
    current = await api.request(
      `/admin/media/uploads/${current.id}/complete`,
      uploadSchema,
      { expectedVersion: current.version },
      'POST',
    );
    setSession(current);
    return current;
  }
  const processing = useQuery({
    queryKey: ['staff', 'upload-asset', session?.assetId],
    queryFn: ({ signal }) =>
      api.request(
        `/admin/media/assets/${session?.assetId}`,
        z.object({ asset: mediaAssetSchema }),
        undefined,
        'GET',
        signal,
      ),
    enabled: !!session && session.status !== 'OPEN',
    refetchInterval: (q) =>
      q.state.data?.asset.status === 'READY' || q.state.data?.asset.status === 'FAILED'
        ? false
        : 3000,
  });
  return (
    <section>
      <p>{t('scanner')}</p>
      <BPInput
        label={t('selectFile')}
        type="file"
        accept={
          capabilities.data
            ? (allowedKind
                ? capabilities.data.mimeTypes[allowedKind]
                : Object.values(capabilities.data.mimeTypes).flat()
              ).join(',')
            : ''
        }
        disabled={action.isPending || !!session}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {file && (
        <p>
          {file.name} · {file.size} {t('bytes')}
        </p>
      )}
      {(file || session) && <progress max={100} value={progress} aria-label={t('upload')} />}
      {(processing.data || session) && (
        <p role="status" aria-live="polite">
          {processing.data?.asset.status ?? session?.status}
        </p>
      )}
      {capabilities.error && (
        <StaffError error={capabilities.error} reload={() => void capabilities.refetch()} />
      )}
      {capabilities.data && !capabilities.data.scannerAvailable && (
        <BPAlert tone="error">{t('scannerUnavailable')}</BPAlert>
      )}
      {fileProblem && <BPAlert tone="error">{fileProblem}</BPAlert>}
      {processing.error && (
        <StaffError error={processing.error} reload={() => void processing.refetch()} />
      )}
      {processing.data?.asset.status === 'FAILED' && (
        <BPAlert tone="error">{t('processingFailed')}</BPAlert>
      )}
      <ActionFeedback action={action} />
      <div className="bp-admin-toolbar">
        <BPButton
          disabled={
            !file ||
            !!fileProblem ||
            !capabilities.data?.scannerAvailable ||
            session?.status === 'COMPLETED'
          }
          loading={action.isPending}
          onClick={() => action.mutate(send)}
        >
          {session ? t('resume') : t('upload')}
        </BPButton>
        {session?.status === 'COMPLETED' && (
          <BPButton
            variant="secondary"
            onClick={() => {
              setSession(null);
              setFile(null);
              setProgress(0);
            }}
          >
            {t('create')} — {t('upload')}
          </BPButton>
        )}
        {session && session.status === 'OPEN' && (
          <BPButton
            variant="secondary"
            onClick={() => {
              abort.current?.abort();
              action.mutate(
                async () => {
                  const current = await api.request(
                    `/admin/media/uploads/${session.id}`,
                    uploadSchema,
                  );
                  return api.request(
                    `/admin/media/uploads/${session.id}/cancel`,
                    uploadSchema,
                    { expectedVersion: current.version },
                    'POST',
                  );
                },
                {
                  onSuccess: () => {
                    setSession(null);
                    setFile(null);
                    setProgress(0);
                  },
                },
              );
            }}
          >
            {t('cancelUpload')}
          </BPButton>
        )}
      </div>
    </section>
  );
}
export function MediaLibrary({
  id,
  onSelect,
  allowedKind,
  inspecting = false,
}: {
  id?: string;
  onSelect?: (asset: MediaAsset) => void;
  allowedKind?: MediaAsset['kind'];
  inspecting?: boolean;
}) {
  const router = useRouter(),
    [uploadOpen, setUploadOpen] = useState(false),
    api = useStaffApi(),
    t = useAdminTranslation(),
    pagination = useAdminPagination('cursor', !!onSelect || inspecting),
    params = useLocalSearchParams<{ search?: string; kind?: string; status?: string }>();
  const [reviewedMedia, setReviewedMedia] = useState<{
    asset: MediaAsset;
    operation: 'reprocess' | 'retire';
  } | null>(null);
  const lifecycle = useAction('media');
  const [pickerFilters, setPickerFilters] = useState({
    search: '',
    kind: allowedKind ?? '',
    status: '',
  });
  const { search = '', kind = allowedKind ?? '', status = '' } = onSelect ? pickerFilters : params;
  const filter = (patch: Partial<typeof pickerFilters>) => {
    if (onSelect) setPickerFilters((previous) => ({ ...previous, ...patch }));
    pagination.filters(patch);
  };
  const usagePagination = useAdminPagination('cursor', true),
    usageAfter = Number(usagePagination.cursor || 0);
  const list = useQuery({
    placeholderData: keepPreviousData,
    enabled: !id,
    queryKey: ['staff', 'media', pagination.cursor, pagination.pageSize, kind, status, search],
    queryFn: ({ signal }) =>
      api.request(
        '/admin/media/assets?limit=' +
          pagination.pageSize +
          (pagination.cursor ? '&after=' + encodeURIComponent(pagination.cursor) : '') +
          (search ? '&search=' + encodeURIComponent(search) : '') +
          (kind ? '&kind=' + kind : '') +
          (status ? '&status=' + status : ''),
        librarySchema,
        undefined,
        'GET',
        signal,
      ),
    refetchInterval: 10000,
  });
  const detail = useQuery({
    queryKey: ['staff', 'media-detail', id],
    queryFn: ({ signal }) =>
      api.request(
        '/admin/media/assets/' + id,
        z.object({ asset: mediaAssetSchema, registration: z.unknown() }),
        undefined,
        'GET',
        signal,
      ),
    enabled: !!id,
    refetchInterval: 10000,
  });
  const usage = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['staff', 'media-usage', id, usageAfter, usagePagination.pageSize],
    queryFn: ({ signal }) =>
      api.request(
        '/admin/media/assets/' +
          id +
          '/usage?limit=' +
          usagePagination.pageSize +
          '&after=' +
          usageAfter,
        z.array(z.object({ ownerType: z.string(), ownerId: z.string().uuid().nullable() })),
        undefined,
        'GET',
        signal,
      ),
    enabled: !!id,
  });
  const assets = id ? (detail.data ? [detail.data.asset] : []) : (list.data?.items ?? []);
  if (id && !inspecting)
    return (
      <>
        <MediaLibrary />
        <BPDrawer
          open
          title={t('media')}
          className="bp-admin-overlay bp-asset-inspector"
          onClose={() =>
            router.replace(('/admin/media' + window.location.search) as '/admin/media')
          }
        >
          <MediaLibrary id={id} inspecting />
        </BPDrawer>
      </>
    );
  return (
    <>
      {reviewedMedia?.operation === 'retire' && (
        <DeletionDialog
          path={'/admin/media/assets/' + reviewedMedia.asset.id}
          scope="media"
          onClose={() => setReviewedMedia(null)}
        />
      )}
      <BPConfirmDialog
        open={Boolean(reviewedMedia && reviewedMedia.operation !== 'retire')}
        title={reviewedMedia?.operation === 'retire' ? t('retire') : t('retry')}
        variant={reviewedMedia?.operation === 'retire' ? 'destructive' : 'secondary'}
        icon={
          reviewedMedia?.operation === 'reprocess' ? (
            <ArrowUpDown size={18} aria-hidden="true" />
          ) : undefined
        }
        pending={lifecycle.isPending}
        cancelLabel={t('cancel')}
        confirmLabel={t('confirm')}
        onClose={() => setReviewedMedia(null)}
        onConfirm={() => {
          if (!reviewedMedia) return;
          const { asset, operation } = reviewedMedia;
          lifecycle.mutate(
            () =>
              api.request(
                `/admin/media/assets/${asset.id}/${operation}`,
                jsonResponse,
                {
                  expectedVersion: asset.version,
                  ...(operation === 'retire' ? { confirmed: true } : {}),
                },
                'POST',
              ),
            { onSuccess: () => setReviewedMedia(null) },
          );
        }}
      >
        <p>
          <strong>{reviewedMedia?.asset.name ?? reviewedMedia?.asset.id}</strong>
        </p>
        <p>{t('confirmAction')}</p>
        <ActionFeedback action={lifecycle} />
      </BPConfirmDialog>
      {!inspecting && (
        <div className="bp-media-header">
          <BPPageHeader title={t('media')} description={t('mediaHelp')} />
          {!inspecting && (
            <BPButton onClick={() => setUploadOpen(true)}>
              <UploadIcon size={18} aria-hidden="true" />
              {t('uploadMedia')}
            </BPButton>
          )}
        </div>
      )}
      <BPDrawer
        keepMounted
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title={t('upload')}
        className="bp-admin-overlay"
      >
        <Upload allowedKind={allowedKind} />
      </BPDrawer>
      {!inspecting && (
        <BPFilterToolbar label={t('filters')} fields={2}>
          <BPInput
            label={t('search')}
            type="search"
            onClear={() => filter({ search: '' })}
            value={search}
            onChange={(event) => filter({ search: event.target.value })}
          />
          <div className="bp-media-filter-fields">
            <BPSelect
              label={t('kind')}
              disabled={!!allowedKind}
              value={kind}
              onChange={(value) => {
                filter({ kind: value });
              }}
              options={[
                { value: '', label: t('all') },
                ...['IMAGE', 'VIDEO', 'PDF'].map((value) => ({ value, label: value })),
              ]}
            />
            <BPSelect
              label={t('status')}
              value={status}
              onChange={(value) => {
                filter({ status: value });
              }}
              options={[
                { value: '', label: t('all') },
                ...['READY', 'PROCESSING', 'FAILED'].map((value) => ({ value, label: value })),
              ]}
            />
          </div>
          <BPButton
            variant="ghost"
            onClick={() => filter({ search: '', kind: allowedKind ?? '', status: '' })}
          >
            <FilterX size={18} aria-hidden="true" />
            {t('clear')}
          </BPButton>
        </BPFilterToolbar>
      )}
      <TableState
        presentation="content"
        pending={id ? detail.isPending : list.isPending}
        error={id ? detail.error : list.error}
        empty={!assets.length}
        onRetry={() => void (id ? detail.refetch() : list.refetch())}
      >
        <div className="bp-admin-media">
          {assets.map((asset) =>
            !inspecting ? (
              <section key={asset.id} className="bp-asset-card">
                <a
                  href={'/admin/media/' + asset.id + window.location.search}
                  aria-label={asset.name}
                >
                  <MediaPreview asset={asset} />
                  <span className="bp-asset-kind">
                    <BPBadge>
                      {asset.kind === 'VIDEO' ? (
                        <Play size={14} aria-hidden="true" />
                      ) : asset.kind === 'PDF' ? (
                        <FileText size={14} aria-hidden="true" />
                      ) : null}
                      {asset.kind}
                    </BPBadge>
                    <BPStatusBadge state={asset.status} />
                  </span>
                  <h2 className="bp-asset-name">{asset.name}</h2>
                </a>
                {!onSelect && (
                  <BPActionMenu
                    label={t('actions') + ' — ' + asset.name}
                    items={[
                      {
                        label: t('view'),
                        icon: 'view',
                        href: '/admin/media/' + asset.id + window.location.search,
                      },
                      {
                        label: t('usage'),
                        icon: 'link',
                        href: '/admin/media/' + asset.id + window.location.search,
                      },
                      ...(!asset.deleted &&
                      asset.status === 'READY' &&
                      asset.security === 'VERIFIED'
                        ? [
                            {
                              label: t('retry'),
                              icon: 'reorder' as const,
                              onSelect: () => setReviewedMedia({ asset, operation: 'reprocess' }),
                            },
                          ]
                        : []),
                      ...(!asset.deleted
                        ? [
                            {
                              label: t('remove'),
                              icon: 'delete' as const,
                              destructive: true,
                              onSelect: () => setReviewedMedia({ asset, operation: 'retire' }),
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
                {onSelect && (
                  <BPButton
                    disabled={
                      asset.status !== 'READY' || asset.security === 'BLOCKED' || asset.deleted
                    }
                    onClick={() => onSelect(asset)}
                  >
                    {t('select')}
                  </BPButton>
                )}
              </section>
            ) : (
              <section key={asset.id}>
                <MediaPreview
                  asset={asset}
                  profile={
                    asset.kind === 'VIDEO'
                      ? 'playback'
                      : asset.kind === 'IMAGE'
                        ? 'detail'
                        : 'preview'
                  }
                />
                <p>
                  {asset.name} · {asset.kind} · {asset.status}
                </p>
                <p>
                  {asset.byteSize} {t('bytes')}
                </p>
                <p>
                  {asset.purpose ?? ''} ·{' '}
                  <time dateTime={asset.updatedAt}>
                    {new Date(asset.updatedAt).toLocaleString()}
                  </time>
                </p>
                {onSelect ? (
                  <BPButton
                    disabled={
                      asset.status !== 'READY' || asset.security === 'BLOCKED' || asset.deleted
                    }
                    onClick={() => onSelect(asset)}
                  >
                    {t('select')}
                  </BPButton>
                ) : id ? (
                  <>
                    <p>
                      {asset.security} · {asset.deleted ? t('noRestore') : ''} ·{' '}
                      {asset.width ?? '—'} × {asset.height ?? '—'} · {asset.duration ?? '—'}
                    </p>
                    {asset.failureCode && (
                      <BPAlert tone="error">
                        {t('failed')}: {asset.failureCode}
                      </BPAlert>
                    )}
                    <ul>
                      {[...asset.variants]
                        .sort((left, right) => left.profile.localeCompare(right.profile, 'en'))
                        .map((variant) => (
                          <li key={variant.profile}>
                            {variant.profile} · {variant.mime} · {variant.bytes} {t('bytes')} ·{' '}
                            {variant.width ?? '—'} × {variant.height ?? '—'}
                          </li>
                        ))}
                    </ul>
                    {asset.kind === 'PDF' &&
                      asset.status === 'READY' &&
                      asset.security === 'VERIFIED' && <PdfDownload assetId={asset.id} />}
                    <BPActionMenu
                      label={t('actions')}
                      items={[
                        {
                          label: t('remove'),
                          icon: 'delete',
                          destructive: true,
                          onSelect: () => setReviewedMedia({ asset, operation: 'retire' }),
                        },
                      ]}
                    />
                    <div className="bp-admin-toolbar">
                      {(['retry', 'reprocess', 'block'] as const)
                        .filter(
                          (operation) =>
                            !asset.deleted &&
                            (operation === 'retry'
                              ? asset.status === 'FAILED'
                              : operation === 'reprocess'
                                ? asset.status === 'READY' && asset.security === 'VERIFIED'
                                : operation === 'block'
                                  ? asset.security !== 'BLOCKED'
                                  : true),
                        )
                        .map((operation) => (
                          <Confirm
                            scope="media"
                            entityName={asset.name ?? asset.id}
                            variant={
                              operation === 'retry' || operation === 'reprocess'
                                ? 'secondary'
                                : operation === 'block'
                                  ? 'warning'
                                  : 'destructive'
                            }
                            icon={
                              operation === 'retry' || operation === 'reprocess' ? (
                                <ArrowUpDown size={18} aria-hidden="true" />
                              ) : undefined
                            }
                            key={operation}
                            title={operation === 'reprocess' ? t('retry') : t(operation)}
                            work={() =>
                              api.request(
                                `/admin/media/assets/${id}/${operation}`,
                                jsonResponse,
                                {
                                  expectedVersion: asset.version,
                                },
                                'POST',
                              )
                            }
                          />
                        ))}
                    </div>
                  </>
                ) : null}
              </section>
            ),
          )}
        </div>
      </TableState>
      {id && usage.data != null && (
        <section>
          <BPHeading level={2} role="heading5">
            {t('usage')}
          </BPHeading>
          {!usage.data.length && <p>{t('empty')}</p>}
          <ul>
            {usage.data.map((owner, index) => (
              <li key={owner.ownerType + owner.ownerId + index}>
                {owner.ownerType} ·{' '}
                {owner.ownerId &&
                  (['PRODUCT', 'CATEGORY'].includes(owner.ownerType) ? (
                    <a
                      href={`/admin/${owner.ownerType === 'PRODUCT' ? 'products' : 'categories'}/${owner.ownerId}`}
                    >
                      {owner.ownerId}
                    </a>
                  ) : (
                    <bdi>{owner.ownerId}</bdi>
                  ))}
              </li>
            ))}
          </ul>
          <AdminPagination
            pagination={usagePagination}
            data={{
              items: usage.data,
              nextCursor:
                usage.data.length === usagePagination.pageSize
                  ? String(usageAfter + usagePagination.pageSize)
                  : null,
            }}
            loading={usage.isFetching}
            placeholder={usage.isPlaceholderData}
          />
        </section>
      )}
      {!id && (
        <AdminPagination
          pagination={pagination}
          data={list.data}
          loading={list.isFetching}
          placeholder={list.isPlaceholderData}
        />
      )}
    </>
  );
}
export function MediaPicker({
  open,
  onClose,
  onSelect,
  allowedKind,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  allowedKind?: MediaAsset['kind'];
}) {
  const t = useAdminTranslation();
  return (
    <BPDrawer className="bp-admin-overlay" open={open} onClose={onClose} title={t('media')}>
      <MediaLibrary
        allowedKind={allowedKind}
        onSelect={(asset) => {
          onSelect(asset);
          onClose();
        }}
      />
    </BPDrawer>
  );
}
