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
} from '@business-platform/api';
import {
  BPButton,
  BPCard,
  BPHeading,
  BPText,
  BPIconButton,
  BPModal,
  BPSkeleton,
  BPAlert,
  BPTable,
} from '@business-platform/ui';
import {
  ArrowUpRight,
  Play,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Download,
} from '@business-platform/icons';
import { useBPTranslation, useLocale } from '@business-platform/i18n';
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
export function BPMediaImage({
  reference,
  className = '',
  priority = false,
}: {
  reference: MediaReference | null;
  className?: string;
  priority?: boolean;
}) {
  const { t } = useBPTranslation(),
    { capability, failed, retry } = useCapability(reference),
    [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [capability?.url]);
  if (!reference || failed || broken)
    return (
      <div
        className={'bp-image-placeholder ' + className}
        role="img"
        aria-label={reference?.alt ?? t('missingImage')}
      >
        <span>{t('missingImage')}</span>
        {reference && (
          <BPButton
            variant="text"
            onClick={() => {
              setBroken(false);
              retry();
            }}
          >
            {t('refresh')}
          </BPButton>
        )}
      </div>
    );
  if (!capability) return <BPSkeleton className={'bp-media ' + className} />;
  return (
    <img
      src={capability.url}
      alt={reference.alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={'bp-media ' + className}
      onError={() => setBroken(true)}
    />
  );
}
export function BPCategoryCard({ category }: { category: Category }) {
  const { t } = useBPTranslation();
  return (
    <article className="bp-category-card">
      <a href={'/categories/' + category.id}>
        <div className="bp-category-card-image">
          <BPMediaImage
            reference={
              category.image
                ? {
                    ...category.image,
                    profile: category.image.demoUrl ? category.image.profile : 'card',
                  }
                : null
            }
          />
        </div>
        <div className="bp-category-card-body">
          <div>
            <BPHeading fluid level={3} role="heading5">
              {category.name}
            </BPHeading>
            {category.description && <p>{category.description}</p>}
          </div>
          <ArrowUpRight aria-hidden="true" size={20} />
        </div>
        <span className="sr-only">{t('details')}</span>
      </a>
    </article>
  );
}
export function BPTechnicalValue({ value, unit }: { value: string; unit?: string | null }) {
  return (
    <BPText role="technicalValue">
      <bdi>
        {value}
        {unit ? ' ' + unit : ''}
      </bdi>
    </BPText>
  );
}
export function BPProductCard({
  product,
  summaryAttributes = product.attributes.slice(0, 2),
}: {
  product: Product;
  summaryAttributes?: readonly TechnicalAttribute[];
}) {
  const { t } = useBPTranslation();
  const image = product.media.find((m) => m.kind === 'image');
  return (
    <article className="bp-product-card">
      <a href={'/products/' + product.id}>
        <div className="bp-product-card-image">
          <BPMediaImage reference={image ? { ...image, profile: 'card' } : null} />
          <span className="bp-card-arrow">
            <ArrowUpRight size={20} />
          </span>
        </div>
        <div className="bp-product-card-body">
          <BPText role="overline" className="bp-muted">
            {product.categoryName}
          </BPText>
          <BPHeading fluid level={3} role="heading5">
            {product.name}
          </BPHeading>
          {product.model && (
            <BPText role="caption" className="bp-muted">
              {product.model}
            </BPText>
          )}
          {summaryAttributes.length > 0 && (
            <dl className="bp-summary">
              {summaryAttributes.map((a) => (
                <div key={a.id}>
                  <dt>{a.label}</dt>
                  <dd>
                    <BPTechnicalValue value={a.value} unit={a.unit} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <span className="bp-detail-link">
            {t('details')} <ArrowUpRight size={16} />
          </span>
        </div>
      </a>
    </article>
  );
}
export function BPSpecificationList({ attributes }: { attributes: readonly TechnicalAttribute[] }) {
  return (
    <dl className="bp-specifications">
      {attributes.map((a) => (
        <div key={a.id}>
          <dt>{a.label}</dt>
          <dd>
            <BPTechnicalValue value={a.value} unit={a.unit} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function BPSpecificationTable({
  attributes,
}: {
  attributes: readonly TechnicalAttribute[];
}) {
  const { t } = useBPTranslation();
  return (
    <BPTable
      columns={[t('technical'), t('specifications')]}
      rows={attributes.map((a) => [
        a.label,
        <BPTechnicalValue key={a.id} value={a.value} unit={a.unit} />,
      ])}
    />
  );
}
export function BPTechnicalDocumentCard({ document: doc }: { document: TechnicalDocument }) {
  const { t } = useBPTranslation();
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
    <BPCard className="bp-document-card" direction="row">
      <FileText size={28} />
      <div>
        <BPHeading fluid level={3} role="heading6">
          {doc.title}
        </BPHeading>
        <BPText role="caption">{doc.type}</BPText>
      </div>
      <BPButton
        variant="secondary"
        loading={loading}
        disabled={!doc.permitted}
        onClick={() => void open()}
      >
        <Download size={16} /> {t('open')}
      </BPButton>
      {error && <BPAlert tone="error">{t('mediaError')}</BPAlert>}
    </BPCard>
  );
}
export function BPVideo({ reference }: { reference: MediaReference }) {
  const { t } = useBPTranslation(),
    { capability, failed, retry } = useCapability(reference),
    [broken, setBroken] = useState(false);
  return failed || broken ? (
    <BPAlert tone="error">
      {t('mediaError')}{' '}
      <BPButton
        onClick={() => {
          setBroken(false);
          retry();
        }}
      >
        {t('refresh')}
      </BPButton>
    </BPAlert>
  ) : capability ? (
    <video
      src={capability.url}
      controls
      preload="metadata"
      className="bp-video"
      aria-label={reference.alt}
      onError={() => setBroken(true)}
    />
  ) : (
    <BPSkeleton className="bp-video" />
  );
}
export function BPProductGallery({ media }: { media: readonly MediaReference[] }) {
  const { t } = useBPTranslation(),
    { locale } = useLocale(),
    [selected, setSelected] = useState(0),
    [open, setOpen] = useState(false);
  const item = media[selected] ?? null;
  const change = (step: number) => {
    if (media.length > 1) setSelected((value) => (value + step + media.length) % media.length);
  };
  function content() {
    return item?.kind === 'video' ? (
      <BPVideo reference={item} />
    ) : item?.kind === 'image' ? (
      <BPMediaImage reference={item} priority />
    ) : (
      <BPAlert>{t('unsupported')}</BPAlert>
    );
  }
  return (
    <div
      id="product-gallery"
      className="bp-gallery"
      role="region"
      tabIndex={0}
      aria-label={t('gallery')}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest('video, input, textarea, select')) return;
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          change((event.key === 'ArrowRight' ? 1 : -1) * (locale === 'en' ? 1 : -1));
        }
      }}
    >
      <div
        className="bp-gallery-main"
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
        <BPIconButton
          className="bp-zoom"
          label={t('fullscreen')}
          variant="light"
          onClick={() => setOpen(true)}
        >
          <Maximize2 size={20} />
        </BPIconButton>
      </div>
      <div className="bp-gallery-thumbnails">
        {media.map((m, i) => (
          <button
            key={m.id}
            onClick={() => setSelected(i)}
            aria-label={m.kind === 'video' ? t('video') + ' — ' + m.alt : m.alt}
            aria-pressed={i === selected}
          >
            {m.kind === 'video' && (
              <span className="bp-video-thumbnail-badge">
                <Play size={18} aria-hidden="true" />
                {t('videoBadge')}
              </span>
            )}
            <BPMediaImage
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
        <div className="bp-gallery-controls">
          <BPIconButton label={t('previous')} variant="secondary" onClick={() => change(-1)}>
            {locale === 'en' ? <ChevronLeft /> : <ChevronRight />}
          </BPIconButton>
          <span>
            {selected + 1} / {media.length}
          </span>
          <BPIconButton label={t('next')} variant="secondary" onClick={() => change(1)}>
            {locale === 'en' ? <ChevronRight /> : <ChevronLeft />}
          </BPIconButton>
        </div>
      )}
      <BPModal open={open} onClose={() => setOpen(false)} title={item?.alt ?? t('gallery')}>
        <div className="bp-gallery-fullscreen">{content()}</div>
      </BPModal>
    </div>
  );
}
export function BPProductCardSkeleton() {
  return (
    <BPCard>
      <BPSkeleton className="bp-card-skeleton" />
      <BPSkeleton />
      <BPSkeleton />
    </BPCard>
  );
}
export function BPCategoryCardSkeleton() {
  return (
    <BPCard>
      <BPSkeleton className="bp-card-skeleton" />
      <BPSkeleton />
    </BPCard>
  );
}

export function BPCategoryGrid({ categories }: { categories: readonly Category[] }) {
  return (
    <div className="bp-category-grid">
      {categories.map((category) => (
        <BPCategoryCard key={category.id} category={category} />
      ))}
    </div>
  );
}
export function BPProductGrid({ products }: { products: readonly Product[] }) {
  return (
    <div className="bp-product-grid">
      {products.map((product) => (
        <BPProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
export function BPCategoryHero({ category }: { category: Category }) {
  const { t } = useBPTranslation();
  return (
    <div className="bp-category-hero">
      <div>
        <span className="bp-overline">{t('collection')}</span>
        <BPHeading level={1} fluid>
          {category.name}
        </BPHeading>
        <p>{category.description || t('categoryBody')}</p>
        <a
          href={'/products?categoryId=' + encodeURIComponent(category.id)}
          className="bp-button bp-button-dark bp-button-md"
        >
          {t('explore')} <ArrowUpRight size={18} />
        </a>
      </div>
      <div className="bp-category-hero-image">
        <BPMediaImage reference={category.image} priority />
      </div>
    </div>
  );
}

export function BPGroupedSpecifications({
  attributes,
}: {
  attributes: readonly TechnicalAttribute[];
}) {
  const { t } = useBPTranslation();
  const groups = [...new Set(attributes.map((a) => a.group?.id ?? 'ungrouped'))];
  return (
    <div className="bp-specification-groups">
      {groups.map((id) => (
        <section key={id}>
          <BPHeading level={3} role="heading5">
            {attributes.find((a) => a.group?.id === id)?.group?.label ?? t('specifications')}
          </BPHeading>
          <BPSpecificationList
            attributes={attributes.filter((a) => (a.group?.id ?? 'ungrouped') === id)}
          />
        </section>
      ))}
    </div>
  );
}
