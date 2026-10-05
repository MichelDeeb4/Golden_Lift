import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiError } from '@golden-lift/api';
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
  GLSkeleton,
  GLTabs,
} from '@golden-lift/ui';
import {
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
        <GLHeading level={level}>{title}</GLHeading>
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
          <div className="gl-overline">{t('values')}</div>
          <GLHeading>{t('valueTitle')}</GLHeading>
          <p>{t('valueBody')}</p>
        </div>
        <div className="gl-grid gl-grid-three">
          {[
            { icon: Ruler, key: 'value1' },
            { icon: Layers, key: 'value2' },
            { icon: ShieldCheck, key: 'value3' },
          ].map((v) => (
            <div className="gl-value" key={v.key}>
              <v.icon size={28} />
              <GLHeading level={3} role="heading5">
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
        <div className="gl-hero-illustration" role="img" aria-label={t('gallery')} />
        <GLPageContainer>
          <div className="gl-hero-content">
            <div className="gl-overline">{t('overline')}</div>
            <GLHeading level={1} role="displayXL">
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
          <span className="gl-hero-number" aria-hidden="true">
            01 / GL
          </span>
        </GLPageContainer>
      </section>
      <GLSection>
        <GLPageContainer>
          <SectionHeading
            overline={t('collection')}
            title={t('categoryTitle')}
            description={t('categoryBody')}
          />
          {categories.isPending ? (
            <div className="gl-grid gl-grid-three">
              {[1, 2, 3].map((i) => (
                <GLCategoryCardSkeleton key={i} />
              ))}
            </div>
          ) : categories.isError ? (
            <QueryError error={categories.error} retry={() => void categories.refetch()} />
          ) : categories.data.items.length ? (
            <div className="gl-grid gl-grid-three">
              {categories.data.items.map((c) => (
                <GLCategoryCard key={c.id} category={c} />
              ))}
            </div>
          ) : (
            <GLEmptyState title={t('emptyCategories')} />
          )}
        </GLPageContainer>
      </GLSection>
      <GLSection className="gl-featured">
        <GLPageContainer>
          <SectionHeading title={t('featured')} description={t('featuredBody')} link />
          {products.isPending ? (
            <ProductSkeleton />
          ) : products.isError ? (
            <QueryError error={products.error} retry={() => void products.refetch()} />
          ) : products.data.items.length ? (
            <div className="gl-grid">
              {products.data.items.map((p) => (
                <GLProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <GLEmptyState title={t('emptyTitle')} />
          )}
        </GLPageContainer>
      </GLSection>
      <Values />
      {source.demo && products.data?.items.some((p) => p.documents.length > 0) && (
        <GLSection>
          <GLPageContainer>
            <SectionHeading title={t('resources')} description={t('resourcesBody')} />
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
            <div className="gl-grid gl-grid-three">
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
      <GLSection>
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
  const { t } = useGLTranslation(),
    { locale } = useLocale(),
    [text, setText] = useState(initialText),
    [category, setCategory] = useState(categoryId ?? ''),
    [sort, setSort] = useState<'featured' | 'name'>('featured'),
    [page, setPage] = useState(1),
    categories = useCategories(),
    products = useProducts({ text, categoryId: category || undefined, sort, page }),
    router = useRouter();
  const form = useForm<{ text: string }>({
    defaultValues: { text: initialText },
    resolver: zodResolver(searchSchema),
  });
  const resetSearch = form.reset;
  useEffect(() => {
    setText(initialText);
    resetSearch({ text: initialText });
    setPage(1);
  }, [initialText, resetSearch]);
  useEffect(() => {
    setPage(1);
  }, [locale]);
  return (
    <>
      <form
        className="gl-list-toolbar"
        onSubmit={form.handleSubmit((v) => {
          setText(v.text);
          setPage(1);
          if (search) router.setParams({ q: v.text });
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
      {products.data?.total != null && (
        <p className="gl-result-count">{t('results', { count: products.data.total })}</p>
      )}
      {products.isPending ? (
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
          {(products.data.total ?? 0) > 4 && (
            <GLPagination
              page={page}
              total={Math.ceil((products.data.total ?? 0) / 4)}
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
                if (search) router.setParams({ q: '' });
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
        <GLBreadcrumb
          items={[
            { href: '/', label: t('home') },
            { href: '/products', label: t('products') },
            { href: '/categories/' + p.categoryId, label: p.categoryName },
            { href: '/products/' + p.id, label: p.name },
          ]}
        />
        <GLSection className="gl-product-detail">
          <div className="gl-product-columns">
            <GLProductGallery media={p.media} />
            <div className="gl-product-info">
              <span className="gl-overline">{p.categoryName}</span>
              <GLHeading level={1}>{p.name}</GLHeading>
              {p.model && (
                <GLText role="technicalLabel" className="gl-muted">
                  {t('model')} / {p.model}
                </GLText>
              )}
              <p>{p.description}</p>
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
                  <GLSpecificationList attributes={p.attributes.slice(0, 2)} />
                ) : p.attributes.length ? (
                  <GLSpecificationList attributes={p.attributes} />
                ) : (
                  <GLEmptyState title={t('placeholder')} />
                )}
              </div>
            </div>
          </div>
        </GLSection>
        {p.media.some((m) => m.kind === 'video') && (
          <GLSection>
            <SectionHeading title={t('video')} />
            {p.media
              .filter((m) => m.kind === 'video')
              .map((m) => (
                <GLVideo key={m.id} reference={m} />
              ))}
          </GLSection>
        )}
        {p.documents.length > 0 && (
          <GLSection>
            <SectionHeading title={t('documents')} />
            <div className="gl-grid gl-grid-two">
              {p.documents.map((d) => (
                <GLTechnicalDocumentCard key={d.id} document={d} />
              ))}
            </div>
          </GLSection>
        )}
        {related.data && related.data.items.some((r) => r.id !== p.id) && (
          <GLSection>
            <SectionHeading title={t('related')} />
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
              <GLHeading level={1}>{t('aboutTitle')}</GLHeading>
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
