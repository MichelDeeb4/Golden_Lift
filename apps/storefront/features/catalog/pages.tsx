import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiError, publicProductFilterSchema } from '@golden-lift/api';
import type { PublicProductFilter } from '@golden-lift/api';
import { DynamicFilters } from './filters';
import {
  GLAlert,
  GLButton,
  GLBreadcrumb,
  GLHeading,
  GLPageContainer,
  GLSection,
  GLText,
  GLEmptyState,
  GLPagination,
  GLInput,
  GLSelect,
  GLDrawer,
  GLPageHeader,
  GLSkeleton,
  GLTabs,
} from '@golden-lift/ui';
import {
  GLMediaImage,
  GLCategoryCard,
  GLProductCard,
  GLProductCardSkeleton,
  GLCategoryCardSkeleton,
  GLProductGallery,
  GLSpecificationList,
  GLTechnicalDocumentCard,
  GLVideo,
} from '@golden-lift/catalog-ui';
import { useGLTranslation, useLocale } from '@golden-lift/i18n';
import { ArrowUpRight, Layers, Ruler, ShieldCheck } from '@golden-lift/icons';
import { useCategories, useCategory, useProducts, useProduct } from './queries';
import { useCatalog } from '../../providers/storefront';
export function useTitle(key: string) {
  const { t } = useGLTranslation();
  useEffect(() => {
    document.title = t(key) + ' | Golden Lift';
  }, [t, key]);
}
export function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useGLTranslation();
  return (
    <GLAlert tone="error">
      {error instanceof ApiError && error.code === 'unsupported' ? t('apiListing') : t('errorBody')}{' '}
      <GLButton variant="text" onClick={retry}>
        {t('retry')}
      </GLButton>
    </GLAlert>
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
  const { t } = useGLTranslation();
  return (
    <div className="gl-section-heading">
      <div>
        {overline && <div className="gl-overline">{overline}</div>}
        <GLHeading fluid level={level}>
          {title}
        </GLHeading>
        {description && <p>{description}</p>}
      </div>
      {link && (
        <a className="gl-button gl-button-text gl-button-md" href="/products">
          {t('viewAll')} <ArrowUpRight size={18} />
        </a>
      )}
    </div>
  );
}
export function Values() {
  const { t } = useGLTranslation();
  return (
    <GLSection className="gl-dark gl-values">
      <GLPageContainer>
        <div className="gl-values-header">
          <div className="gl-overline">03 / {t('values')}</div>
          <GLHeading fluid>{t('valueTitle')}</GLHeading>
          <p>{t('valueBody')}</p>
        </div>
        <div className="gl-grid gl-grid-three">
          {[
            { icon: Ruler, key: 'value1' },
            { icon: Layers, key: 'value2' },
            { icon: ShieldCheck, key: 'value3' },
          ].map((v, index) => (
            <div className="gl-value" key={v.key}>
              <span className="gl-value-index">0{index + 1}</span>
              <GLHeading fluid level={3} role="heading5">
                {t(v.key)}
              </GLHeading>
              <p>{t(v.key + 'Body')}</p>
            </div>
          ))}
        </div>
      </GLPageContainer>
    </GLSection>
  );
}
export function HomePage() {
  useTitle('home');
  const { t } = useGLTranslation(),
    categories = useCategories(),
    products = useProducts(),
    source = useCatalog();
  return (
    <>
      <section className="gl-hero">
        <div className="gl-hero-layout">
          <div className="gl-hero-content">
            <div className="gl-overline">GOLDEN LIFT / {t('brand')}</div>
            <GLHeading fluid level={1} role="displayXL">
              {t('heroTitle')}
            </GLHeading>
            <p>{t('heroBody')}</p>
            <div className="gl-row">
              <a href="/products" className="gl-button gl-button-primary gl-button-lg">
                {t('explore')} <ArrowUpRight size={18} />
              </a>
              <a href="/categories" className="gl-button gl-button-ghost gl-button-lg">
                {t('viewCategories')}
              </a>
            </div>
          </div>
          <div className="gl-hero-illustration">
            <img src="/demo/hero.svg" alt={t('gallery')} fetchPriority="high" />
            <span className="gl-hero-image-label">GOLDEN LIFT / 01</span>
          </div>
          <span className="gl-hero-number" aria-hidden="true">
            01 / GL
          </span>
        </div>
      </section>
      <GLSection>
        <GLPageContainer>
          <SectionHeading
            overline={'01 / ' + t('collection')}
            title={t('categoryTitle')}
            description={t('categoryBody')}
          />
          {categories.isPending ? (
            <div className="gl-category-editorial">
              {[1, 2, 3].map((i) => (
                <GLCategoryCardSkeleton key={i} />
              ))}
            </div>
          ) : categories.isError ? (
            <QueryError error={categories.error} retry={() => void categories.refetch()} />
          ) : categories.data.items.length ? (
            <div className="gl-category-editorial">
              {categories.data.items.map((c) => (
                <GLCategoryCard key={c.id} category={c} />
              ))}
            </div>
          ) : (
            <GLEmptyState title={t('emptyCategories')} />
          )}
        </GLPageContainer>
      </GLSection>
      <GLSection className="gl-featured-system">
        <GLPageContainer>
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
            <>
              <div className="gl-featured-stage">
                <a className="gl-featured-visual" href={'/products/' + products.data.items[0]!.id}>
                  <GLMediaImage
                    reference={
                      products.data.items[0]!.media.find((m) => m.kind === 'image') ?? null
                    }
                  />
                </a>
                <div className="gl-featured-copy">
                  <span className="gl-overline">{products.data.items[0]!.categoryName}</span>
                  <GLHeading fluid level={3}>
                    {products.data.items[0]!.name}
                  </GLHeading>
                  <bdi>{products.data.items[0]!.model}</bdi>
                  <GLSpecificationList
                    attributes={products.data.items[0]!.attributes.slice(0, 2)}
                  />
                  <a
                    href={'/products/' + products.data.items[0]!.id}
                    className="gl-button gl-button-dark gl-button-lg"
                  >
                    {t('details')} ↗
                  </a>
                </div>
              </div>
              <div className="gl-supporting-products">
                {products.data.items.slice(1, 4).map((p) => (
                  <GLProductCard key={p.id} product={p} />
                ))}
              </div>
            </>
          ) : (
            <GLEmptyState title={t('emptyTitle')} />
          )}
        </GLPageContainer>
      </GLSection>
      <Values />
      {source.demo && products.data?.items.some((p) => p.documents.length > 0) && (
        <GLSection>
          <GLPageContainer>
            <SectionHeading
              overline={'04 / ' + t('resources')}
              title={t('resources')}
              description={t('resourcesBody')}
            />
            {products.data.items
              .flatMap((p) => p.documents)
              .map((d) => (
                <GLTechnicalDocumentCard key={d.id} document={d} />
              ))}
          </GLPageContainer>
        </GLSection>
      )}
    </>
  );
}
function ProductSkeleton() {
  return (
    <div className="gl-grid" aria-busy="true">
      {[1, 2, 3, 4].map((i) => (
        <GLProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
export function CategoriesPage() {
  useTitle('categories');
  const { t } = useGLTranslation(),
    [cursor, setCursor] = useState<string | undefined>(),
    q = useCategories(null, cursor);
  const { locale } = useLocale();
  useEffect(() => setCursor(undefined), [locale]);
  return (
    <GLPageContainer>
      <GLBreadcrumb
        items={[
          { href: '/', label: t('home') },
          { href: '/categories', label: t('categories') },
        ]}
      />
      <GLSection>
        <SectionHeading level={1} title={t('categories')} description={t('categoryBody')} />
        {q.isPending ? (
          <ProductSkeleton />
        ) : q.isError ? (
          <QueryError error={q.error} retry={() => void q.refetch()} />
        ) : q.data.items.length ? (
          <>
            <div className="gl-category-editorial">
              {q.data.items.map((c) => (
                <GLCategoryCard key={c.id} category={c} />
              ))}
            </div>
            {q.data.nextCursor && (
              <GLButton onClick={() => setCursor(q.data.nextCursor ?? undefined)}>
                {t('loadMore')}
              </GLButton>
            )}
          </>
        ) : (
          <GLEmptyState title={t('emptyCategories')} />
        )}
      </GLSection>
    </GLPageContainer>
  );
}
export function CategoryPage() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    { t } = useGLTranslation(),
    [cursor, setCursor] = useState<string | undefined>(),
    category = useCategory(id),
    children = useCategories(id, cursor);
  const { locale } = useLocale();
  useEffect(() => setCursor(undefined), [locale, id]);
  useEffect(() => {
    if (category.data) document.title = category.data.name + ' | Golden Lift';
  }, [category.data]);
  if (category.error instanceof ApiError && category.error.code === 'not-found')
    return <NotFoundPage />;
  return (
    <GLPageContainer>
      <GLBreadcrumb
        items={[
          { href: '/', label: t('home') },
          { href: '/categories', label: t('categories') },
          { href: '/categories/' + id, label: category.data?.name ?? t('loading') },
        ]}
      />
      <GLSection className="gl-category-intro">
        {category.data?.image && (
          <GLMediaImage reference={category.data.image} className="gl-category-cover" priority />
        )}
        {category.isPending ? (
          <GLSkeleton />
        ) : category.isError ? (
          <QueryError error={category.error} retry={() => void category.refetch()} />
        ) : (
          <SectionHeading
            level={1}
            title={category.data.name}
            description={category.data.description ?? undefined}
          />
        )}
        <CategoryContents id={id} query={children} />
        {children.data?.nextCursor && (
          <GLButton onClick={() => setCursor(children.data?.nextCursor ?? undefined)}>
            {t('loadMore')}
          </GLButton>
        )}
      </GLSection>
    </GLPageContainer>
  );
}
function CategoryContents({ id, query }: { id: string; query: ReturnType<typeof useCategories> }) {
  if (query.isPending) return <ProductSkeleton />;
  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />;
  return query.data.items.length ? (
    <div className="gl-grid gl-grid-three">
      {query.data.items.map((c) => (
        <GLCategoryCard key={c.id} category={c} />
      ))}
    </div>
  ) : (
    <ListingGrid categoryId={id} />
  );
}
const searchSchema = z.object({ text: z.string().trim().max(120) });
export function ListingPage({ search = false }: { search?: boolean }) {
  useTitle(search ? 'searchResults' : 'products');
  const { t } = useGLTranslation(),
    params = useLocalSearchParams<{ q?: string }>();
  return (
    <GLPageContainer>
      <GLBreadcrumb
        items={[
          { href: '/', label: t('home') },
          {
            href: search ? '/search' : '/products',
            label: t(search ? 'searchResults' : 'products'),
          },
        ]}
      />
      <GLSection>
        <SectionHeading
          level={1}
          overline={t('collection')}
          title={t(search ? 'searchResults' : 'products')}
          description={t(search ? 'searchHelp' : 'featuredBody')}
        />
        <ListingGrid initialText={params.q ?? ''} search={search} />
      </GLSection>
    </GLPageContainer>
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
    sort?: string;
    page?: string;
    filters?: string;
    q?: string;
  }>();
  const filterText = params.filters || '[]';
  const queryText = params.q ?? initialText;
  let dynamicFilters: readonly PublicProductFilter[] = [];
  let invalidFilters = false;
  try {
    const parsed: unknown = JSON.parse(filterText);
    const result = z.array(publicProductFilterSchema).max(10).safeParse(parsed);
    if (result.success) dynamicFilters = result.data as readonly PublicProductFilter[];
    else invalidFilters = true;
  } catch {
    invalidFilters = true;
  }
  const { t } = useGLTranslation(),
    { locale } = useLocale(),
    [text, setText] = useState(queryText),
    [filtersOpen, setFiltersOpen] = useState(false),
    [compact, setCompact] = useState(false),
    category = categoryId ?? params.category ?? '',
    sort: 'featured' | 'name' = params.sort === 'name' ? 'name' : 'featured',
    page = /^[1-9][0-9]{0,3}$/.test(params.page ?? '') ? Number(params.page) : 1,
    categories = useCategories(),
    products = useProducts({
      text,
      categoryId: category || undefined,
      sort,
      page,
      filters: dynamicFilters,
    }),
    router = useRouter();
  const setPage = (value: number) => router.setParams({ page: String(value) });
  const setCategory = (value: string) =>
    router.setParams({ category: value, page: '1', filters: '' });
  const setSort = (value: 'featured' | 'name') => router.setParams({ sort: value, page: '1' });
  const filters = (
    <DynamicFilters
      definitions={products.data?.filters ?? []}
      value={dynamicFilters}
      onApply={(value) => {
        router.setParams({ filters: JSON.stringify(value), page: '1' });
        setFiltersOpen(false);
      }}
    />
  );
  const form = useForm<{ text: string }>({
    defaultValues: { text: queryText },
    resolver: zodResolver(searchSchema),
  });
  const resetSearch = form.reset;
  useEffect(() => {
    setText(queryText);
    resetSearch({ text: queryText });
  }, [queryText, resetSearch]);
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
  return (
    <>
      {compact ? (
        <>
          <GLButton variant="secondary" onClick={() => setFiltersOpen(true)}>
            {t('filter')} / {t('sort')}
          </GLButton>
          <GLDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t('filter')}>
            {' '}
            <form
              className="gl-list-toolbar"
              onSubmit={form.handleSubmit((v) => {
                setText(v.text);
                setPage(1);
                router.setParams({ q: v.text });
                setFiltersOpen(false);
              })}
            >
              <GLInput
                label={t('search')}
                placeholder={t('searchPlaceholder')}
                {...form.register('text')}
                error={form.formState.errors.text ? t('searchTooLong') : undefined}
              />
              {!categoryId && (
                <GLSelect
                  label={t('filter')}
                  value={category}
                  onChange={(v) => {
                    setCategory(v);
                    setPage(1);
                  }}
                  options={[
                    { value: '', label: t('allCategories') },
                    ...(categories.data?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              )}
              <GLSelect
                label={t('sort')}
                value={sort}
                onChange={(v) => {
                  setSort(v as typeof sort);
                  setPage(1);
                }}
                options={[
                  { value: 'featured', label: t('sortFeatured') },
                  { value: 'name', label: t('sortName') },
                ]}
              />
              <GLButton type="submit" variant="dark">
                {t('submit')}
              </GLButton>
            </form>
            {filters}
          </GLDrawer>
        </>
      ) : (
        <form
          className="gl-list-toolbar"
          onSubmit={form.handleSubmit((v) => {
            setText(v.text);
            setPage(1);
            router.setParams({ q: v.text });
            setFiltersOpen(false);
          })}
        >
          <GLInput
            label={t('search')}
            placeholder={t('searchPlaceholder')}
            {...form.register('text')}
            error={form.formState.errors.text ? t('searchTooLong') : undefined}
          />
          {!categoryId && (
            <GLSelect
              label={t('filter')}
              value={category}
              onChange={(v) => {
                setCategory(v);
                setPage(1);
              }}
              options={[
                { value: '', label: t('allCategories') },
                ...(categories.data?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          )}
          <GLSelect
            label={t('sort')}
            value={sort}
            onChange={(v) => {
              setSort(v as typeof sort);
              setPage(1);
            }}
            options={[
              { value: 'featured', label: t('sortFeatured') },
              { value: 'name', label: t('sortName') },
            ]}
          />
          <GLButton type="submit" variant="dark">
            {t('submit')}
          </GLButton>
        </form>
      )}
      {!compact && filters}
      {products.data?.total != null && (
        <p className="gl-result-count">{t('results', { count: products.data.total })}</p>
      )}
      {invalidFilters ? (
        <GLAlert tone="error">
          {t('errorBody')}{' '}
          <GLButton variant="text" onClick={() => router.setParams({ filters: '', page: '1' })}>
            {t('clear')}
          </GLButton>
        </GLAlert>
      ) : products.isPending ? (
        <ProductSkeleton />
      ) : products.isError ? (
        <QueryError error={products.error} retry={() => void products.refetch()} />
      ) : products.data.items.length ? (
        <>
          <div className="gl-grid">
            {products.data.items.map((p) => (
              <GLProductCard key={p.id} product={p} />
            ))}
          </div>
          {((products.data.total ?? 0) > 4 || page > 1 || products.data.nextCursor) && (
            <GLPagination
              page={page}
              total={
                products.data.total !== null
                  ? Math.ceil(products.data.total / 4)
                  : page + (products.data.nextCursor ? 1 : 0)
              }
              onChange={setPage}
            />
          )}
        </>
      ) : (
        <GLEmptyState
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={
            <GLButton
              variant="secondary"
              onClick={() => {
                setText('');
                setCategory(categoryId ?? '');
                form.reset({ text: '' });
                setPage(1);
                router.setParams({ q: '' });
              }}
            >
              {t('clear')}
            </GLButton>
          }
        />
      )}
    </>
  );
}
export function ProductPage() {
  const { id } = useLocalSearchParams<{ id: string }>(),
    q = useProduct(id),
    related = useProducts(),
    { t } = useGLTranslation(),
    [tab, setTab] = useState('overview');
  useEffect(() => {
    if (q.data) document.title = q.data.name + ' | Golden Lift';
  }, [q.data]);
  if (q.error instanceof ApiError && q.error.code === 'not-found') return <NotFoundPage />;
  if (q.isPending)
    return (
      <GLPageContainer>
        <GLSection>
          <div className="gl-grid gl-grid-two">
            <GLSkeleton className="gl-gallery-main" />
            <div>
              <GLSkeleton />
              <GLSkeleton />
              <GLSkeleton />
            </div>
          </div>
        </GLSection>
      </GLPageContainer>
    );
  if (q.isError)
    return (
      <GLPageContainer>
        <GLSection>
          <QueryError error={q.error} retry={() => void q.refetch()} />
        </GLSection>
      </GLPageContainer>
    );
  const p = q.data;
  return (
    <>
      <GLPageContainer>
        <GLSection className="gl-product-detail">
          <div className="gl-product-columns">
            <GLProductGallery media={p.media} />
            <div className="gl-product-info">
              <GLBreadcrumb
                items={[
                  { href: '/', label: t('home') },
                  { href: '/products', label: t('products') },
                  { href: '/categories/' + p.categoryId, label: p.categoryName },
                  { href: '/products/' + p.id, label: p.name },
                ]}
              />
              <span className="gl-overline">{p.categoryName}</span>
              {p.productTypeName && (
                <GLText role="technicalLabel" className="gl-muted">
                  {p.productTypeName}
                </GLText>
              )}
              <GLHeading fluid level={1}>
                {p.name}
              </GLHeading>
              {p.model && (
                <GLText role="technicalLabel" className="gl-muted">
                  {t('model')} / <bdi>{p.model}</bdi>
                </GLText>
              )}
              <p className="gl-product-description">{p.description}</p>
              <GLSpecificationList attributes={p.attributes.slice(0, 2)} />
              <div className="gl-product-media-actions">
                {p.documents.length > 0 && (
                  <a href="#product-documents" className="gl-button gl-button-dark gl-button-md">
                    {t('documents')} ↗
                  </a>
                )}
                {p.media.some((m) => m.kind === 'video') && (
                  <a href="#product-video" className="gl-button gl-button-secondary gl-button-md">
                    {t('video')}
                  </a>
                )}
              </div>
            </div>
          </div>
        </GLSection>
        <GLSection className="gl-product-dossier">
          <div className="gl-dossier-heading">
            <span className="gl-overline">01 / {t('overview')}</span>
            <GLHeading fluid>{t('technical')}</GLHeading>
          </div>
          <div>
            <GLTabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'overview', label: t('overview') },
                { id: 'specifications', label: t('specifications') },
              ]}
            />
            <div role="tabpanel" id={'panel-' + tab} aria-labelledby={'tab-' + tab} tabIndex={0}>
              {tab === 'overview' ? (
                <p className="gl-dossier-description">{p.description}</p>
              ) : (
                <>
                  <span className="gl-overline">02 / {t('specifications')}</span>
                  <GLSpecificationList attributes={p.attributes} />
                </>
              )}
            </div>
          </div>
        </GLSection>
        {p.media.some((m) => m.kind === 'video') && (
          <GLSection id="product-video">
            <SectionHeading overline={'03 / ' + t('video')} title={t('video')} />
            {p.media
              .filter((m) => m.kind === 'video')
              .map((m) => (
                <GLVideo key={m.id} reference={m} />
              ))}
          </GLSection>
        )}
        {p.documents.length > 0 && (
          <GLSection id="product-documents">
            <SectionHeading overline={'04 / ' + t('documents')} title={t('documents')} />
            <div className="gl-grid gl-grid-two">
              {p.documents.map((d) => (
                <GLTechnicalDocumentCard key={d.id} document={d} />
              ))}
            </div>
          </GLSection>
        )}
        {related.data?.items.some((r) => r.id !== p.id) && (
          <GLSection>
            <SectionHeading overline={'05 / ' + t('related')} title={t('related')} />
            <div className="gl-grid">
              {related.data.items
                .filter((r) => r.id !== p.id)
                .slice(0, 3)
                .map((r) => (
                  <GLProductCard key={r.id} product={r} />
                ))}
            </div>
          </GLSection>
        )}
      </GLPageContainer>
    </>
  );
}
export function AboutPage() {
  useTitle('about');
  const { t } = useGLTranslation();
  return (
    <>
      <GLPageContainer>
        <GLBreadcrumb
          items={[
            { href: '/', label: t('home') },
            { href: '/about', label: t('about') },
          ]}
        />
        <GLSection>
          <div className="gl-about-layout">
            <div>
              <div className="gl-overline">GOLDEN LIFT</div>
              <GLHeading fluid level={1}>
                {t('aboutTitle')}
              </GLHeading>
              <p>{t('aboutBody')}</p>
              <GLAlert>{t('demoAbout')}</GLAlert>
            </div>
            <img src="/demo/silver.svg" alt={t('gallery')} loading="lazy" />
          </div>
        </GLSection>
      </GLPageContainer>
      <Values />
    </>
  );
}
export function ContactPage() {
  useTitle('contact');
  const { t } = useGLTranslation();
  return (
    <GLPageContainer>
      <GLBreadcrumb
        items={[
          { href: '/', label: t('home') },
          { href: '/contact', label: t('contact') },
        ]}
      />
      <GLSection>
        <SectionHeading level={1} title={t('contactTitle')} />
        <GLEmptyState title={t('contactPending')} description={t('contactBody')} />
      </GLSection>
    </GLPageContainer>
  );
}
export function NotFoundPage() {
  useTitle('notFound');
  const { t } = useGLTranslation();
  return (
    <GLPageContainer>
      <GLSection>
        <div className="gl-error-number" aria-hidden="true">
          404
        </div>
        <GLEmptyState
          title={t('notFound')}
          description={t('notFoundBody')}
          action={
            <a href="/" className="gl-button gl-button-primary gl-button-lg">
              {t('backHome')}
            </a>
          }
        />
      </GLSection>
    </GLPageContainer>
  );
}
