import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { mediaAssetSchema, uploadSchema } from '@golden-lift/api';
import {
  GLAlert,
  GLButton,
  GLHeading,
  GLInput,
  GLModal,
  GLSelect,
  GLPageHeader,
  GLDrawer,
} from '@golden-lift/ui';
import { StaffError, useStaffApi } from './context';
import { useAdminTranslation } from './translations';
import { ActionFeedback, Confirm, TableState, jsonResponse, useAction } from './common';
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
const librarySchema = z.object({ items: z.array(mediaAssetSchema), next: z.string().nullable() });
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
      <GLButton
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
      </GLButton>
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
        <GLAlert tone="error">
          {t('error')}
          <GLButton
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
            {t('retry')}
          </GLButton>
        </GLAlert>
      );
    if (!grant.data || Date.parse(grant.data.expiresAt) <= Date.now())
      return <GLAlert>{t(asset.status === 'READY' ? 'preview' : 'processing')}</GLAlert>;
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
    <div ref={host} className="gl-admin-preview">
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
      <GLInput
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
        <GLAlert tone="error">{t('scannerUnavailable')}</GLAlert>
      )}
      {fileProblem && <GLAlert tone="error">{fileProblem}</GLAlert>}
      {processing.error && (
        <StaffError error={processing.error} reload={() => void processing.refetch()} />
      )}
      {processing.data?.asset.status === 'FAILED' && (
        <GLAlert tone="error">{t('processingFailed')}</GLAlert>
      )}
      <ActionFeedback action={action} />
      <div className="gl-admin-toolbar">
        <GLButton
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
        </GLButton>
        {session?.status === 'COMPLETED' && (
          <GLButton
            variant="secondary"
            onClick={() => {
              setSession(null);
              setFile(null);
              setProgress(0);
            }}
          >
            {t('create')} — {t('upload')}
          </GLButton>
        )}
        {session && session.status === 'OPEN' && (
          <GLButton
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
          </GLButton>
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
    [search, setSearch] = useState(''),
    api = useStaffApi(),
    t = useAdminTranslation(),
    [after, setAfter] = useState(''),
    [kind, setKind] = useState(allowedKind ?? ''),
    [status, setStatus] = useState('');
  const [usageAfter, setUsageAfter] = useState(0);
  const list = useQuery({
    queryKey: ['staff', 'media', after, kind, status],
    queryFn: ({ signal }) =>
      api.request(
        '/admin/media/assets?limit=25' +
          (after ? '&after=' + after : '') +
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
    queryKey: ['staff', 'media-usage', id, usageAfter],
    queryFn: ({ signal }) =>
      api.request(
        '/admin/media/assets/' + id + '/usage?limit=25&after=' + usageAfter,
        z.array(z.object({ ownerType: z.string(), ownerId: z.string().uuid().nullable() })),
        undefined,
        'GET',
        signal,
      ),
    enabled: !!id,
  });
  const assets = (id ? (detail.data ? [detail.data.asset] : []) : (list.data?.items ?? [])).filter(
    (asset) =>
      (!kind || asset.kind === kind) &&
      (!status || asset.status === status) &&
      (!search || (asset.name ?? '').toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  );
  if (id && !inspecting)
    return (
      <>
        <MediaLibrary />
        <GLDrawer
          open
          title={t('media')}
          className="gl-admin-overlay gl-asset-inspector"
          onClose={() => router.replace('/admin/media')}
        >
          <MediaLibrary id={id} inspecting />
        </GLDrawer>
      </>
    );
  return (
    <>
      {!inspecting && (
        <div className="gl-media-header">
          <GLPageHeader title={t('media')} description={t('mediaHelp')} />
          {!inspecting && (
            <GLButton onClick={() => setUploadOpen(true)}>{t('uploadMedia')}</GLButton>
          )}
        </div>
      )}
      <GLDrawer
        keepMounted
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title={t('upload')}
        className="gl-admin-overlay"
      >
        <Upload allowedKind={allowedKind} />
      </GLDrawer>
      {!inspecting && (
        <GLInput
          label={t('searchLoadedMedia')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      )}
      {!inspecting && (
        <div className="gl-admin-grid gl-media-filters">
          <GLSelect
            label={t('kind')}
            disabled={!!allowedKind}
            value={kind}
            onChange={(value) => {
              setKind(value);
              setAfter('');
            }}
            options={[
              { value: '', label: t('all') },
              ...['IMAGE', 'VIDEO', 'PDF'].map((value) => ({ value, label: value })),
            ]}
          />
          <GLSelect
            label={t('status')}
            value={status}
            onChange={(value) => {
              setStatus(value);
              setAfter('');
            }}
            options={[
              { value: '', label: t('all') },
              ...['READY', 'PROCESSING', 'FAILED'].map((value) => ({ value, label: value })),
            ]}
          />
        </div>
      )}
      <TableState
        presentation="content"
        pending={id ? detail.isPending : list.isPending}
        error={id ? detail.error : list.error}
        empty={!assets.length}
      >
        <div className="gl-admin-media">
          {assets.map((asset) =>
            !inspecting ? (
              <section key={asset.id} className="gl-asset-card">
                <a href={'/admin/media/' + asset.id} aria-label={asset.name}>
                  <MediaPreview asset={asset} />
                  <span className="gl-asset-kind">
                    {asset.kind} / {asset.status}
                  </span>
                  <h2 className="gl-asset-name">{asset.name}</h2>
                </a>
                {onSelect && (
                  <GLButton
                    disabled={
                      asset.status !== 'READY' || asset.security === 'BLOCKED' || asset.deleted
                    }
                    onClick={() => onSelect(asset)}
                  >
                    {t('select')}
                  </GLButton>
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
                  <GLButton
                    disabled={
                      asset.status !== 'READY' || asset.security === 'BLOCKED' || asset.deleted
                    }
                    onClick={() => onSelect(asset)}
                  >
                    {t('select')}
                  </GLButton>
                ) : id ? (
                  <>
                    <p>
                      {asset.security} · {asset.deleted ? t('noRestore') : ''} ·{' '}
                      {asset.width ?? '—'} × {asset.height ?? '—'} · {asset.duration ?? '—'}
                    </p>
                    {asset.failureCode && (
                      <GLAlert tone="error">
                        {t('failed')}: {asset.failureCode}
                      </GLAlert>
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
                    <div className="gl-admin-toolbar">
                      {(['retry', 'reprocess', 'retire', 'block'] as const)
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
                            key={operation}
                            title={operation === 'reprocess' ? t('retry') : t(operation)}
                            work={() =>
                              api.request(
                                `/admin/media/assets/${id}/${operation}`,
                                jsonResponse,
                                {
                                  expectedVersion: asset.version,
                                  ...(operation === 'retire' ? { confirmed: true } : {}),
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
          <GLHeading level={2} role="heading5">
            {t('usage')}
          </GLHeading>
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
          {usageAfter > 0 && (
            <GLButton
              variant="secondary"
              onClick={() => setUsageAfter(Math.max(0, usageAfter - 25))}
            >
              {t('previous')}
            </GLButton>
          )}
          {usage.data.length === 25 && (
            <GLButton variant="secondary" onClick={() => setUsageAfter(usageAfter + 25)}>
              {t('next')}
            </GLButton>
          )}
        </section>
      )}
      {!id && list.data?.next && (
        <GLButton variant="secondary" onClick={() => setAfter(list.data!.next!)}>
          {t('next')}
        </GLButton>
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
    <GLDrawer className="gl-admin-overlay" open={open} onClose={onClose} title={t('media')}>
      <MediaLibrary
        allowedKind={allowedKind}
        onSelect={(asset) => {
          onSelect(asset);
          onClose();
        }}
      />
    </GLDrawer>
  );
}
