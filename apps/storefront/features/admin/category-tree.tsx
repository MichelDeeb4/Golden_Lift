import { ArrowUpDown } from '@golden-lift/icons';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, Dispatch, SetStateAction } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoryPageSchema } from '@golden-lift/api';
import type { z } from 'zod';
import { useLocale } from '@golden-lift/i18n';
import { GLActionMenu, GLButton, GLInput, GLSkeleton } from '@golden-lift/ui';
import { useStaffApi } from './context';
import { useAdminTranslation } from './translations';

export type TreeCategory = z.infer<typeof categoryPageSchema>['items'][number];
export const categoryBranchKey = (parent: string | null, locale: string) =>
  ['staff', 'categories', parent, locale] as const;
export function useCategoryBranch(parent: string | null, enabled = true) {
  const api = useStaffApi(),
    { locale } = useLocale();
  return useInfiniteQuery({
    queryKey: categoryBranchKey(parent, locale),
    initialPageParam: '',
    enabled,
    queryFn: ({ pageParam, signal }) =>
      api.request(
        `/admin/categories?locale=${locale}&limit=100${parent ? '&parentId=' + parent : ''}${pageParam ? '&cursor=' + encodeURIComponent(pageParam) : ''}`,
        categoryPageSchema,
        undefined,
        'GET',
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
export const hasCategoryChildren = (category: TreeCategory) =>
  BigInt(category.childCount ?? category.activeChildCount) > 0n;

interface TreeProps {
  selected?: string;
  expanded: Set<string>;
  onExpanded: Dispatch<SetStateAction<Set<string>>>;
  onSelect: (category: TreeCategory) => void;
  onAction?: (category: TreeCategory, action: 'child' | 'edit' | 'move' | 'delete') => void;
  onReorder?: (
    parent: string | null,
    categories: TreeCategory[],
    revision: string,
    index: number,
    step: number,
  ) => void;
  pending: boolean;
}
export function CategoryTree(props: TreeProps) {
  const t = useAdminTranslation(),
    api = useStaffApi(),
    query = useQueryClient(),
    { locale } = useLocale();
  const direction = locale === 'en' ? 'ltr' : 'rtl';
  const [search, setSearch] = useState(''),
    [term, setTerm] = useState(''),
    [all, setAll] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => setFocused(props.selected ?? null), [props.selected]);
  useEffect(() => {
    if (!focused || !root.current) return;
    const visible = [...root.current.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    if (!visible.some((node) => node.dataset.categoryId === focused))
      setFocused(visible[0]?.dataset.categoryId ?? null);
  }, [props.expanded, focused]);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  // Search traverses existing bounded branch APIs; names keep their ancestor context.
  // A breadth-first walk avoids imposing a depth limit or loading every branch on initial render.
  const index = useQuery({
    queryKey: ['staff', 'category-tree-search', locale, term],
    enabled: !!term,
    queryFn: async ({ signal }) => {
      const queue: (string | null)[] = [null],
        seen = new Set<string>(),
        records: TreeCategory[] = [];
      while (queue.length) {
        const parent = queue.shift()!;
        let cursor = '';
        const pages: z.infer<typeof categoryPageSchema>[] = [],
          pageParams: string[] = [];
        do {
          const page = await api.request(
            `/admin/categories?locale=${locale}&limit=100${parent ? '&parentId=' + parent : ''}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
            categoryPageSchema,
            undefined,
            'GET',
            signal,
          );
          pages.push(page);
          pageParams.push(cursor);
          for (const category of page.items) {
            if (seen.has(category.id)) continue;
            seen.add(category.id);
            records.push(category);
            if (records.length > 5000) throw new Error(t('treeSearchLimit'));
            if (hasCategoryChildren(category)) queue.push(category.id);
          }
          cursor = page.nextCursor ?? '';
        } while (cursor);
        query.setQueryData(categoryBranchKey(parent, locale), { pages, pageParams });
      }
      const byId = new Map(records.map((category) => [category.id, category]));
      const included = new Set<string>();
      const needle = term.toLocaleLowerCase(locale);
      for (const category of records) {
        if (!category.name.toLocaleLowerCase(locale).includes(needle)) continue;
        let node: TreeCategory | undefined = category;
        const ancestry = new Set<string>();
        while (node && !ancestry.has(node.id)) {
          ancestry.add(node.id);
          included.add(node.id);
          node = node.parentId ? byId.get(node.parentId) : undefined;
        }
      }
      return included;
    },
  });
  function toggle(id: string) {
    if (all) {
      const visibleExpanded = new Set<string>();
      root.current
        ?.querySelectorAll<HTMLElement>('[role="treeitem"][aria-expanded="true"]')
        .forEach((node) => {
          if (node.dataset.categoryId) visibleExpanded.add(node.dataset.categoryId);
        });
      visibleExpanded.delete(id);
      props.onExpanded(visibleExpanded);
      setAll(false);
    } else {
      const next = new Set(props.expanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      props.onExpanded(next);
    }
  }
  function keyboard(
    event: KeyboardEvent<HTMLDivElement>,
    category: TreeCategory,
    expanded: boolean,
  ) {
    if (event.target !== event.currentTarget) return;
    const nodes = [...(root.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])];
    const current = event.currentTarget,
      position = nodes.indexOf(current);
    const expandKey = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const collapseKey = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    let target: HTMLElement | undefined | null;
    if (event.key === 'ArrowDown') target = nodes[position + 1];
    else if (event.key === 'ArrowUp') target = nodes[position - 1];
    else if (event.key === 'Home') target = nodes[0];
    else if (event.key === 'End') target = nodes.at(-1);
    else if (event.key === expandKey) {
      if (hasCategoryChildren(category) && !expanded) toggle(category.id);
      else target = current.querySelector<HTMLElement>('[role="group"] [role="treeitem"]');
    } else if (event.key === collapseKey) {
      if (expanded) toggle(category.id);
      else target = current.parentElement?.closest<HTMLElement>('[role="treeitem"]');
    } else if (event.key === 'Enter' || event.key === ' ') props.onSelect(category);
    else return;
    event.preventDefault();
    event.stopPropagation();
    target?.focus();
  }
  const context = {
    ...props,
    all,
    focused,
    setFocused,
    toggle,
    keyboard,
    included: term ? index.data : undefined,
    searching: !!term,
  };
  return (
    <>
      <div className="gl-category-tree-heading">
        <span className="gl-overline">{t('catalogStructure')}</span>
        <GLInput
          label={t('searchCategories')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="gl-category-tree-controls">
          <GLButton variant="text" onClick={() => setAll(true)}>
            {t('expandAll')}
          </GLButton>
          <GLButton
            variant="text"
            onClick={() => {
              setAll(false);
              props.onExpanded(new Set());
              setSearch('');
            }}
          >
            {t('collapseAll')}
          </GLButton>
        </div>
        {term && index.isFetching && <p role="status">{t('searchingCategories')}</p>}
        {term && index.error && (
          <div role="alert">
            <p>{index.error.message}</p>
            <GLButton variant="text" onClick={() => void index.refetch()}>
              <ArrowUpDown size={18} aria-hidden="true" />
              {t('retry')}
            </GLButton>
          </div>
        )}
        {term && index.data?.size === 0 && <p role="status">{t('noMatchingCategories')}</p>}
      </div>
      <div
        role="tree"
        aria-label={t('catalogStructure')}
        className="gl-category-tree"
        ref={root}
        aria-busy={!!term && index.isFetching}
      >
        <CategoryTreeBranch parent={null} depth={0} context={context} />
      </div>
    </>
  );
}
interface NodeContext extends TreeProps {
  all: boolean;
  focused: string | null;
  setFocused: (id: string) => void;
  toggle: (id: string) => void;
  keyboard: (
    event: KeyboardEvent<HTMLDivElement>,
    category: TreeCategory,
    expanded: boolean,
  ) => void;
  included: Set<string> | undefined;
  searching: boolean;
}
function CategoryTreeBranch({
  parent,
  depth,
  context,
}: {
  parent: string | null;
  depth: number;
  context: NodeContext;
}) {
  const rows = useCategoryBranch(parent),
    t = useAdminTranslation();
  const items = rows.data?.pages.flatMap((page) => page.items) ?? [];
  useEffect(() => {
    if (context.all && rows.data)
      context.onExpanded(
        (previous) =>
          new Set([
            ...previous,
            ...rows.data.pages
              .flatMap((page) => page.items)
              .filter(hasCategoryChildren)
              .map((category) => category.id),
          ]),
      );
  }, [context.all, rows.data, context.onExpanded]);
  useEffect(() => {
    if (
      (context.all || context.searching) &&
      rows.hasNextPage &&
      !rows.isFetchingNextPage &&
      !rows.isFetchNextPageError
    )
      void rows.fetchNextPage();
  }, [
    context.all,
    context.searching,
    rows.hasNextPage,
    rows.isFetchingNextPage,
    rows.isFetchNextPageError,
  ]);
  if (rows.isPending)
    return (
      <div role="status" aria-label={t('loading')} className="gl-category-branch-feedback">
        <GLSkeleton />
        <GLSkeleton />
      </div>
    );
  if (rows.error && !items.length)
    return (
      <div role="alert" className="gl-category-branch-feedback">
        {t('childrenLoadFailed')}{' '}
        <GLButton variant="text" onClick={() => void rows.refetch()}>
          <ArrowUpDown size={18} aria-hidden="true" />
          {t('retry')}
        </GLButton>
      </div>
    );
  return (
    <>
      {rows.error && items.length > 0 && (
        <div role="alert" className="gl-category-branch-feedback">
          {t('childrenLoadFailed')}{' '}
          <GLButton variant="text" onClick={() => void rows.refetch()}>
            <ArrowUpDown size={18} aria-hidden="true" />
            {t('retry')}
          </GLButton>
        </div>
      )}
      {!parent && !items.length && <p>{t('emptyCategoryTree')}</p>}
      {items.map(
        (category, index) =>
          (!context.included || context.included.has(category.id)) && (
            <CategoryTreeNode
              key={category.id}
              category={category}
              depth={depth}
              first={!parent && index === 0}
              context={context}
              order={{
                items,
                index,
                revision: rows.data!.pages[0]!.listRevision,
                complete: !rows.hasNextPage && items.length <= 500 && !rows.isFetching,
              }}
            />
          ),
      )}
      {rows.hasNextPage && (
        <div className="gl-category-branch-feedback">
          <GLButton
            variant="text"
            loading={rows.isFetchingNextPage}
            onClick={() => void rows.fetchNextPage()}
          >
            {t('moreCategories')}
          </GLButton>
        </div>
      )}
      {rows.isFetchNextPageError && <p role="alert">{t('childrenLoadFailed')}</p>}
    </>
  );
}
function CategoryTreeNode({
  category,
  depth,
  first,
  context,
  order,
}: {
  category: TreeCategory;
  depth: number;
  first: boolean;
  context: NodeContext;
  order: { items: TreeCategory[]; index: number; revision: string; complete: boolean };
}) {
  const t = useAdminTranslation();
  const children = hasCategoryChildren(category);
  const expanded =
    children &&
    (context.expanded.has(category.id) ||
      context.all ||
      (context.searching && !!context.included?.has(category.id)));
  return (
    <div
      role="treeitem"
      aria-label={category.name}
      aria-level={depth + 1}
      aria-selected={context.selected === category.id}
      aria-expanded={children ? expanded : undefined}
      tabIndex={context.focused === category.id || (!context.focused && first) ? 0 : -1}
      data-category-id={category.id}
      className="gl-category-node"
      onFocus={(event) => {
        if (event.target === event.currentTarget) context.setFocused(category.id);
      }}
      onKeyDown={(event) => context.keyboard(event, category, expanded)}
    >
      <div className="gl-category-tree-row" style={{ paddingInlineStart: 8 + depth * 20 }}>
        {children ? (
          <button
            type="button"
            tabIndex={-1}
            className="gl-category-disclosure"
            aria-label={(expanded ? t('collapse') : t('expand')) + ' ' + category.name}
            aria-expanded={expanded}
            onClick={() => context.toggle(category.id)}
          >
            <span aria-hidden="true">›</span>
          </button>
        ) : (
          <span className="gl-category-leaf-mark" aria-hidden="true">
            ·
          </span>
        )}
        <a
          href={'/admin/categories/' + category.id}
          data-local-selection
          tabIndex={-1}
          className="gl-category-node-name"
          onClick={(event) => {
            event.preventDefault();
            context.onSelect(category);
          }}
        >
          {category.name}
        </a>
        {children && (
          <small title={t('categories')}>
            <bdi>{category.childCount ?? category.activeChildCount}</bdi>
          </small>
        )}
        {context.onAction && context.onReorder && (
          <GLActionMenu
            label={t('actions') + ' — ' + category.name}
            items={[
              {
                label: t('addSubcategory'),
                icon: 'child',
                onSelect: () => context.onAction?.(category, 'child'),
              },
              {
                label: t('edit'),
                icon: 'edit',
                onSelect: () => context.onAction?.(category, 'edit'),
              },
              {
                label: t('move'),
                icon: 'move',
                onSelect: () => context.onAction?.(category, 'move'),
              },
              {
                label: t('up'),
                icon: 'reorder',
                disabled: context.pending || !order.complete || order.index === 0,
                onSelect: () =>
                  context.onReorder?.(
                    category.parentId,
                    order.items,
                    order.revision,
                    order.index,
                    -1,
                  ),
              },
              {
                label: t('down'),
                icon: 'reorder',
                disabled:
                  context.pending || !order.complete || order.index === order.items.length - 1,
                onSelect: () =>
                  context.onReorder?.(
                    category.parentId,
                    order.items,
                    order.revision,
                    order.index,
                    1,
                  ),
              },
              {
                label: t('remove'),
                icon: 'delete',
                destructive: true,
                onSelect: () => context.onAction?.(category, 'delete'),
              },
            ]}
          />
        )}
      </div>
      {expanded && (
        <div role="group">
          <CategoryTreeBranch parent={category.id} depth={depth + 1} context={context} />
        </div>
      )}
    </div>
  );
}
