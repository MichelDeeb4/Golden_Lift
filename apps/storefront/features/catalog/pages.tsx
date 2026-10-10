import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ApiError,
  parseCatalogFilterState,
  normalizeCatalogFilterState,
  serializeCatalogFilterState,
} from '@business-platform/api';
import type { ProductQuery } from '@business-platform/api';
import { DynamicFilters, CategoryFilterPanel } from './filters';
import {
  BPAlert,
  BPButton,
  BPBreadcrumb,
  BPHeading,
  BPPageContainer,
  BPSection,
  BPText,
  BPEmptyState,
  BPPagination,
  BPInput,
  BPSelect,
  BPDrawer,
  BPSkeleton,
  BPTabs,
} from '@business-platform/ui';
import {
  BPMediaImage,
  BPCategoryGrid,
  BPCategoryHero,
  BPProductGrid,
  BPGroupedSpecifications,
  BPProductCardSkeleton,
  BPCategoryCardSkeleton,
  BPProductGallery,
  BPSpecificationList,
  BPTechnicalDocumentCard,
} from '@business-platform/catalog-ui';
import { useBPTranslation, useLocale } from '@business-platform/i18n';
import { ArrowUpRight, Layers, Ruler, ShieldCheck } from '@business-platform/icons';
import { useCategories, useCategory, useProducts, useProduct } from './queries';
import { useCatalog } from '../../providers/storefront';
export function useTitle(key: string) {
  const { t } = useBPTranslation();
  useEffect(() => {
    document.title = t(key) + ' | Business Platform';
  }, [t, key]);
}
export function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useBPTranslation();
  return (
    <BPAlert tone="error">
      {error instanceof ApiError && error.code === 'unsupported' ? t('apiListing') : t('errorBody')}{' '}
      <BPButton variant="text" onClick={retry}>
        {t('retry')}
      </BPButton>
    </BPAlert>
  );
}
function SectionHeading({
  overline,
  title,
  description,
  link,
  level = 2,
}: {
  overline?: string;
  title: string;
  description?: string;
  link?: boolean;
  level?: 1 | 2;
}) {
  const { t } = useBPTranslation();
  return (
    <div className="bp-section-heading">
      <div>
        {overline && <div className="bp-overline">{overline}</div>}
        <BPHeading fluid level={level}>
          {title}
        </BPHeading>
        {description && <p>{description}</p>}
      </div>
      {link && (
        <a className="bp-button bp-button-text bp-button-md" href="/products">
          {t('viewAll')} <ArrowUpRight size={18} />
        </a>
      )}
    </div>
  );
}
export function Values() {
  const { t } = useBPTranslation();
  return (
    <BPSection className="bp-dark bp-values">
      <BPPageContainer>
        <div className="bp-values-header">
          <div className="bp-overline">03 / {t('values')}</div>
          <BPHeading fluid>{t('valueTitle')}</BPHeading>
          <p>{t('valueBody')}</p>
        </div>
        <div className="bp-grid bp-grid-three">
          {[
            { icon: Ruler, key: 'value1' },
            { icon: Layers, key: 'value2' },
            { icon: ShieldCheck, key: 'value3' },
          ].map((v, index) => (
            <div className="bp-value" key={v.key}>
              <span className="bp-value-index">0{index + 1}</span>
              <BPHeading fluid level={3} role="heading5">
                {t(v.key)}
              </BPHeading>
              <p>{t(v.key + 'Body')}</p>
            </div>
          ))}
        </div>
      </BPPageContainer>
    </BPSection>
  );
}
export function HomePage() {
  useTitle('home');
  const { t } = useBPTranslation(),
    categories = useCategories(),
    products = useProducts(),
    source = useCatalog();
  return (
    <>
      <section className="bp-hero">
        <div className="bp-hero-layout">
          <div className="bp-hero-content">
            <div className="bp-overline">BUSINESS PLATFORM / {t('brand')}</div>
            <BPHeading fluid level={1} role="displayXL">
              {t('heroTitle')}
            </BPHeading>
            <p>{t('heroBody')}</p>
            <div className="bp-row">
              <a href="/products" className="bp-button bp-button-primary bp-button-lg">
                {t('explore')} <ArrowUpRight size={18} />
              </a>
              <a href="/categories" className="bp-button bp-button-ghost bp-button-lg">
                {t('viewCategories')}
              </a>
            </div>
          </div>
          <div className="bp-hero-illustration">
            <img src="/demo/hero.svg" alt={t('gallery')} fetchPriority="high" />
            <span className="bp-hero-image-label">BUSINESS PLATFORM / 01</span>
          </div>
        </div>
      </section>
      <BPSection>
        <BPPageContainer>
          <SectionHeading
            overline={'01 / ' + t('collection')}
            title={t('categoryTitle')}
            description={t('categoryBody')}
          />
          {categories.isPending ? (
            <div className="bp-category-grid">
              {[1, 2, 3].map((i) => (
                <BPCategoryCardSkeleton key={i} />
              ))}
            </div>
          ) : categories.isError ? (
            <QueryError error={categories.error} retry={() => void categories.refetch()} />
          ) : categories.data.items.length ? (
            <BPCategoryGrid categories={categories.data.items} />
          ) : (
            <BPEmptyState title={t('emptyCategories')} />
          )}
        </BPPageContainer>
      </BPSection>
      <BPSection className="bp-featured-system">
        <BPPageContainer>
          <SectionHeading
            overline={'02 / ' + t('featured')}
            title={t('featured')}
            description={t('featuredBody')}
            link
          />
          {products.isPending ? (
            <ProductSkeleton />
          ) : products.isError ? (
            <QueryError error={products.error} retry={() => void products.refetch()} />
          ) : products.data.items.length ? (
            <BPProductGrid products={products.data.items.slice(0, 4)} />
          ) : (
            <BPEmptyState title={t('emptyTitle')} />
          )}
        </BPPageContainer>
      </BPSection>
      <Values />
      {source.demo && products.data?.items.some((p) => p.documents.length > 0) && (
        <BPSection>
          <BPPageContainer>
            <SectionHeading
              overline={'04 / ' + t('resources')}
              title={t('resources')}
              description={t('resourcesBody')}
            />
            {products.data.items
              .flatMap((p) => p.documents)
              .map((d) => (
                <BPTechnicalDocumentCard key={d.id} document={d} />
              ))}
          </BPPageContainer>
        </BPSection>
      )}
    </>
  );
}
function ProductSkeleton() {
  return (
    <div className="bp-product-grid" aria-busy="true">
      {[1, 2, 3, 4].map((i) => (
        <BPProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
export function CategoriesPage() {
  useTitle('categories');
  const { t } = useBPTranslation(),
    [cursor, setCursor] = useState<string | undefined>(),
    q = useCategories(null, cursor);
  const { locale } = useLocale();
  useEffect(() => setCursor(undefined), [locale]);
  return (
    <BPPageContainer>
      <BPBreadcrumb
        items={[
          { href: '/', label: t('home') },
          { href: '/categories', label: t('categories') },
        ]}
      />
      <BPSection>
        <SectionHeading level={1} title={t('categories')} description={t('categoryBody')} />
        {q.isPending ? (
          <ProductSkeleton />
        ) : q.isError ? (
          <QueryError error={q.error} retry={() => void q.refetch()} />
        ) : q.data.items.length ? (
          <>
            <BPCategoryGrid categories={q.data.items} />
            {q.data.nextCursor && (
              <BPButton onClick={() => setCursor(q.data.nextCursor ?? undefined)}>
                {t('loadMore')}
              </BPButton>
            )}
          </>
        ) : (
          <BPEmptyState title={t('emptyCategories')} />
        )}
      </BPSection>
    </BPPageContainer>
  );
}
export function CategoryPage() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { t } = useBPTranslation(),
    [cursor, setCursor] = useState<string | undefined>(),
    category = useCategory(id),
    children = useCategories(id, cursor);
  const { locale } = useLocale();
  useEffect(() => setCursor(undefined), [locale, id]);
  useEffect(() => {
    if (category.data) document.title = category.data.name + ' | Business Platform';
  }, [category.data]);
  if (category.error instanceof ApiError && category.error.code === 'not-found')
    return <NotFoundPage />;
  return (
    <BPPageContainer>
      <BPBreadcrumb
        items={[
          { href: '/', label: t('home') },
          { href: '/categories', label: t('categories') },
          { href: '/categories/' + id, label: category.data?.name ?? t('loading') },
        ]}
      />
      <BPSection className="bp-category-intro">
        {category.isPending ? (
          <BPSkeleton />
        ) : category.isError ? (
          <QueryError error={category.error} retry={() => void category.refetch()} />
        ) : (
          <BPCategoryHero category={category.data} />
        )}
        <CategoryContents id={id} query={children} />
        {children.data?.nextCursor && (
          <BPButton onClick={() => setCursor(children.data?.nextCursor ?? undefined)}>
            {t('loadMore')}
          </BPButton>
        )}
      </BPSection>
    </BPPageContainer>
  );
}
function CategoryContents({ id, query }: { id: string; query: ReturnType<typeof useCategories> }) {
  if (query.isPending) return <ProductSkeleton />;
  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />;
  return query.data.items.length ? (
    <BPCategoryGrid categories={query.data.items} />
  ) : (
    <ListingGrid categoryId={id} />
  );
}
const searchSchema = z.object({ text: z.string().trim().max(120) });
export function ListingPage({ search = false }: { search?: boolean }) {
  useTitle(search ? 'searchResults' : 'products');
  const { t } = useBPTranslation(),
    params = useLocalSearchParams<{ q?: string }>();
  return (
    <BPPageContainer>
      <BPBreadcrumb
        items={[
          { href: '/', label: t('home') },
          {
            href: search ? '/search' : '/products',
            label: t(search ? 'searchResults' : 'products'),
          },
        ]}
      />
      <BPSection>
        <SectionHeading
          level={1}
          overline={t('collection')}
          title={t(search ? 'searchResults' : 'products')}
          description={t(search ? 'searchHelp' : 'featuredBody')}
        />
        <ListingGrid initialText={params.q ?? ''} search={search} />
      </BPSection>
    </BPPageContainer>
  );
}
function ListingGrid({
  categoryId,
  initialText = '',
  search = false,
}: {
  categoryId?: string;
  initialText?: string;
  search?: boolean;
}) {
  const params = useLocalSearchParams<{
    category?: string;
    categoryId?: string;
    sort?: string;
    page?: string;
    filters?: string;
    q?: string;
  }>();
  const parsed = parseCatalogFilterState({ ...params, q: params.q ?? initialText }),
    state = normalizeCatalogFilterState({
      ...parsed.state,
      categoryId: categoryId ?? parsed.state.categoryId,
    });
  const { t } = useBPTranslation(),
    [filtersOpen, setFiltersOpen] = useState(false),
    [compact, setCompact] = useState(false),
    products = useProducts(state),
    selectedCategory = useCategory(state.categoryId ?? ''),
    router = useRouter();
  const change = (next: ProductQuery) =>
    router.push(
      categoryId
        ? {
            pathname: '/categories/[id]',
            params: { id: categoryId, ...serializeCatalogFilterState(next) },
          }
        : { pathname: search ? '/search' : '/products', params: serializeCatalogFilterState(next) },
    );
  const clear = () => change({ categoryId, page: 1 });
  const form = useForm<{ text: string }>({
    defaultValues: { text: state.text ?? '' },
    resolver: zodResolver(searchSchema),
  });
  const reset = form.reset;
  useEffect(() => reset({ text: state.text ?? '' }), [state.text, reset]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => {
      setCompact(media.matches);
      setFiltersOpen(false);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const controls = (
    <>
      <form
        className="bp-list-toolbar"
        onSubmit={form.handleSubmit((v) => {
          change({ ...state, text: v.text, page: 1 });
          setFiltersOpen(false);
        })}
      >
        <BPInput
          label={t('search')}
          placeholder={t('searchPlaceholder')}
          {...form.register('text')}
          error={form.formState.errors.text ? t('searchTooLong') : undefined}
        />
        <BPSelect
          label={t('sort')}
          value={state.sort}
          onChange={(value) =>
            change({ ...state, sort: value === 'name' ? 'name' : 'featured', page: 1 })
          }
          options={[
            { value: 'featured', label: t('sortFeatured') },
            { value: 'name', label: t('sortName') },
          ]}
        />
        <BPButton type="submit" variant="dark">
          {t('submit')}
        </BPButton>
      </form>
      {!categoryId && (
        <CategoryFilterPanel
          value={state.categoryId ?? ''}
          onChange={(id) => change({ ...state, categoryId: id, filters: [], page: 1 })}
        />
      )}
      <DynamicFilters
        definitions={products.data?.filters ?? []}
        value={state.filters}
        onApply={(filters) => {
          change({ ...state, filters, page: 1 });
          setFiltersOpen(false);
        }}
      />
      <BPButton variant="text" onClick={clear}>
        {t('clearAllFilters')}
      </BPButton>
    </>
  );
  return (
    <div className="bp-catalog-listing">
      {compact ? (
        <>
          <BPButton variant="secondary" onClick={() => setFiltersOpen(true)}>
            {t('filter')} / {t('sort')}
          </BPButton>
          <BPDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t('filter')}>
            {controls}
          </BPDrawer>
        </>
      ) : (
        <aside className="bp-filter-rail" aria-label={t('filter')}>
          <BPHeading level={2} role="heading5">
            {t('filter')}
          </BPHeading>
          {controls}
        </aside>
      )}
      <div className="bp-catalog-results" aria-busy={products.isFetching}>
        <div className="bp-active-filters" aria-label={t('activeFilters')}>
          {state.categoryId && !categoryId && (
            <BPButton
              variant="secondary"
              onClick={() => change({ ...state, categoryId: undefined, filters: [], page: 1 })}
            >
              {selectedCategory.data?.name ?? t('categories')} ×
            </BPButton>
          )}
          {state.text && (
            <BPButton
              variant="secondary"
              onClick={() => change({ ...state, text: undefined, page: 1 })}
            >
              {t('search')}: {state.text} ×
            </BPButton>
          )}
          {state.filters.map((f) => {
            const d = products.data?.filters?.find((d) => d.id === f.definitionId);
            const label = d?.label ?? t('filter');
            const value =
              f.kind === 'NUMBER'
                ? [
                    f.minimum !== undefined ? '≥ ' + f.minimum : '',
                    f.maximum !== undefined ? '≤ ' + f.maximum : '',
                  ]
                    .filter(Boolean)
                    .join(' – ') + (d?.unitSymbol ? ' ' + d.unitSymbol : '')
                : f.kind === 'CHOICE'
                  ? ('optionIds' in f ? f.optionIds : [f.optionId])
                      .map((id) => d?.options.find((o) => o.id === id)?.label ?? t('filter'))
                      .join(' / ')
                  : f.kind === 'BOOLEAN'
                    ? t(f.value ? 'yes' : 'no')
                    : f.value;
            return (
              <BPButton
                key={f.definitionId}
                variant="secondary"
                onClick={() =>
                  change({
                    ...state,
                    filters: state.filters.filter((x) => x.definitionId !== f.definitionId),
                    page: 1,
                  })
                }
              >
                {label}: {value} ×
              </BPButton>
            );
          })}
        </div>
        <p className="bp-result-count" role="status" aria-live="polite">
          {products.isFetching
            ? t('loading')
            : products.data?.total != null
              ? t('results', { count: products.data.total })
              : ''}
        </p>
        {parsed.invalid ? (
          <BPAlert tone="error">
            {t('errorBody')}{' '}
            <BPButton variant="text" onClick={clear}>
              {t('clearAllFilters')}
            </BPButton>
          </BPAlert>
        ) : products.isPending ? (
          <ProductSkeleton />
        ) : products.isError ? (
          <QueryError error={products.error} retry={() => void products.refetch()} />
        ) : products.data.items.length ? (
          <>
            <BPProductGrid products={products.data.items} />
            {products.data.total !== null && products.data.total > state.pageSize && (
              <BPPagination
                page={state.page}
                total={Math.ceil(products.data.total / state.pageSize)}
                onChange={(page) => change({ ...state, page })}
              />
            )}
          </>
        ) : (
          <BPEmptyState
            title={t('emptyTitle')}
            description={t(search ? 'searchHelp' : 'emptyBody')}
            action={<BPButton onClick={clear}>{t('clearAllFilters')}</BPButton>}
          />
        )}
      </div>
    </div>
  );
}
export function ProductPage() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    q = useProduct(id),
    related = useProducts({ categoryId: q.data?.categoryId }),
    { t } = useBPTranslation(),
    [tab, setTab] = useState('overview');
  useEffect(() => {
    if (q.data) document.title = q.data.name + ' | Business Platform';
  }, [q.data]);
  if (q.error instanceof ApiError && q.error.code === 'not-found') return <NotFoundPage />;
  if (q.isPending)
    return (
      <BPPageContainer>
        <BPSection>
          <div className="bp-grid bp-grid-two">
            <BPSkeleton className="bp-gallery-main" />
            <div>
              <BPSkeleton />
              <BPSkeleton />
              <BPSkeleton />
            </div>
          </div>
        </BPSection>
      </BPPageContainer>
    );
  if (q.isError)
    return (
      <BPPageContainer>
        <BPSection>
          <QueryError error={q.error} retry={() => void q.refetch()} />
        </BPSection>
      </BPPageContainer>
    );
  const p = q.data;
  return (
    <>
      <BPPageContainer>
        <BPSection className="bp-product-detail">
          <div className="bp-product-columns">
            <BPProductGallery media={p.media} />
            <div className="bp-product-info">
              <BPBreadcrumb
                items={[
                  { href: '/', label: t('home') },
                  ...(p.navigation?.breadcrumbs.map((c) => ({
                    href: '/categories/' + c.id,
                    label: c.name,
                  })) ?? [{ href: '/categories/' + p.categoryId, label: p.categoryName }]),
                  { href: '/products/' + p.id, label: p.name },
                ]}
              />
              <span className="bp-overline">{p.categoryName}</span>
              <BPHeading fluid level={1}>
                {p.name}
              </BPHeading>
              {p.model && (
                <BPText role="technicalLabel" className="bp-muted">
                  {t('model')} / <bdi>{p.model}</bdi>
                </BPText>
              )}
              <p className="bp-product-description">{p.description}</p>
              <BPSpecificationList attributes={p.attributes.slice(0, 2)} />
              <div className="bp-product-media-actions">
                <a href="/contact" className="bp-button bp-button-primary bp-button-md">
                  {t('contact')}
                </a>
                {p.documents.length > 0 && (
                  <a href="#product-documents" className="bp-button bp-button-dark bp-button-md">
                    {t('documents')} ↗
                  </a>
                )}
                {p.media.some((m) => m.kind === 'video') && (
                  <a href="#product-gallery" className="bp-button bp-button-secondary bp-button-md">
                    {t('video')}
                  </a>
                )}
              </div>
            </div>
          </div>
        </BPSection>
        <nav className="bp-product-neighbors" aria-label={t('productNavigation')}>
          <a href={'/categories/' + p.categoryId}>{t('backToCategory')}</a>
          {p.navigation?.previous && (
            <a href={'/products/' + p.navigation.previous.id}>
              {t('previousProduct')} — {p.navigation.previous.name}
            </a>
          )}
          {p.navigation?.next && (
            <a href={'/products/' + p.navigation.next.id}>
              {t('nextProduct')} — {p.navigation.next.name}
            </a>
          )}
        </nav>
        <BPSection className="bp-product-dossier">
          <div className="bp-dossier-heading">
            <span className="bp-overline">01 / {t('overview')}</span>
            <BPHeading fluid>{t('technical')}</BPHeading>
          </div>
          <div>
            <BPTabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'overview', label: t('overview') },
                { id: 'specifications', label: t('specifications') },
              ]}
            />
            <div role="tabpanel" id={'panel-' + tab} aria-labelledby={'tab-' + tab} tabIndex={0}>
              {tab === 'overview' ? (
                <p className="bp-dossier-description">{p.description}</p>
              ) : (
                <>
                  <span className="bp-overline">02 / {t('specifications')}</span>
                  <BPGroupedSpecifications attributes={p.attributes} />
                </>
              )}
            </div>
          </div>
        </BPSection>
        {p.documents.length > 0 && (
          <BPSection id="product-documents">
            <SectionHeading overline={'04 / ' + t('documents')} title={t('documents')} />
            <div className="bp-grid bp-grid-two bp-document-grid">
              {p.documents.map((d) => (
                <BPTechnicalDocumentCard key={d.id} document={d} />
              ))}
            </div>
          </BPSection>
        )}
        {related.data?.items.some((r) => r.id !== p.id) && (
          <BPSection>
            <SectionHeading overline={'05 / ' + t('related')} title={t('moreFromCategory')} />
            <a href={'/categories/' + p.categoryId}>{t('viewAll')} →</a>
            <BPProductGrid products={related.data.items.filter((r) => r.id !== p.id).slice(0, 3)} />
          </BPSection>
        )}
      </BPPageContainer>
    </>
  );
}
export function AboutPage() {
  useTitle('about');
  const { t } = useBPTranslation();
  return (
    <>
      <BPPageContainer>
        <BPBreadcrumb
          items={[
            { href: '/', label: t('home') },
            { href: '/about', label: t('about') },
          ]}
        />
        <BPSection>
          <div className="bp-about-layout">
            <div>
              <div className="bp-overline">BUSINESS PLATFORM</div>
              <BPHeading fluid level={1}>
                {t('aboutTitle')}
              </BPHeading>
              <p>{t('aboutBody')}</p>
              <BPAlert>{t('demoAbout')}</BPAlert>
            </div>
            <img src="/demo/silver.svg" alt={t('gallery')} loading="lazy" />
          </div>
        </BPSection>
      </BPPageContainer>
      <Values />
    </>
  );
}
export function ContactPage() {
  useTitle('contact');
  const { t } = useBPTranslation();
  return (
    <BPPageContainer>
      <BPBreadcrumb
        items={[
          { href: '/', label: t('home') },
          { href: '/contact', label: t('contact') },
        ]}
      />
      <BPSection>
        <SectionHeading level={1} title={t('contactTitle')} />
        <BPEmptyState title={t('contactPending')} description={t('contactBody')} />
      </BPSection>
    </BPPageContainer>
  );
}
export function NotFoundPage() {
  useTitle('notFound');
  const { t } = useBPTranslation();
  return (
    <BPPageContainer>
      <BPSection>
        <div className="bp-error-number" aria-hidden="true">
          404
        </div>
        <BPEmptyState
          title={t('notFound')}
          description={t('notFoundBody')}
          action={
            <a href="/" className="bp-button bp-button-primary bp-button-lg">
              {t('backHome')}
            </a>
          }
        />
      </BPSection>
    </BPPageContainer>
  );
}
