import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  Category,
  Product,
  MediaReference,
  MediaResolver,
  MediaCapability,
  TechnicalAttribute,
  TechnicalDocument,
} from '@golden-lift/api';
import {
  GLButton,
  GLCard,
  GLHeading,
  GLText,
  GLIconButton,
  GLModal,
  GLSkeleton,
  GLAlert,
  GLTable,
} from '@golden-lift/ui';
import {
  ArrowUpRight,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Download,
} from '@golden-lift/icons';
import { useGLTranslation, useLocale } from '@golden-lift/i18n';
const ResolverContext = createContext<MediaResolver | null>(null);
export function MediaProvider({
  resolver,
  children,
}: {
  resolver: MediaResolver;
  children: ReactNode;
}) {
  return <ResolverContext.Provider value={resolver}>{children}</ResolverContext.Provider>;
}
function useCapability(
  reference: MediaReference | null,
  action: 'PREVIEW' | 'DOWNLOAD' = 'PREVIEW',
) {
  const resolver = useContext(ResolverContext),
    [capability, setCapability] = useState<MediaCapability | null>(null),
    [failed, setFailed] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setCapability(null);
    setFailed(false);
    if (!reference || !resolver) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    void resolver
      .resolve(reference, action, abort.signal)
      .then((c) => {
        if (abort.signal.aborted) return;
        setCapability(c);
        if (c.expiresAt)
          timer = setTimeout(
            () => setRefresh((v) => v + 1),
            Math.max(1000, Date.parse(c.expiresAt) - Date.now() - 15000),
          );
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => {
      abort.abort();
      if (timer) clearTimeout(timer);
    };
  }, [resolver, reference?.id, reference?.profile, reference?.ownerId, action, refresh]);
  return { capability, failed, retry: () => setRefresh((v) => v + 1) };
}
export function GLMediaImage({
  reference,
  className = '',
  priority = false,
}: {
  reference: MediaReference | null;
  className?: string;
  priority?: boolean;
}) {
  const { t } = useGLTranslation(),
    { capability, failed, retry } = useCapability(reference),
    [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [capability?.url]);
  if (!reference || failed || broken)
    return (
      <div
        className={'gl-image-placeholder ' + className}
        role="img"
        aria-label={reference?.alt ?? t('missingImage')}
      >
        <span>{t('missingImage')}</span>
        {reference && (
          <GLButton
            variant="text"
            onClick={() => {
              setBroken(false);
              retry();
            }}
          >
            {t('refresh')}
          </GLButton>
        )}
      </div>
    );
  if (!capability) return <GLSkeleton className={'gl-media ' + className} />;
  return (
    <img
      src={capability.url}
      alt={reference.alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={'gl-media ' + className}
      onError={() => setBroken(true)}
    />
  );
}
export function GLCategoryCard({ category }: { category: Category }) {
  const { t } = useGLTranslation();
  return (
    <GLCard className="gl-category-card">
      <a href={'/categories/' + category.id}>
        <GLMediaImage reference={category.image} />
        <div className="gl-category-card-body">
          <GLHeading level={3} role="heading5">
            {category.name}
          </GLHeading>
          <ArrowUpRight aria-hidden="true" size={20} />
        </div>
        {category.description && <p>{category.description}</p>}
        <span className="sr-only">{t('details')}</span>
      </a>
    </GLCard>
  );
}
export function GLTechnicalValue({ value, unit }: { value: string; unit?: string | null }) {
  return (
    <GLText role="technicalValue">
      <bdi>
        {value}
        {unit ? ' ' + unit : ''}
      </bdi>
    </GLText>
  );
}
export function GLProductCard({
  product,
  summaryAttributes = product.attributes.slice(0, 2),
}: {
  product: Product;
  summaryAttributes?: readonly TechnicalAttribute[];
}) {
  const { t } = useGLTranslation();
  const image = product.media.find((m) => m.kind === 'image');
  return (
    <GLCard className="gl-product-card">
      <a href={'/products/' + product.id}>
        <div className="gl-product-card-image">
          <GLMediaImage reference={image ? { ...image, profile: 'card' } : null} />
          <span className="gl-card-arrow">
            <ArrowUpRight size={20} />
          </span>
        </div>
        <div className="gl-product-card-body">
          <GLText role="overline" className="gl-muted">
            {product.categoryName}
          </GLText>
          <GLHeading level={3} role="heading5">
            {product.name}
          </GLHeading>
          {product.model && (
            <GLText role="caption" className="gl-muted">
              {product.model}
            </GLText>
          )}
          <dl className="gl-summary">
            {summaryAttributes.map((a) => (
              <div key={a.id}>
                <dt>{a.label}</dt>
                <dd>
                  <GLTechnicalValue value={a.value} unit={a.unit} />
                </dd>
              </div>
            ))}
          </dl>
          <span className="gl-detail-link">
            {t('details')} <ArrowUpRight size={16} />
          </span>
        </div>
      </a>
    </GLCard>
  );
}
export function GLSpecificationList({ attributes }: { attributes: readonly TechnicalAttribute[] }) {
  return (
    <dl className="gl-specifications">
      {attributes.map((a) => (
        <div key={a.id}>
          <dt>{a.label}</dt>
          <dd>
            <GLTechnicalValue value={a.value} unit={a.unit} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function GLSpecificationTable({
  attributes,
}: {
  attributes: readonly TechnicalAttribute[];
}) {
  const { t } = useGLTranslation();
  return (
    <GLTable
      columns={[t('technical'), t('specifications')]}
      rows={attributes.map((a) => [
        a.label,
        <GLTechnicalValue key={a.id} value={a.value} unit={a.unit} />,
      ])}
    />
  );
}
export function GLTechnicalDocumentCard({ document: doc }: { document: TechnicalDocument }) {
  const { t } = useGLTranslation();
  const resolver = useContext(ResolverContext),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(false);
  async function open() {
    if (!resolver || !doc.permitted || loading) return;
    setLoading(true);
    setError(false);
    const target = window.open('about:blank', '_blank');
    if (target) target.opener = null;
    try {
      const c = await resolver.resolve(doc.media, 'DOWNLOAD');
      if (target) target.location.href = c.url;
      else window.location.assign(c.url);
    } catch {
      target?.close();
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <GLCard className="gl-document-card" direction="row">
      <FileText size={28} />
      <div>
        <GLHeading level={3} role="heading6">
          {doc.title}
        </GLHeading>
        <GLText role="caption">{doc.type}</GLText>
      </div>
      <GLButton
        variant="secondary"
        loading={loading}
        disabled={!doc.permitted}
        onClick={() => void open()}
      >
        <Download size={16} /> {t('open')}
      </GLButton>
      {error && <GLAlert tone="error">{t('mediaError')}</GLAlert>}
    </GLCard>
  );
}
export function GLVideo({ reference }: { reference: MediaReference }) {
  const { t } = useGLTranslation(),
    { capability, failed, retry } = useCapability(reference),
    [broken, setBroken] = useState(false);
  return failed || broken ? (
    <GLAlert tone="error">
      {t('mediaError')}{' '}
      <GLButton
        onClick={() => {
          setBroken(false);
          retry();
        }}
      >
        {t('refresh')}
      </GLButton>
    </GLAlert>
  ) : capability ? (
    <video
      src={capability.url}
      controls
      preload="metadata"
      className="gl-video"
      aria-label={reference.alt}
      onError={() => setBroken(true)}
    />
  ) : (
    <GLSkeleton className="gl-video" />
  );
}
export function GLProductGallery({ media }: { media: readonly MediaReference[] }) {
  const { t } = useGLTranslation(),
    { locale } = useLocale(),
    [selected, setSelected] = useState(0),
    [open, setOpen] = useState(false);
  const item = media[selected] ?? null;
  const change = (step: number) => setSelected((v) => (v + step + media.length) % media.length);
  function content() {
    return item?.kind === 'video' ? (
      <GLVideo reference={item} />
    ) : item?.kind === 'image' ? (
      <GLMediaImage reference={item} priority />
    ) : (
      <GLAlert>{t('unsupported')}</GLAlert>
    );
  }
  return (
    <div className="gl-gallery" aria-label={t('gallery')}>
      <div
        className="gl-gallery-main"
        onTouchStart={(e) => {
          e.currentTarget.dataset.touch = String(e.touches[0]?.clientX);
        }}
        onTouchEnd={(e) => {
          const start = Number(e.currentTarget.dataset.touch),
            end = e.changedTouches[0]?.clientX;
          if (end !== undefined && Math.abs(start - end) > 60)
            change((start > end ? 1 : -1) * (locale === 'en' ? 1 : -1));
        }}
      >
        {content()}
        <GLIconButton
          className="gl-zoom"
          label={t('fullscreen')}
          variant="light"
          onClick={() => setOpen(true)}
        >
          <Maximize2 size={20} />
        </GLIconButton>
      </div>
      <div className="gl-gallery-thumbnails">
        {media.map((m, i) => (
          <button
            key={m.id}
            onClick={() => setSelected(i)}
            aria-label={m.alt}
            aria-pressed={i === selected}
          >
            <GLMediaImage
              reference={
                m.kind === 'image'
                  ? { ...m, profile: 'thumbnail' }
                  : m.kind === 'video'
                    ? { ...m, kind: 'image', profile: 'poster' }
                    : null
              }
            />
          </button>
        ))}
      </div>
      {media.length > 1 && (
        <div className="gl-gallery-controls">
          <GLIconButton label={t('previous')} variant="secondary" onClick={() => change(-1)}>
            {locale === 'en' ? <ChevronLeft /> : <ChevronRight />}
          </GLIconButton>
          <span>
            {selected + 1} / {media.length}
          </span>
          <GLIconButton label={t('next')} variant="secondary" onClick={() => change(1)}>
            {locale === 'en' ? <ChevronRight /> : <ChevronLeft />}
          </GLIconButton>
        </div>
      )}
      <GLModal open={open} onClose={() => setOpen(false)} title={item?.alt ?? t('gallery')}>
        <div className="gl-gallery-fullscreen">{content()}</div>
      </GLModal>
    </div>
  );
}
export function GLProductCardSkeleton() {
  return (
    <GLCard>
      <GLSkeleton className="gl-card-skeleton" />
      <GLSkeleton />
      <GLSkeleton />
    </GLCard>
  );
}
export function GLCategoryCardSkeleton() {
  return (
    <GLCard>
      <GLSkeleton className="gl-card-skeleton" />
      <GLSkeleton />
    </GLCard>
  );
}
