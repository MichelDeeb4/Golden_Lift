import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { categoryPageSchema, categorySchema, categoryFormSchema } from '@golden-lift/api';
import { useLocale } from '@golden-lift/i18n';
import {
  GLAlert,
  GLButton,
  GLHeading,
  GLModal,
  GLDrawer,
  GLFormSection,
  GLActionBar,
  GLActionMenu,
  GLPageHeader,
  GLInput,
} from '@golden-lift/ui';
import { StaffError, useStaffApi, useUnsaved } from './context';
import { useAdminTranslation } from './translations';
import {
  FocusedEditor,
  ActionFeedback,
  emptyTranslations,
  jsonResponse,
  translationDefaults,
  translationInput,
  TranslationFields,
  useAction,
} from './common';
import type { TranslationForm } from './common';
import { MediaPicker, MediaPreview } from './media';
import { CategoryTree, categoryBranchKey } from './category-tree';
import type { TreeCategory } from './category-tree';
import { useCategoryTreeState } from './category-tree-state';
import './category-tree.css';

type Category = z.infer<typeof categorySchema>;
const categoryResult = categorySchema.omit({
  translations: true,
  coverAssetId: true,
  activeChildCount: true,
  activeProductCount: true,
  canAddProducts: true,
  canAddChildren: true,
});
const breadcrumbPage = z.object({
  items: z.array(categoryResult),
  nextCursor: z.string().nullable(),
  pathRevision: z.string(),
});
export function Categories({ id }: { id?: string }) {
  const router = useRouter(),
    api = useStaffApi(),
    query = useQueryClient(),
    { locale } = useLocale(),
    t = useAdminTranslation();
  const action = useAction('categories');
  const [reloadError, setReloadError] = useState<unknown>(null);
  const { expanded, setExpanded } = useCategoryTreeState();
  const [browse, setBrowse] = useState(false);
  const [editor, setEditor] = useState<{
    kind: 'create' | 'edit';
    category: Category | null;
  } | null>(null);
  const [blocked, setBlocked] = useState<Category | null>(null),
    [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [moveTarget, setMoveTarget] = useState<Category | null>(null),
    [destination, setDestination] = useState<string | null>(null);
  const [destinationTrail, setDestinationTrail] = useState<{ id: string; name: string }[]>([]),
    [destinationCursor, setDestinationCursor] = useState(''),
    [destinationSearch, setDestinationSearch] = useState('');
  const [cover, setCover] = useState<string | null>(null),
    [coverOpen, setCoverOpen] = useState(false);
  const form = useForm<TranslationForm>({ defaultValues: structuredClone(emptyTranslations) });
  const dirty =
    !!editor &&
    (form.formState.isDirty ||
      cover !== (editor.kind === 'edit' ? (editor.category?.coverAssetId ?? null) : null));
  useUnsaved(dirty);
  const detail = useQuery({
    queryKey: ['staff', 'category', id, locale],
    enabled: !!id,
    queryFn: ({ signal }) =>
      api.request(
        `/admin/categories/${id}?locale=${locale}`,
        categorySchema,
        undefined,
        'GET',
        signal,
      ),
  });
  const schema = useQuery({
    queryKey: ['staff', 'category-schema', id, locale],
    enabled: !!id && detail.data?.canAddProducts === true,
    queryFn: ({ signal }) =>
      api.request(
        `/admin/categories/${id}/schema?locale=${locale}`,
        z.object({ form: categoryFormSchema }),
        undefined,
        'GET',
        signal,
      ),
  });
  const path = useInfiniteQuery({
    queryKey: ['staff', 'breadcrumbs', id, locale],
    enabled: !!id,
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      api.request(
        `/admin/categories/${id}/breadcrumbs?locale=${locale}${pageParam ? '&cursor=' + encodeURIComponent(pageParam) : ''}`,
        breadcrumbPage,
        undefined,
        'GET',
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const ancestors = path.data?.pages.flatMap((page) => page.items) ?? [];
  const movePath = useInfiniteQuery({
    queryKey: ['staff', 'breadcrumbs', moveTarget?.id, locale],
    enabled: !!moveTarget,
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      api.request(
        `/admin/categories/${moveTarget!.id}/breadcrumbs?locale=${locale}${pageParam ? '&cursor=' + encodeURIComponent(pageParam) : ''}`,
        breadcrumbPage,
        undefined,
        'GET',
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  useEffect(() => {
    if (path.data)
      setExpanded(
        (previous) =>
          new Set([
            ...previous,
            ...path.data.pages
              .flatMap((page) => page.items)
              .filter((category) => category.id !== id)
              .map((category) => category.id),
          ]),
      );
  }, [id, path.data]);
  const preview = useQuery({
    queryKey: ['staff', 'category-delete-preview', deleteTarget?.id],
    enabled: !!deleteTarget,
    queryFn: ({ signal }) =>
      api.request(
        `/admin/categories/${deleteTarget!.id}/deletion-preview`,
        z.object({
          previewPrecondition: z.string(),
          category: categorySchema,
          impact: z.record(z.string()),
        }),
        undefined,
        'GET',
        signal,
      ),
  });
  const source = useQuery({
    queryKey: ['staff', 'category-source', moveTarget?.parentId, locale],
    enabled: !!moveTarget,
    queryFn: ({ signal }) =>
      api.request(
        `/admin/categories?locale=${locale}&limit=100${moveTarget?.parentId ? '&parentId=' + moveTarget.parentId : ''}`,
        categoryPageSchema,
        undefined,
        'GET',
        signal,
      ),
  });
  const destinations = useQuery({
    queryKey: [
      'staff',
      'move-destinations',
      moveTarget?.id,
      destination,
      locale,
      destinationCursor,
    ],
    enabled: !!moveTarget,
    queryFn: ({ signal }) =>
      api.request(
        `/admin/categories/${moveTarget!.id}/move-destinations?locale=${locale}&limit=100${destination ? '&parentId=' + destination : ''}${destinationCursor ? '&cursor=' + encodeURIComponent(destinationCursor) : ''}`,
        categoryPageSchema.extend({
          rootDestination: z.object({ parentId: z.null(), listRevision: z.string() }),
        }),
        undefined,
        'GET',
        signal,
      ),
  });
  function select(categoryId?: string) {
    setBrowse(false);
    router.push({
      pathname: '/admin/[...path]',
      params: { path: categoryId ? ['categories', categoryId] : ['categories'] },
    });
  }
  function create(parent: Category | null) {
    action.reset();
    setReloadError(null);
    if (parent && !parent.canAddChildren) {
      setBlocked(parent);
      return;
    }
    form.reset(structuredClone(emptyTranslations));
    setCover(null);
    setEditor({ kind: 'create', category: parent });
  }
  function edit(category: Category) {
    action.reset();
    setReloadError(null);
    form.reset(translationDefaults(category.translations));
    setCover(category.coverAssetId);
    setEditor({ kind: 'edit', category });
  }
  function move(category: Category) {
    action.reset();
    setReloadError(null);
    setMoveTarget(category);
    setDestination(null);
    setDestinationTrail([]);
    setDestinationCursor('');
    setDestinationSearch('');
  }
  function rowAction(category: TreeCategory, operation: 'child' | 'edit' | 'move' | 'delete') {
    // Rows carry versions and complete translations, so dialog targets do not depend on route timing.
    if (operation === 'child') create(category);
    else if (operation === 'edit') edit(category);
    else if (operation === 'move') move(category);
    else {
      action.reset();
      setDeleteTarget(category);
    }
  }
  function reorder(
    parent: string | null,
    items: TreeCategory[],
    revision: string,
    index: number,
    step: number,
  ) {
    const ordered = items.map((category) => category.id),
      target = index + step;
    if (target < 0 || target >= ordered.length || ordered.length > 500) return;
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    // No optimistic tree reorder: wait for the versioned owning-service transaction.
    action.mutate(() =>
      api.request(
        '/admin/categories/reorder',
        jsonResponse,
        { parentId: parent, orderedIds: ordered, expectedListRevision: revision },
        'POST',
      ),
    );
  }
  const tree = (
    <CategoryTree
      selected={id}
      expanded={expanded}
      onExpanded={setExpanded}
      onSelect={(category) => select(category.id)}
      onAction={rowAction}
      onReorder={reorder}
      pending={action.isPending}
    />
  );
  const leaf = detail.data && detail.data.activeChildCount === '0';
  return (
    <>
      <GLPageHeader
        title={t('categories')}
        description={t('categoryTreeHelp')}
        actions={<GLButton onClick={() => create(null)}>{t('createRootCategory')}</GLButton>}
      />
      <GLButton variant="secondary" className="gl-category-browse" onClick={() => setBrowse(true)}>
        {t('browseCategories')}
      </GLButton>
      <ActionFeedback
        action={action}
        reload={() => {
          void query.invalidateQueries({ queryKey: ['staff', 'categories'] });
          void detail.refetch();
        }}
      />
      <div className="gl-category-tree-workspace">
        <aside className="gl-category-tree-panel" aria-label={t('categories')}>
          {!browse && tree}
        </aside>
        <section className="gl-category-detail" aria-label={t('selectedCategory')}>
          {detail.isPending && id && <p role="status">{t('loading')}</p>}
          {detail.error && (
            <GLAlert tone="error">
              {t('error')}
              <GLButton variant="text" onClick={() => void detail.refetch()}>
                {t('retry')}
              </GLButton>
            </GLAlert>
          )}
          {!id && (
            <div className="gl-category-no-selection">
              <GLHeading level={2} role="heading4">
                {t('selectCategory')}
              </GLHeading>
              <p>{t('categorySelectionHelp')}</p>
            </div>
          )}
          {detail.data && (
            <>
              <span className="gl-overline">{leaf ? t('leafCategory') : t('branchCategory')}</span>
              <GLHeading level={2} role="heading3">
                {detail.data.name}
              </GLHeading>
              <nav aria-label={t('location')} className="gl-category-detail-path">
                <a href="/admin/categories">{t('root')}</a>
                {ancestors.map((category) => (
                  <span key={category.id}>
                    <span aria-hidden="true"> / </span>
                    {category.id === id ? (
                      <span aria-current="page">{category.name}</span>
                    ) : (
                      <a href={'/admin/categories/' + category.id}>{category.name}</a>
                    )}
                  </span>
                ))}
              </nav>
              {path.hasNextPage && (
                <GLButton
                  variant="text"
                  loading={path.isFetchingNextPage}
                  onClick={() => void path.fetchNextPage()}
                >
                  {t('morePath')}
                </GLButton>
              )}
              {path.error && (
                <GLAlert tone="error">
                  {t('error')}
                  <GLButton variant="text" onClick={() => void path.refetch()}>
                    {t('retry')}
                  </GLButton>
                </GLAlert>
              )}
              <div className="gl-category-detail-actions">
                <GLButton disabled={action.isPending} onClick={() => create(detail.data!)}>
                  {t('addSubcategory')}
                </GLButton>
                <GLButton
                  variant="secondary"
                  disabled={action.isPending}
                  onClick={() => edit(detail.data!)}
                >
                  {t('edit')}
                </GLButton>
                <GLActionMenu
                  label={t('actions') + ' — ' + detail.data.name}
                  items={[
                    { label: t('move'), onSelect: () => move(detail.data!) },
                    {
                      label: t('remove'),
                      destructive: true,
                      onSelect: () => {
                        action.reset();
                        setDeleteTarget(detail.data!);
                      },
                    },
                  ]}
                />
              </div>
              <dl className="gl-category-facts">
                <div>
                  <dt>{t('state')}</dt>
                  <dd>{t('active')}</dd>
                </div>
                <div>
                  <dt>{t('categories')}</dt>
                  <dd>
                    <bdi>{detail.data.activeChildCount}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>{t('products')}</dt>
                  <dd>
                    <bdi>{detail.data.activeProductCount}</bdi>
                  </dd>
                </div>
              </dl>
              {detail.data.description && <p>{detail.data.description}</p>}
              {detail.data.coverAssetId && (
                <div className="gl-category-detail-cover">
                  <MediaPreview asset={{ id: detail.data.coverAssetId, kind: 'IMAGE' }} />
                </div>
              )}
              <GLFormSection title={t('groups')}>
                <p>{leaf ? t('categoryGroupsPending') : t('groupsLeafOnly')}</p>
                {leaf && schema.error && <StaffError error={schema.error} />}
                {leaf && schema.data && (
                  <ul>
                    {schema.data.form.groups.map((group) => (
                      <li key={group.id}>
                        {group.label} ·{' '}
                        {
                          schema.data.form.fields.filter(
                            (field) => field.groupPlacementId === group.id,
                          ).length
                        }
                      </li>
                    ))}
                  </ul>
                )}
              </GLFormSection>
              {leaf && (
                <GLButton
                  variant="secondary"
                  onClick={() =>
                    router.push({
                      pathname: '/admin/[...path]',
                      params: { path: ['products'], categoryId: id },
                    })
                  }
                >
                  {t('browseCategoryProducts')}
                </GLButton>
              )}
            </>
          )}
        </section>
      </div>
      <GLDrawer
        className="gl-admin-overlay gl-category-tree-drawer"
        open={browse}
        title={t('browseCategories')}
        onClose={() => setBrowse(false)}
      >
        {tree}
      </GLDrawer>
      <FocusedEditor
        dialog
        open={!!editor}
        dirty={dirty}
        pending={action.isPending}
        title={
          editor?.kind === 'edit'
            ? t('edit')
            : editor?.category
              ? t('createSubcategory')
              : t('createRootCategory')
        }
        onClose={() => setEditor(null)}
      >
        <form
          onSubmit={form.handleSubmit((values) => {
            if (!values.names.ar.trim()) {
              form.setError('names.ar', { message: t('required') });
              return;
            }
            if (!editor) return;
            const captured = editor;
            let savedId: string | null = null;
            action.mutate(
              async () => {
                const saved = await api.request(
                  captured.kind === 'edit'
                    ? '/admin/categories/' + captured.category!.id
                    : '/admin/categories',
                  categoryResult,
                  captured.kind === 'edit'
                    ? {
                        expectedVersion: captured.category!.version,
                        translations: translationInput(values),
                        coverAssetId: cover,
                      }
                    : {
                        parentId: captured.category?.id ?? null,
                        expectedParentVersion: captured.category?.version ?? null,
                        translations: translationInput(values),
                        coverAssetId: cover,
                      },
                  captured.kind === 'edit' ? 'PATCH' : 'POST',
                );
                savedId = saved.id;
                return saved;
              },
              {
                onSuccess: () => {
                  form.reset(values);
                  setEditor(null);
                  if (captured.kind === 'create' && captured.category)
                    setExpanded((previous) => new Set([...previous, captured.category!.id]));
                  if (savedId) select(savedId);
                },
              },
            );
          })}
        >
          <GLFormSection title={t('parent')}>
            <p>
              {editor?.category && editor.kind === 'create'
                ? editor.category.name
                : editor?.kind === 'edit'
                  ? t('useMoveForParent')
                  : t('root')}
            </p>
          </GLFormSection>
          <TranslationFields form={form} />
          <GLFormSection title={t('cover')}>
            <div className="gl-cover-editor">
              {cover && <MediaPreview asset={{ id: cover, kind: 'IMAGE' }} />}
              <GLButton variant="secondary" onClick={() => setCoverOpen(true)}>
                {t('cover')}
              </GLButton>
              {cover && (
                <GLButton variant="secondary" onClick={() => setCover(null)}>
                  {t('detach')}
                </GLButton>
              )}
            </div>
          </GLFormSection>
          <ActionFeedback
            action={action}
            reload={async () => {
              try {
                const category = editor?.category;
                if (!category) return;
                const latest = await api.request(
                  '/admin/categories/' + category.id + '?locale=' + locale,
                  categorySchema,
                );
                // A failed save retains the draft. Explicit Reload displays current server values.
                if (editor?.kind === 'edit') {
                  form.reset(translationDefaults(latest.translations));
                  setCover(latest.coverAssetId);
                }
                setEditor((current) => (current ? { ...current, category: latest } : current));
                action.reset();
                setReloadError(null);
              } catch (error) {
                setReloadError(error);
              }
            }}
          />
          {reloadError != null && <StaffError error={reloadError} />}
          <GLActionBar>
            <GLButton
              variant="ghost"
              disabled={action.isPending}
              onClick={() => {
                if (!dirty || window.confirm(t('unsaved'))) setEditor(null);
              }}
            >
              {t('cancel')}
            </GLButton>
            <GLButton type="submit" loading={action.isPending}>
              {editor?.kind === 'create'
                ? editor.category
                  ? t('createSubcategory')
                  : t('createRootCategory')
                : t('save')}
            </GLButton>
          </GLActionBar>
        </form>
      </FocusedEditor>
      <MediaPicker
        open={coverOpen}
        onClose={() => setCoverOpen(false)}
        allowedKind="IMAGE"
        onSelect={(asset) => setCover(asset.id)}
      />
      <GLModal
        className="gl-admin-overlay"
        open={!!blocked}
        title={t('cannotAddSubcategory')}
        onClose={() => setBlocked(null)}
      >
        <p>{t('categoryContentBlocksChildren')}</p>
        <p>
          {t('products')}: <bdi>{blocked?.activeProductCount}</bdi>
        </p>
        <p>{t('leafRule')}</p>
        <GLButton onClick={() => setBlocked(null)}>{t('close')}</GLButton>
      </GLModal>
      <GLModal
        className="gl-admin-overlay"
        open={!!deleteTarget}
        title={t('remove') + ' — ' + (deleteTarget?.name ?? '')}
        onClose={() => {
          if (!action.isPending) setDeleteTarget(null);
        }}
      >
        <p>{t('confirmDelete')}</p>
        <p>
          {t('categories')}: {preview.data?.impact['totalCategoryCount'] ?? '…'} · {t('products')}:{' '}
          {preview.data?.impact['productCount'] ?? '…'}
        </p>
        {preview.error && (
          <GLAlert tone="error">
            {t('error')}
            <GLButton variant="text" onClick={() => void preview.refetch()}>
              {t('retry')}
            </GLButton>
          </GLAlert>
        )}
        <ActionFeedback action={action} reload={() => void preview.refetch()} />
        <GLActionBar>
          <GLButton
            variant="ghost"
            disabled={action.isPending}
            onClick={() => setDeleteTarget(null)}
          >
            {t('cancel')}
          </GLButton>
          <GLButton
            variant="destructive"
            disabled={!preview.data}
            loading={action.isPending}
            onClick={() => {
              const captured = deleteTarget!,
                review = preview.data!;
              action.mutate(
                () =>
                  api.request(
                    '/admin/categories/' + captured.id,
                    jsonResponse,
                    {
                      confirm: true,
                      expectedVersion: review.category.version,
                      previewPrecondition: review.previewPrecondition,
                    },
                    'DELETE',
                  ),
                {
                  onSuccess: () => {
                    setDeleteTarget(null);
                    setExpanded((previous) => {
                      const next = new Set(previous);
                      next.delete(captured.id);
                      return next;
                    });
                    if (
                      id === captured.id ||
                      ancestors.some((category) => category.id === captured.id)
                    )
                      select(captured.parentId ?? undefined);
                  },
                },
              );
            }}
          >
            {t('confirm')}
          </GLButton>
        </GLActionBar>
      </GLModal>
      <GLModal
        className="gl-admin-overlay"
        open={!!moveTarget}
        title={t('moveCategory')}
        onClose={() => {
          if (!action.isPending) setMoveTarget(null);
        }}
      >
        <p>
          {t('currentLocation')}:{' '}
          {movePath.data?.pages
            .flatMap((page) => page.items)
            .map((category) => category.name)
            .join(' / ') || moveTarget?.name}
        </p>
        {movePath.hasNextPage && (
          <GLButton
            variant="text"
            loading={movePath.isFetchingNextPage}
            onClick={() => void movePath.fetchNextPage()}
          >
            {t('morePath')}
          </GLButton>
        )}
        <p>
          {t('newLocation')}:{' '}
          {[t('root'), ...destinationTrail.map((category) => category.name), moveTarget?.name].join(
            ' / ',
          )}
        </p>
        <div className="gl-category-destination-path">
          <GLButton
            variant="text"
            onClick={() => {
              setDestination(null);
              setDestinationTrail([]);
              setDestinationCursor('');
              setDestinationSearch('');
            }}
          >
            {t('root')}
          </GLButton>
          {destinationTrail.map((category, index) => (
            <GLButton
              key={category.id}
              variant="text"
              onClick={() => {
                setDestination(category.id);
                setDestinationTrail(destinationTrail.slice(0, index + 1));
                setDestinationCursor('');
                setDestinationSearch('');
              }}
            >
              {category.name}
            </GLButton>
          ))}
        </div>
        <GLInput
          label={t('searchDestinationBranch')}
          value={destinationSearch}
          onChange={(event) => setDestinationSearch(event.target.value)}
        />
        <div className="gl-category-destinations">
          {destinations.isPending && <p role="status">{t('loading')}</p>}
          {destinations.data?.items
            .filter((category) =>
              category.name
                .toLocaleLowerCase(locale)
                .includes(destinationSearch.toLocaleLowerCase(locale)),
            )
            .map((category) => (
              <GLButton
                key={category.id}
                variant="ghost"
                disabled={!category.canAddChildren}
                onClick={() => {
                  setDestination(category.id);
                  setDestinationTrail([
                    ...destinationTrail,
                    { id: category.id, name: category.name },
                  ]);
                  setDestinationCursor('');
                  setDestinationSearch('');
                }}
              >
                {category.name}
              </GLButton>
            ))}
        </div>
        {destinations.error && (
          <GLAlert tone="error">
            {t('error')}
            <GLButton variant="text" onClick={() => void destinations.refetch()}>
              {t('retry')}
            </GLButton>
          </GLAlert>
        )}
        {destinations.data?.nextCursor && (
          <GLButton
            variant="text"
            onClick={() => setDestinationCursor(destinations.data!.nextCursor!)}
          >
            {t('moreCategories')}
          </GLButton>
        )}
        <ActionFeedback
          action={action}
          reload={async () => {
            try {
              if (moveTarget)
                setMoveTarget(
                  await api.request(
                    '/admin/categories/' + moveTarget.id + '?locale=' + locale,
                    categorySchema,
                  ),
                );
              void source.refetch();
              void destinations.refetch();
              void movePath.refetch();
              setReloadError(null);
            } catch (error) {
              setReloadError(error);
            }
          }}
        />
        {reloadError != null && <StaffError error={reloadError} />}
        <GLActionBar>
          <GLButton variant="ghost" disabled={action.isPending} onClick={() => setMoveTarget(null)}>
            {t('cancel')}
          </GLButton>
          <GLButton
            disabled={!source.data || !destinations.data || destination === moveTarget?.parentId}
            loading={action.isPending}
            onClick={() => {
              const captured = moveTarget!;
              action.mutate(
                () =>
                  api.request(
                    '/admin/categories/' + captured.id + '/move',
                    jsonResponse,
                    {
                      parentId: destination,
                      beforeId: null,
                      expectedVersion: captured.version,
                      expectedSourceRevision: source.data!.listRevision,
                      expectedDestinationRevision:
                        destination === null
                          ? destinations.data!.rootDestination.listRevision
                          : destinations.data!.listRevision,
                    },
                    'POST',
                  ),
                {
                  onSuccess: () => {
                    setMoveTarget(null);
                    if (destination) setExpanded((previous) => new Set([...previous, destination]));
                    select(captured.id);
                    void query.invalidateQueries({
                      queryKey: categoryBranchKey(captured.parentId, locale),
                    });
                  },
                },
              );
            }}
          >
            {t('moveCategory')}
          </GLButton>
        </GLActionBar>
      </GLModal>
    </>
  );
}
