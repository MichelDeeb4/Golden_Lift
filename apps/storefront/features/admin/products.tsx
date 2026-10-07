import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import {
  categorySchema,
  formSchema,
  managedProductSchema,
  namedSchema,
  pageSchema,
  productRowSchema,
} from '@golden-lift/api';
import { useLocale } from '@golden-lift/i18n';
import {
  GLAlert,
  GLButton,
  GLCheckbox,
  GLHeading,
  GLInput,
  GLModal,
  GLSelect,
  GLTable,
  GLPageHeader,
  GLFormSection,
  GLActionBar,
  GLActionMenu,
  GLDrawer,
  GLWorkspace,
  GLWorkspacePanel,
} from '@golden-lift/ui';
import { useStaffApi, useUnsaved } from './context';
import { useAdminTranslation } from './translations';
import {
  ActionFeedback,
  Confirm,
  TableState,
  TranslationFields,
  emptyTranslations,
  jsonResponse,
  translationDefaults,
  translationInput,
  useAction,
  useStaffOptions,
  MoreOptions,
} from './common';
import type { TranslationForm } from './common';
import { CategoryPicker } from './categories';
import { MediaPicker, MediaPreview, PdfDownload } from './media';
import {
  DynamicAttributeField,
  DynamicAttributeFields,
  validateDynamicValue,
} from './dynamic-fields';
import type { AttributeValue } from './dynamic-fields';
export function Products() {
  const api = useStaffApi(),
    { locale } = useLocale(),
    t = useAdminTranslation(),
    router = useRouter(),
    params = useLocalSearchParams<{
      text?: string;
      active?: string;
      productTypeId?: string;
      categoryId?: string;
      cursor?: string;
      sort?: string;
      featured?: string;
    }>(),
    [text, setText] = useState(params.text ?? '');
  const [categoryFilter, setCategoryFilter] = useState(false);
  const search = new URLSearchParams({
    locale,
    limit: '25',
    ...Object.fromEntries(
      Object.entries(params).filter(
        ([key, value]) =>
          ['text', 'active', 'productTypeId', 'categoryId', 'cursor', 'sort', 'featured'].includes(
            key,
          ) &&
          typeof value === 'string' &&
          value.length > 0,
      ),
    ),
  });
  const rows = useQuery({
    queryKey: ['staff', 'products', locale, params],
    queryFn: ({ signal }) =>
      api.request(
        '/admin/products?' + search.toString(),
        pageSchema(productRowSchema),
        undefined,
        'GET',
        signal,
      ),
  });
  const types = useStaffOptions('/admin/product-types', namedSchema);
  return (
    <>
      <GLPageHeader
        title={t('products')}
        description={t('createProductHelp')}
        breadcrumbs={[
          { label: t('dashboard'), href: '/admin' },
          { label: t('products'), href: '/admin/products' },
        ]}
        actions={
          <a className="gl-button gl-button-primary gl-button-md" href="/admin/products/new">
            {t('create')}
          </a>
        }
      />
      <div className="gl-admin-toolbar gl-product-filters">
        <MoreOptions query={types} label={t('types')} />
        <GLInput
          label={t('search')}
          value={text}
          maxLength={120}
          onChange={(e) => setText(e.target.value)}
        />
        <GLButton onClick={() => router.setParams({ text, cursor: '' })}>{t('search')}</GLButton>
        <GLSelect
          label={t('status')}
          value={params.active ?? ''}
          onChange={(active) => router.setParams({ active, cursor: '' })}
          options={[
            { value: '', label: t('all') },
            { value: 'true', label: t('active') },
            { value: 'false', label: t('inactive') },
          ]}
        />
        <GLSelect
          label={t('featured')}
          value={params.featured ?? ''}
          onChange={(featured) => router.setParams({ featured, cursor: '' })}
          options={[
            { value: '', label: t('all') },
            { value: 'true', label: t('featured') },
            { value: 'false', label: t('inactive') },
          ]}
        />
        <GLSelect
          label={t('order')}
          value={params.sort ?? 'id'}
          onChange={(sort) => router.setParams({ sort, cursor: '' })}
          options={[
            { value: 'id', label: t('defaultOrder') },
            { value: 'manual', label: t('order') },
          ]}
        />
        <GLButton variant="secondary" onClick={() => setCategoryFilter(true)}>
          {t('category')}
        </GLButton>
        {params.categoryId && (
          <GLButton
            variant="ghost"
            onClick={() => router.setParams({ categoryId: '', cursor: '' })}
          >
            {t('all')} — {t('categories')}
          </GLButton>
        )}
        <GLSelect
          label={t('type')}
          value={params.productTypeId ?? ''}
          onChange={(productTypeId) => router.setParams({ productTypeId, cursor: '' })}
          options={[
            { value: '', label: t('all') },
            ...types.items.map((type) => ({
              value: type.id,
              label:
                (type.translations.find((x) => x.locale === locale) ?? type.translations[0])
                  ?.name ?? type.code,
            })),
          ]}
        />
        <GLButton
          variant="ghost"
          onClick={() => {
            setText('');
            router.setParams({
              text: '',
              active: '',
              featured: '',
              sort: '',
              productTypeId: '',
              categoryId: '',
              cursor: '',
            });
          }}
        >
          {t('clear')}
        </GLButton>
      </div>
      <TableState
        pending={rows.isPending}
        error={rows.error}
        empty={!rows.data?.items.length}
        emptyTitle={t('emptyProducts')}
        emptyDescription={t('createProductHelp')}
        emptyAction={
          <a href="/admin/products/new" className="gl-button gl-button-primary gl-button-md">
            {t('create')}
          </a>
        }
      >
        <GLTable
          columns={[t('name'), t('catalog'), t('status'), t('updated'), t('actions')]}
          rows={(rows.data?.items ?? []).map((row) => [
            <div className="gl-table-identity" key="identity">
              <CollectionCover assetId={row.coverAssetId} />
              <div>
                <a href={'/admin/products/' + row.id}>{row.name}</a>
                <small>
                  <bdi>{row.modelCode || '—'}</bdi>
                </small>
              </div>
            </div>,
            <div key="catalog">
              <a href={'/admin/categories/' + row.categoryId}>{row.categoryName}</a>
              <small>
                <a href={'/admin/product-types/' + row.productTypeId}>{row.productTypeName}</a>
              </small>
            </div>,
            <div key="status">
              <span className={row.active ? 'gl-status-dot is-active' : 'gl-status-dot'}>
                {row.active ? t('active') : t('inactive')}
              </span>
              {row.featured && <small>{t('featured')}</small>}
              <small>
                {t('order')}: <bdi>{row.sortOrder}</bdi>
              </small>
            </div>,
            <time key="updated" dateTime={row.updatedAt}>
              {new Date(row.updatedAt).toLocaleDateString(locale)}
            </time>,
            <GLActionMenu
              key="actions"
              label={t('actions') + ' — ' + row.name}
              items={[
                { label: t('edit'), href: '/admin/products/' + row.id },
                { label: t('category'), href: '/admin/categories/' + row.categoryId },
                { label: t('type'), href: '/admin/product-types/' + row.productTypeId },
              ]}
            />,
          ])}
        />
      </TableState>
      {rows.data?.nextCursor && (
        <GLButton
          variant="secondary"
          onClick={() => router.setParams({ cursor: rows.data!.nextCursor! })}
        >
          {t('next')}
        </GLButton>
      )}
      {params.cursor && (
        <GLButton variant="secondary" onClick={() => router.setParams({ cursor: '' })}>
          {t('root')}
        </GLButton>
      )}
      <GLDrawer
        open={categoryFilter}
        onClose={() => setCategoryFilter(false)}
        title={t('category')}
      >
        <CategoryPicker
          leaf
          onSelect={(category) => {
            router.setParams({ categoryId: category?.id ?? '', cursor: '' });
            setCategoryFilter(false);
          }}
        />
      </GLDrawer>
    </>
  );
}
type Managed = z.infer<typeof managedProductSchema>;
function CollectionCover({ assetId }: { assetId: string }) {
  return (
    <div className="gl-collection-cover">
      <MediaPreview asset={{ id: assetId, kind: 'IMAGE' }} />
    </div>
  );
}
function ProductTypeChange({
  product,
  onSaved,
  beforeOpen,
}: {
  product: Managed;
  onSaved: () => Promise<unknown>;
  beforeOpen: () => boolean;
}) {
  const api = useStaffApi(),
    { locale } = useLocale(),
    t = useAdminTranslation(),
    action = useAction(),
    [open, setOpen] = useState(false),
    [typeId, setTypeId] = useState(''),
    [values, setValues] = useState<Record<string, AttributeValue>>({}),
    [reviewed, setReviewed] = useState<{
      payload: unknown;
      precondition: string;
      blockers: string[];
      incompatibleDefinitionIds: string[];
      requiredMissingDefinitionIds: string[];
    } | null>(null);
  const types = useStaffOptions('/admin/product-types', namedSchema);
  const schema = useQuery({
    queryKey: ['staff', 'type-change-schema', typeId, locale],
    queryFn: ({ signal }) =>
      api.request(
        `/admin/product-types/${typeId}/schema?locale=${locale}`,
        z.object({ form: formSchema }),
        undefined,
        'GET',
        signal,
      ),
    enabled: open && !!typeId,
  });
  const payload = {
    productTypeId: typeId,
    expectedVersion: product.version,
    expectedSchemaRevision: product.schemaRevision,
    expectedDestinationSchemaRevision: schema.data?.form.schemaRevision,
    values: [
      ...product.values
        .filter(
          (v) => !schema.data?.form.fields.some((field) => field.definitionId === v.definitionId),
        )
        .map((v) => ({ definitionId: v.definitionId, value: null })),
      ...Object.entries(values).map(([definitionId, value]) => ({ definitionId, value })),
    ],
  };
  return (
    <>
      <GLButton
        variant="secondary"
        onClick={() => {
          if (beforeOpen()) setOpen(true);
        }}
      >
        {t('typeChange')}
      </GLButton>
      <GLModal open={open} onClose={() => setOpen(false)} title={t('typeChange')}>
        <MoreOptions query={types} label={t('types')} />
        <GLSelect
          label={t('type')}
          value={typeId}
          onChange={(id) => {
            setTypeId(id);
            setReviewed(null);
            setValues(Object.fromEntries(product.values.map((v) => [v.definitionId, v.value])));
          }}
          options={[
            { value: '', label: t('choose') },
            ...types.items
              .filter((type) => !type.deprecated && type.id !== product.productTypeId)
              .map((type) => ({ value: type.id, label: type.code })),
          ]}
        />
        {schema.data?.form.fields.map((field) => (
          <DynamicAttributeField
            key={field.definitionId}
            field={field}
            value={values[field.definitionId]}
            onChange={(value) => {
              setReviewed(null);
              setValues((old) => {
                const next = { ...old };
                if (value) next[field.definitionId] = value;
                else delete next[field.definitionId];
                return next;
              });
            }}
          />
        ))}
        <ActionFeedback action={action} />
        {reviewed && (
          <GLAlert>
            {t('impact')}: {reviewed.blockers.length ? t('error') : t('confirmAction')}
          </GLAlert>
        )}
        {reviewed && (
          <>
            <p>
              {t('detach')}: {reviewed.incompatibleDefinitionIds.join(', ') || '—'}
            </p>
            <p>
              {t('required')}:{' '}
              {reviewed.requiredMissingDefinitionIds
                .map(
                  (id) =>
                    schema.data?.form.fields.find((field) => field.definitionId === id)?.label ??
                    id,
                )
                .join(', ') || '—'}
            </p>
          </>
        )}
        <GLButton
          disabled={!schema.data}
          loading={action.isPending}
          onClick={() =>
            action.mutate(
              () =>
                api.request(
                  `/admin/products/${product.id}/type-change/preview`,
                  z.object({
                    precondition: z.string(),
                    blockers: z.array(z.string()),
                    incompatibleDefinitionIds: z.array(z.string()),
                    requiredMissingDefinitionIds: z.array(z.string()),
                  }),
                  {
                    ...payload,
                    values: payload.values.filter(
                      (v) =>
                        v.value === null ||
                        schema.data!.form.fields.some(
                          (field) => field.definitionId === v.definitionId,
                        ),
                    ),
                  },
                  'POST',
                ),
              {
                onSuccess: (result) => {
                  action.setSaved(false);
                  const impact = result as {
                    precondition: string;
                    blockers: string[];
                    incompatibleDefinitionIds: string[];
                    requiredMissingDefinitionIds: string[];
                  };
                  setReviewed({
                    payload: {
                      ...payload,
                      values: payload.values.filter(
                        (v) =>
                          v.value === null ||
                          schema.data!.form.fields.some(
                            (field) => field.definitionId === v.definitionId,
                          ),
                      ),
                    },
                    ...impact,
                  });
                },
              },
            )
          }
        >
          {t('impact')}
        </GLButton>
        {reviewed && (
          <GLButton
            disabled={!!reviewed.blockers.length}
            loading={action.isPending}
            onClick={() =>
              action.mutate(
                () =>
                  api
                    .request(
                      `/admin/products/${product.id}/type-change`,
                      jsonResponse,
                      {
                        ...(reviewed.payload as Record<string, unknown>),
                        precondition: reviewed.precondition,
                        confirm: true,
                      },
                      'POST',
                    )
                    .then(onSaved),
                { onSuccess: () => setOpen(false) },
              )
            }
          >
            {t('apply')}
          </GLButton>
        )}
      </GLModal>
    </>
  );
}
export function ProductEditor({ id }: { id?: string }) {
  const api = useStaffApi(),
    { locale } = useLocale(),
    t = useAdminTranslation(),
    router = useRouter(),
    action = useAction(),
    [section, setSection] = useState('overview'),
    [draggedMedia, setDraggedMedia] = useState<string | null>(null),
    [loaded, setLoaded] = useState<Managed | null>(null),
    [typeId, setTypeId] = useState(''),
    [category, setCategory] = useState<z.infer<typeof categorySchema> | null>(null),
    [model, setModel] = useState(''),
    [cover, setCover] = useState(''),
    [values, setValues] = useState<Record<string, AttributeValue>>({}),
    [errors, setErrors] = useState<string[]>([]),
    [categoryOpen, setCategoryOpen] = useState(false),
    [mediaOpen, setMediaOpen] = useState(false),
    [coverPicking, setCoverPicking] = useState(false),
    [pickKind, setPickKind] = useState<'IMAGE' | 'VIDEO' | 'PDF' | undefined>(undefined),
    [media, setMedia] = useState<Managed['media']>([]),
    [publication, setPublication] = useState({
      active: false,
      featured: false,
      sortOrder: '1024',
      featuredOrder: '1024',
    });
  const form = useForm<TranslationForm>({ defaultValues: structuredClone(emptyTranslations) });
  const identityDirty = loaded
    ? model !== (loaded.modelCode ?? '')
    : Boolean(model || typeId || category);
  const specificationsDirty = loaded
    ? JSON.stringify(values) !==
      JSON.stringify(
        Object.fromEntries(loaded.values.map((value) => [value.definitionId, value.value])),
      )
    : Object.keys(values).length > 0;
  const mediaDirty = loaded
    ? cover !== loaded.coverAssetId || JSON.stringify(media) !== JSON.stringify(loaded.media)
    : Boolean(cover || media.length);
  const visibilityDirty = loaded
    ? JSON.stringify(publication) !==
      JSON.stringify({
        active: loaded.active,
        featured: loaded.featured,
        sortOrder: loaded.sortOrder,
        featuredOrder: loaded.featuredOrder,
      })
    : false;
  const dirty = identityDirty || specificationsDirty || mediaDirty || visibilityDirty;
  useUnsaved(form.formState.isDirty || dirty);
  const detail = useQuery({
    queryKey: ['staff', 'product', id],
    queryFn: ({ signal }) =>
      api.request(
        `/admin/products/${id}/management`,
        managedProductSchema,
        undefined,
        'GET',
        signal,
      ),
    enabled: !!id,
  });
  const types = useStaffOptions('/admin/product-types', namedSchema);
  const schema = useQuery({
    queryKey: ['staff', 'product-form', typeId, locale],
    queryFn: ({ signal }) =>
      api.request(
        `/admin/product-types/${typeId}/schema?locale=${locale}`,
        z.object({ form: formSchema }),
        undefined,
        'GET',
        signal,
      ),
    enabled: !!typeId,
  });
  const currentCategory = useQuery({
    queryKey: ['staff', 'product-category-context', loaded?.categoryId, locale],
    queryFn: ({ signal }) =>
      api.request(
        `/admin/categories/${loaded!.categoryId}?locale=${locale}`,
        categorySchema,
        undefined,
        'GET',
        signal,
      ),
    enabled: !!id && !!loaded,
  });
  function load(product: Managed) {
    setLoaded(product);
    setTypeId(product.productTypeId);
    setModel(product.modelCode ?? '');
    setCover(product.coverAssetId);
    setValues(Object.fromEntries(product.values.map((v) => [v.definitionId, v.value])));
    setMedia(product.media);
    setPublication({
      active: product.active,
      featured: product.featured,
      sortOrder: product.sortOrder,
      featuredOrder: product.featuredOrder,
    });
    form.reset(translationDefaults(product.translations));
  }
  useEffect(() => {
    if (detail.data && !loaded) load(detail.data);
  }, [detail.data, loaded]);
  async function refresh() {
    const product = await api.request(`/admin/products/${id}/management`, managedProductSchema);
    load(product);
    return product;
  }
  function acceptSection(product: Managed, section: 'media' | 'publication') {
    setLoaded(product);
    if (section === 'media') {
      setMedia(product.media);
      setCover(product.coverAssetId);
    } else
      setPublication({
        active: product.active,
        featured: product.featured,
        sortOrder: product.sortOrder,
        featuredOrder: product.featuredOrder,
      });
    // Keep other sections' edits in memory. A subsequent save uses this new row version.
  }
  async function basics(v: TranslationForm) {
    if (!v.names.ar.trim()) {
      setSection('content');
      form.setError('names.ar', { message: t('required') });
      throw new Error('invalid');
    }
    if (!schema.data || (!id && !category) || !cover) {
      setSection(!cover ? 'media' : 'overview');
      throw new Error('invalid');
    }
    const invalid = schema.data.form.fields
      .filter((field) => !validateDynamicValue(field, values[field.definitionId]))
      .map((field) => field.definitionId);
    setErrors(invalid);
    if (invalid.length) {
      setSection('specifications');
      throw new Error('invalid');
    }
    const payload = {
      translations: translationInput(v),
      coverAssetId: cover,
      modelCode: model.trim() || null,
      values: [
        ...Object.entries(values).map(([definitionId, value]) => ({ definitionId, value })),
        ...(id
          ? loaded!.values
              .filter((value) => !values[value.definitionId])
              .map((value) => ({ definitionId: value.definitionId, value: null }))
          : []),
      ],
      expectedSchemaRevision: id ? loaded!.schemaRevision : schema.data.form.schemaRevision,
    };
    const result = await api.request(
      id ? `/admin/products/${id}` : '/admin/products',
      z.object({ id: z.string().uuid() }),
      id
        ? { ...payload, expectedVersion: loaded!.version }
        : {
            ...payload,
            categoryId: category!.id,
            productTypeId: typeId,
            expectedCategoryVersion: category!.version,
            active: false,
          },
      id ? 'PATCH' : 'POST',
    );
    form.reset(v);

    if (!id)
      router.replace({ pathname: '/admin/[...path]', params: { path: ['products', result.id] } });
    else {
      const product = await api.request(`/admin/products/${id}/management`, managedProductSchema);
      setLoaded(product);
      setValues(
        Object.fromEntries(product.values.map((value) => [value.definitionId, value.value])),
      );
    }
    return result;
  }
  function shift(index: number, step: number) {
    const next = [...media],
      target = index + step;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setMedia(next);
  }
  if (id && (detail.isPending || detail.error))
    return (
      <TableState pending={detail.isPending} error={detail.error} empty={false}>
        {null}
      </TableState>
    );
  return (
    <>
      <GLPageHeader
        title={(id ? t('edit') : t('create')) + ' — ' + t('products')}
        breadcrumbs={[
          { label: t('products'), href: '/admin/products' },
          {
            label: id ? t('edit') : t('create'),
            href: id ? '/admin/products/' + id : '/admin/products/new',
          },
        ]}
        context={
          <span>
            {loaded ? (loaded.active ? t('active') : t('inactive')) : t('inactive')}{' '}
            {loaded && ' · ' + t('version') + ' ' + loaded.version}
          </span>
        }
      />
      <ActionFeedback
        action={action}
        reload={() => {
          if (!(dirty || form.formState.isDirty) || window.confirm(t('unsaved')))
            void refresh().then(() => schema.refetch());
        }}
      />
      {detail.isPending && id ? (
        <TableState pending error={null} empty={false}>
          {null}
        </TableState>
      ) : (
        <GLWorkspace
          active={section}
          onChange={setSection}
          label={t('sections')}
          inspectorLabel={t('summary')}
          sections={[
            {
              id: 'overview',
              label: t('overview'),
              status:
                !typeId || (!category && !loaded)
                  ? t('required')
                  : identityDirty
                    ? t('dirty')
                    : undefined,
            },
            {
              id: 'content',
              label: t('translations'),
              status: form.formState.isDirty ? t('dirty') : undefined,
            },
            {
              id: 'specifications',
              label: t('specifications'),
              status: specificationsDirty
                ? t('dirty')
                : String(schema.data?.form.fields.length ?? 0),
            },
            {
              id: 'media',
              label: t('media'),
              status: mediaDirty ? t('dirty') : String(media.length),
            },
            {
              id: 'visibility',
              label: t('visibility'),
              status: visibilityDirty
                ? t('dirty')
                : publication.active
                  ? t('active')
                  : t('inactive'),
            },
          ]}
          inspector={
            <>
              <span className="gl-overline">{t('summary')}</span>
              {cover && <MediaPreview asset={{ id: cover, kind: 'IMAGE' }} profile="card" />}
              <h2 className="gl-inspector-name">
                {form.watch('names')[locale] || form.watch('names').ar || t('products')}
              </h2>
              <bdi className="gl-inspector-model">{model || '—'}</bdi>
              <dl className="gl-inspector-facts">
                <div>
                  <dt>{t('category')}</dt>
                  <dd>{category?.name ?? currentCategory.data?.name ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('type')}</dt>
                  <dd>
                    {types.items
                      .find((x) => x.id === typeId)
                      ?.translations.find((x) => x.locale === locale)?.name ??
                      types.items.find((x) => x.id === typeId)?.code ??
                      '—'}
                  </dd>
                </div>
                <div>
                  <dt>{t('status')}</dt>
                  <dd>{publication.active ? t('active') : t('inactive')}</dd>
                </div>
                <div>
                  <dt>{t('specifications')}</dt>
                  <dd>
                    {schema.data?.form.fields.filter((f) =>
                      validateDynamicValue(f, values[f.definitionId]),
                    ).length ?? 0}{' '}
                    / {schema.data?.form.fields.length ?? 0}
                  </dd>
                </div>
                <div>
                  <dt>{t('media')}</dt>
                  <dd>{media.length}</dd>
                </div>
                {loaded && (
                  <div>
                    <dt>{t('version')}</dt>
                    <dd>{loaded.version}</dd>
                  </div>
                )}
              </dl>
              <p className="gl-muted">{t('sectionSaveHelp')}</p>
            </>
          }
        >
          <form
            className="gl-editor-form"
            noValidate
            onSubmit={form.handleSubmit(
              (v) => action.mutate(() => basics(v)),
              () => setSection('content'),
            )}
          >
            <GLWorkspacePanel id="overview">
              <GLFormSection title={t('identity')} description={t('productIdentityHelp')}>
                <MoreOptions query={types} label={t('types')} />
                <div className="gl-admin-grid">
                  {' '}
                  <GLSelect
                    label={t('type')}
                    value={typeId}
                    disabled={!!id}
                    onChange={(value) => {
                      setTypeId(value);
                      setValues({});
                    }}
                    options={[
                      { value: '', label: t('choose') },
                      ...types.items
                        .filter((type) => !type.deprecated || type.id === typeId)
                        .map((type) => ({
                          value: type.id,
                          label:
                            (
                              type.translations.find((x) => x.locale === locale) ??
                              type.translations[0]
                            )?.name ?? type.code,
                        })),
                    ]}
                  />
                  <GLButton variant="secondary" onClick={() => setCategoryOpen(true)}>
                    {t('selectCategory')}: {category?.name ?? currentCategory.data?.name ?? ''}
                  </GLButton>
                  <GLInput
                    label={t('code')}
                    value={model}
                    maxLength={128}
                    onChange={(e) => {
                      setModel(e.target.value);
                    }}
                  />
                </div>
                {id && loaded && (
                  <ProductTypeChange
                    product={loaded}
                    onSaved={refresh}
                    beforeOpen={() =>
                      !(dirty || form.formState.isDirty) || window.confirm(t('unsaved'))
                    }
                  />
                )}
              </GLFormSection>
            </GLWorkspacePanel>
            <GLWorkspacePanel id="content">
              <TranslationFields form={form} />
            </GLWorkspacePanel>
            <GLWorkspacePanel id="specifications">
              <GLFormSection title={t('specifications')} description={t('specificationHelp')}>
                {schema.data && (
                  <DynamicAttributeFields
                    schema={schema.data.form}
                    values={values}
                    errors={errors}
                    onChange={(id, value) => {
                      setValues((previous) => {
                        const next = { ...previous };
                        if (value) next[id] = value;
                        else delete next[id];
                        return next;
                      });
                    }}
                  />
                )}
              </GLFormSection>
            </GLWorkspacePanel>
            {!id && (
              <GLWorkspacePanel id="media">
                <GLFormSection title={t('media')}>
                  <div className="gl-cover-editor">
                    {cover && (
                      <MediaPreview asset={{ id: cover, kind: 'IMAGE' }} profile="detail" />
                    )}
                    <div>
                      <GLButton
                        variant="secondary"
                        onClick={() => {
                          setCoverPicking(true);
                          setPickKind('IMAGE');
                          setMediaOpen(true);
                        }}
                      >
                        {t('cover')}
                      </GLButton>
                      {!cover && <GLAlert>{t('coverRequired')}</GLAlert>}
                      <p className="gl-muted">{t('coverHelp')}</p>
                    </div>
                  </div>
                </GLFormSection>
              </GLWorkspacePanel>
            )}
            {!id && (
              <GLWorkspacePanel id="visibility">
                <GLFormSection title={t('publication')}>
                  <p>{t('draftHelp')}</p>
                </GLFormSection>
              </GLWorkspacePanel>
            )}
            {(!id || ['overview', 'content', 'specifications'].includes(section)) && (
              <GLActionBar>
                <a href="/admin/products" className="gl-button gl-button-ghost gl-button-md">
                  {t('cancel')}
                </a>
                <span className="gl-dirty-status">
                  {form.formState.isDirty ||
                  identityDirty ||
                  specificationsDirty ||
                  (!id && mediaDirty)
                    ? t('dirty')
                    : t('saved')}
                </span>{' '}
                <GLButton type="submit" loading={action.isPending} disabled={!typeId || !cover}>
                  {t('save')}
                </GLButton>
              </GLActionBar>
            )}
          </form>
          {id && loaded && (
            <>
              <GLWorkspacePanel id="media">
                <GLFormSection title={t('media')} description={t('mediaHelp')}>
                  <div className="gl-cover-editor">
                    {cover && <MediaPreview asset={{ id: cover, kind: 'IMAGE' }} />}
                    <div>
                      <GLButton
                        variant="secondary"
                        onClick={() => {
                          setCoverPicking(true);
                          setPickKind('IMAGE');
                          setMediaOpen(true);
                        }}
                      >
                        {t('cover')}
                      </GLButton>
                      {!cover && <GLAlert>{t('coverRequired')}</GLAlert>}
                      <p className="gl-muted">{t('coverHelp')}</p>
                    </div>
                  </div>
                  <GLButton
                    variant="secondary"
                    onClick={() => {
                      setCoverPicking(false);
                      setPickKind(undefined);
                      setMediaOpen(true);
                    }}
                  >
                    {t('select')}
                  </GLButton>
                  {(['IMAGE', 'VIDEO', 'PDF'] as const).map((kind) => (
                    <div key={kind} className="gl-media-group">
                      <div className="gl-media-group-heading">
                        <GLHeading level={3} role="heading6">
                          {t(
                            kind === 'IMAGE'
                              ? 'gallery'
                              : kind === 'VIDEO'
                                ? 'videos'
                                : 'documents',
                          )}
                        </GLHeading>
                        <GLButton
                          variant="text"
                          onClick={() => {
                            setCoverPicking(false);
                            setPickKind(kind);
                            setMediaOpen(true);
                          }}
                        >
                          {t('addMedia')}
                        </GLButton>
                      </div>
                      <div className={kind === 'PDF' ? 'gl-document-rows' : 'gl-media-tiles'}>
                        {media
                          .map((item, index) => ({ item, index }))
                          .filter(({ item }) => item.kind === kind)
                          .map(({ item, index }) => (
                            <div
                              className="gl-admin-toolbar gl-media-tile"
                              key={item.assetId}
                              draggable={kind === 'IMAGE'}
                              onDragStart={() => setDraggedMedia(item.assetId)}
                              onDragEnd={() => setDraggedMedia(null)}
                              onDragOver={(event) => {
                                if (draggedMedia) event.preventDefault();
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                if (!draggedMedia || draggedMedia === item.assetId) return;
                                const next = [...media],
                                  from = next.findIndex((m) => m.assetId === draggedMedia),
                                  to = next.findIndex((m) => m.assetId === item.assetId);
                                if (from < 0 || to < 0) return;
                                const [moved] = next.splice(from, 1);
                                next.splice(to, 0, moved!);
                                setMedia(next);
                                setDraggedMedia(null);
                              }}
                            >
                              <MediaPreview asset={{ id: item.assetId, kind: item.kind }} />
                              {item.kind === 'VIDEO' && (
                                <MediaPreview
                                  asset={{ id: item.assetId, kind: 'VIDEO' }}
                                  profile="playback"
                                />
                              )}
                              {item.kind === 'PDF' && <PdfDownload assetId={item.assetId} />}
                              <details>
                                <summary>{t('translations')}</summary>
                                {(['ar', 'en', 'ckb'] as const).map((language) => (
                                  <div key={language} dir={language === 'en' ? 'ltr' : 'rtl'}>
                                    {(['title', 'altText', 'caption'] as const).map((field) => (
                                      <GLInput
                                        key={field}
                                        label={`${t(field === 'title' ? 'mediaTitle' : field)} (${language})`}
                                        value={
                                          item.translations.find((x) => x.locale === language)?.[
                                            field
                                          ] ?? ''
                                        }
                                        onChange={(e) => {
                                          setMedia(
                                            media.map((m) => {
                                              if (m.assetId !== item.assetId) return m;
                                              const prior = m.translations.find(
                                                (x) => x.locale === language,
                                              ) ?? {
                                                locale: language,
                                                title: null,
                                                altText: null,
                                                caption: null,
                                              };
                                              return {
                                                ...m,
                                                translations: [
                                                  ...m.translations.filter(
                                                    (x) => x.locale !== language,
                                                  ),
                                                  { ...prior, [field]: e.target.value || null },
                                                ],
                                              };
                                            }),
                                          );
                                        }}
                                      />
                                    ))}
                                  </div>
                                ))}
                              </details>
                              <span className="gl-media-caption">
                                {item.translations.find((x) => x.locale === locale)?.title ??
                                  t(
                                    item.kind === 'IMAGE'
                                      ? 'gallery'
                                      : item.kind === 'VIDEO'
                                        ? 'videos'
                                        : 'documents',
                                  )}
                                <small>
                                  <bdi>{item.assetId}</bdi>
                                </small>
                              </span>
                              <GLActionMenu
                                label={t('actions')}
                                items={[
                                  {
                                    label: t('up'),
                                    disabled: index === 0,
                                    onSelect: () => shift(index, -1),
                                  },
                                  {
                                    label: t('down'),
                                    disabled: index === media.length - 1,
                                    onSelect: () => shift(index, 1),
                                  },
                                  {
                                    label: t('cover'),
                                    disabled: item.kind !== 'IMAGE',
                                    onSelect: () => setCover(item.assetId),
                                  },
                                  {
                                    label: t('detach'),
                                    disabled: item.assetId === cover,
                                    destructive: true,
                                    onSelect: () =>
                                      setMedia(media.filter((m) => m.assetId !== item.assetId)),
                                  },
                                ]}
                              />
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                  <GLActionBar>
                    <span className="gl-dirty-status">
                      {JSON.stringify(media) !== JSON.stringify(loaded.media) ||
                      cover !== loaded.coverAssetId
                        ? t('dirty')
                        : t('saved')}
                    </span>
                    <GLButton
                      loading={action.isPending}
                      onClick={() =>
                        action.mutate(() =>
                          api
                            .request(
                              `/admin/products/${id}/media`,
                              managedProductSchema,
                              {
                                expectedVersion: loaded.version,
                                coverAssetId: cover,
                                media: media.map(({ id, assetId, kind, translations }) => ({
                                  id,
                                  assetId,
                                  kind,
                                  translations,
                                })),
                              },
                              'POST',
                            )
                            .then((product) => acceptSection(product, 'media')),
                        )
                      }
                    >
                      {t('save')} — {t('media')}
                    </GLButton>
                  </GLActionBar>
                </GLFormSection>
              </GLWorkspacePanel>
              <GLWorkspacePanel id="visibility">
                <GLFormSection title={t('publication')}>
                  <div className="gl-admin-grid">
                    <GLCheckbox
                      label={t('active')}
                      checked={publication.active}
                      onChange={(e) => {
                        setPublication({ ...publication, active: e.target.checked });
                      }}
                    />
                    <GLCheckbox
                      label={t('featured')}
                      checked={publication.featured}
                      onChange={(e) => {
                        setPublication({ ...publication, featured: e.target.checked });
                      }}
                    />
                    <GLInput
                      label={t('order')}
                      value={publication.sortOrder}
                      onChange={(e) => {
                        setPublication({ ...publication, sortOrder: e.target.value });
                      }}
                    />
                    <GLInput
                      label={t('featuredOrder')}
                      value={publication.featuredOrder}
                      onChange={(e) => {
                        setPublication({ ...publication, featuredOrder: e.target.value });
                      }}
                    />
                  </div>
                  <div className="gl-product-danger">
                    {' '}
                    <Confirm
                      title={t('remove')}
                      work={() =>
                        api
                          .request(
                            `/admin/products/${id}`,
                            z.undefined(),
                            { expectedVersion: loaded.version, confirmed: true },
                            'DELETE',
                          )
                          .then(() => {
                            router.replace('/admin/products');
                          })
                      }
                    >
                      {t('confirmDelete')}
                    </Confirm>
                  </div>
                  <GLActionBar>
                    <span>
                      {visibilityDirty ? t('dirty') : t('saved')} ? {t('sectionSaveHelp')}
                    </span>
                    <GLButton
                      loading={action.isPending}
                      onClick={() =>
                        action.mutate(() =>
                          api
                            .request(
                              `/admin/products/${id}/publication`,
                              managedProductSchema,
                              { ...publication, expectedVersion: loaded.version },
                              'POST',
                            )
                            .then((product) => acceptSection(product, 'publication')),
                        )
                      }
                    >
                      {t('save')} — {t('publication')}
                    </GLButton>
                  </GLActionBar>
                </GLFormSection>
              </GLWorkspacePanel>
            </>
          )}
        </GLWorkspace>
      )}
      <GLModal open={categoryOpen} onClose={() => setCategoryOpen(false)} title={t('category')}>
        <CategoryPicker
          leaf
          onSelect={(selected) => {
            if (!selected) return;
            if (id && loaded) {
              if ((dirty || form.formState.isDirty) && !window.confirm(t('unsaved'))) return;
              action.mutate(() =>
                api
                  .request(
                    `/admin/products/${id}/placement`,
                    jsonResponse,
                    {
                      categoryId: selected.id,
                      expectedVersion: loaded.version,
                      expectedSchemaRevision: loaded.schemaRevision,
                      expectedCategoryVersion: selected.version,
                    },
                    'POST',
                  )
                  .then(refresh),
              );
            } else {
              setCategory(selected);
            }
            setCategoryOpen(false);
          }}
        />
      </GLModal>
      <MediaPicker
        allowedKind={!id || coverPicking ? 'IMAGE' : pickKind}
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onSelect={(asset) => {
          if (!id && asset.kind !== 'IMAGE') return;
          if (!id || coverPicking) setCover(asset.id);
          if (id && !media.some((m) => m.assetId === asset.id))
            setMedia([
              ...media,
              {
                id: crypto.randomUUID(),
                assetId: asset.id,
                kind: asset.kind,
                sortOrder: String((media.length + 1) * 1024),
                blocked: false,
                translations: [],
              },
            ]);
        }}
      />
    </>
  );
}
