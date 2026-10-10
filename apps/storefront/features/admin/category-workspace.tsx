import { DeletionDialog } from './deletion';
import { RelationshipSelection, RelationshipEditor } from './relationships';
import { ArrowUpDown, FolderPlus, Plus, Save, X } from '@business-platform/icons';
import { useConfirmDiscard } from './context';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { categoryPageSchema, categorySchema, categoryFormSchema } from '@business-platform/api';
import { useLocale } from '@business-platform/i18n';
import {
  BPAlert,
  BPButton,
  BPHeading,
  BPModal,
  BPDrawer,
  BPFormSection,
  BPActionBar,
  BPActionMenu,
  BPPageHeader,
  BPInput,
} from '@business-platform/ui';
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
  const confirmDiscard = useConfirmDiscard();
  const router = useRouter(),
    api = useStaffApi(),
    query = useQueryClient(),
    { locale } = useLocale(),
    t = useAdminTranslation();
  const action = useAction('categories');
  const [groupIds, setGroupIds] = useState<string[]>([]);
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
      groupIds.length > 0 ||
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
    setGroupIds([]);
    setEditor({ kind: 'create', category: parent });
  }
  function edit(category: Category) {
    action.reset();
    setReloadError(null);
    form.reset(translationDefaults(category.translations));
    setCover(category.coverAssetId);
    setGroupIds([]);
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
      <BPPageHeader
        title={t('categories')}
        description={t('categoryTreeHelp')}
        actions={<BPButton onClick={() => create(null)}>{t('createRootCategory')}</BPButton>}
      />
      <BPButton variant="secondary" className="bp-category-browse" onClick={() => setBrowse(true)}>
        {t('browseCategories')}
      </BPButton>
      <ActionFeedback
        action={action}
        reload={() => {
          void query.invalidateQueries({ queryKey: ['staff', 'categories'] });
          void detail.refetch();
        }}
      />
      <div className="bp-category-tree-workspace">
        <aside className="bp-category-tree-panel" aria-label={t('categories')}>
          {!browse && tree}
        </aside>
        <section className="bp-category-detail" aria-label={t('selectedCategory')}>
          {detail.isPending && id && <p role="status">{t('loading')}</p>}
          {detail.error && (
            <BPAlert tone="error">
              {t('error')}
              <BPButton variant="text" onClick={() => void detail.refetch()}>
                <ArrowUpDown size={18} aria-hidden="true" />
                {t('retry')}
              </BPButton>
            </BPAlert>
          )}
          {!id && (
            <div className="bp-category-no-selection">
              <BPHeading level={2} role="heading4">
                {t('selectCategory')}
              </BPHeading>
              <p>{t('categorySelectionHelp')}</p>
            </div>
          )}
          {detail.data && (
            <>
              <span className="bp-overline">{leaf ? t('leafCategory') : t('branchCategory')}</span>
              <BPHeading level={2} role="heading3">
                {detail.data.name}
              </BPHeading>
              <nav aria-label={t('location')} className="bp-category-detail-path">
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
                <BPButton
                  variant="text"
                  loading={path.isFetchingNextPage}
                  onClick={() => void path.fetchNextPage()}
                >
                  {t('morePath')}
                </BPButton>
              )}
              {path.error && (
                <BPAlert tone="error">
                  {t('error')}
                  <BPButton variant="text" onClick={() => void path.refetch()}>
                    <ArrowUpDown size={18} aria-hidden="true" />
                    {t('retry')}
                  </BPButton>
                </BPAlert>
              )}
              <div className="bp-category-detail-actions">
                <BPButton disabled={action.isPending} onClick={() => create(detail.data!)}>
                  <FolderPlus size={18} aria-hidden="true" />
                  {t('addSubcategory')}
                </BPButton>
                <BPActionMenu
                  label={t('actions') + ' — ' + detail.data.name}
                  items={[
                    {
                      label: t('edit'),
                      icon: 'edit',
                      disabled: action.isPending,
                      onSelect: () => edit(detail.data!),
                    },
                    { label: t('move'), icon: 'move', onSelect: () => move(detail.data!) },
                    {
                      label: t('remove'),
                      icon: 'delete',
                      destructive: true,
                      onSelect: () => {
                        action.reset();
                        setDeleteTarget(detail.data!);
                      },
                    },
                  ]}
                />
              </div>
              <dl className="bp-category-facts">
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
                <div className="bp-category-detail-cover">
                  <MediaPreview asset={{ id: detail.data.coverAssetId, kind: 'IMAGE' }} />
                </div>
              )}
              <BPFormSection title={t('groups')}>
                {leaf ? (
                  <RelationshipEditor resource="categories" id={detail.data.id} />
                ) : (
                  <p>{t('groupsLeafOnly')}</p>
                )}
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
              </BPFormSection>
              {leaf && (
                <BPButton
                  variant="secondary"
                  onClick={() =>
                    router.push({
                      pathname: '/admin/[...path]',
                      params: { path: ['products'], categoryId: id },
                    })
                  }
                >
                  {t('browseCategoryProducts')}
                </BPButton>
              )}
            </>
          )}
        </section>
      </div>
      <BPDrawer
        className="bp-admin-overlay bp-category-tree-drawer"
        open={browse}
        title={t('browseCategories')}
        onClose={() => setBrowse(false)}
      >
        {tree}
      </BPDrawer>
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
                        groupIds,
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
          <BPFormSection title={t('parent')}>
            <p>
              {editor?.category && editor.kind === 'create'
                ? editor.category.name
                : editor?.kind === 'edit'
                  ? t('useMoveForParent')
                  : t('root')}
            </p>
          </BPFormSection>
          <TranslationFields form={form} />
          {editor?.kind === 'create' && (
            <RelationshipSelection
              resource="attribute-groups"
              value={groupIds}
              onChange={setGroupIds}
              disabled={action.isPending}
            />
          )}
          <BPFormSection title={t('cover')}>
            <div className="bp-cover-editor">
              {cover && <MediaPreview asset={{ id: cover, kind: 'IMAGE' }} />}
              <BPButton variant="secondary" onClick={() => setCoverOpen(true)}>
                {t('cover')}
              </BPButton>
              {cover && (
                <BPButton variant="secondary" onClick={() => setCover(null)}>
                  {t('detach')}
                </BPButton>
              )}
            </div>
          </BPFormSection>
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
          <BPActionBar>
            <BPButton
              variant="ghost"
              disabled={action.isPending}
              onClick={async () => {
                if (!dirty || (await confirmDiscard())) setEditor(null);
              }}
            >
              <X size={18} aria-hidden="true" />
              {t('cancel')}
            </BPButton>
            <BPButton type="submit" loading={action.isPending}>
              {editor?.kind === 'create' ? (
                <Plus size={18} aria-hidden="true" />
              ) : (
                <Save size={18} aria-hidden="true" />
              )}
              {editor?.kind === 'create'
                ? editor.category
                  ? t('createSubcategory')
                  : t('createRootCategory')
                : t('save')}
            </BPButton>
          </BPActionBar>
        </form>
      </FocusedEditor>
      <MediaPicker
        open={coverOpen}
        onClose={() => setCoverOpen(false)}
        allowedKind="IMAGE"
        onSelect={(asset) => setCover(asset.id)}
      />
      <BPModal
        className="bp-admin-overlay"
        open={!!blocked}
        title={t('cannotAddSubcategory')}
        onClose={() => setBlocked(null)}
      >
        <p>{t('categoryContentBlocksChildren')}</p>
        <p>
          {t('products')}: <bdi>{blocked?.activeProductCount}</bdi>
        </p>
        <p>{t('leafRule')}</p>
        <BPButton onClick={() => setBlocked(null)}>
          <X size={18} aria-hidden="true" />
          {t('close')}
        </BPButton>
      </BPModal>
      {deleteTarget && (
        <DeletionDialog
          path={'/admin/categories/' + deleteTarget.id}
          scope="categories"
          onClose={() => setDeleteTarget(null)}
          onAccepted={() => {
            if (id === deleteTarget.id || ancestors.some((c) => c.id === deleteTarget.id))
              select(deleteTarget.parentId ?? undefined);
          }}
        />
      )}

      <BPModal
        className="bp-admin-overlay"
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
          <BPButton
            variant="text"
            loading={movePath.isFetchingNextPage}
            onClick={() => void movePath.fetchNextPage()}
          >
            {t('morePath')}
          </BPButton>
        )}
        <p>
          {t('newLocation')}:{' '}
          {[t('root'), ...destinationTrail.map((category) => category.name), moveTarget?.name].join(
            ' / ',
          )}
        </p>
        <div className="bp-category-destination-path">
          <BPButton
            variant="text"
            onClick={() => {
              setDestination(null);
              setDestinationTrail([]);
              setDestinationCursor('');
              setDestinationSearch('');
            }}
          >
            {t('root')}
          </BPButton>
          {destinationTrail.map((category, index) => (
            <BPButton
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
            </BPButton>
          ))}
        </div>
        <BPInput
          label={t('searchDestinationBranch')}
          value={destinationSearch}
          onChange={(event) => setDestinationSearch(event.target.value)}
        />
        <div className="bp-category-destinations">
          {destinations.isPending && <p role="status">{t('loading')}</p>}
          {destinations.data?.items
            .filter((category) =>
              category.name
                .toLocaleLowerCase(locale)
                .includes(destinationSearch.toLocaleLowerCase(locale)),
            )
            .map((category) => (
              <BPButton
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
              </BPButton>
            ))}
        </div>
        {destinations.error && (
          <BPAlert tone="error">
            {t('error')}
            <BPButton variant="text" onClick={() => void destinations.refetch()}>
              <ArrowUpDown size={18} aria-hidden="true" />
              {t('retry')}
            </BPButton>
          </BPAlert>
        )}
        {destinations.data?.nextCursor && (
          <BPButton
            variant="text"
            onClick={() => setDestinationCursor(destinations.data!.nextCursor!)}
          >
            {t('moreCategories')}
          </BPButton>
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
        <BPActionBar>
          <BPButton variant="ghost" disabled={action.isPending} onClick={() => setMoveTarget(null)}>
            <X size={18} aria-hidden="true" />
            {t('cancel')}
          </BPButton>
          <BPButton
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
          </BPButton>
        </BPActionBar>
      </BPModal>
    </>
  );
}
