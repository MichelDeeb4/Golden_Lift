import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { categoryPageSchema, categorySchema } from '@golden-lift/api';
import { useLocale } from '@golden-lift/i18n';
import { GLAlert, GLButton, GLHeading, GLModal, GLBreadcrumb } from '@golden-lift/ui';
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
} from './common';
import type { TranslationForm } from './common';
import { MediaPicker, MediaPreview } from './media';
export function CategoryPicker({
  onSelect,
  leaf = false,
}: {
  onSelect: (category: z.infer<typeof categorySchema> | null) => void;
  leaf?: boolean;
}) {
  const [parent, setParent] = useState<string | null>(null),
    [trail, setTrail] = useState<{ id: string; name: string }[]>([]),
    [cursor, setCursor] = useState(''),
    api = useStaffApi(),
    { locale } = useLocale(),
    t = useAdminTranslation();
  const rows = useQuery({
    queryKey: ['staff', 'category-picker', parent, locale, cursor],
    queryFn: ({ signal }) =>
      api.request(
        `/admin/categories?locale=${locale}${parent ? '&parentId=' + parent : ''}&limit=25${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
        categoryPageSchema,
        undefined,
        'GET',
        signal,
      ),
  });
  return (
    <>
      <GLButton
        variant="secondary"
        onClick={() => {
          setParent(null);
          setTrail([]);
          setCursor('');
        }}
      >
        {t('root')}
      </GLButton>
      {trail.map((entry, index) => (
        <GLButton
          key={entry.id}
          variant="text"
          onClick={() => {
            setParent(entry.id);
            setCursor('');
            setTrail(trail.slice(0, index + 1));
          }}
        >
          {entry.name}
        </GLButton>
      ))}
      {!leaf && (
        <GLButton onClick={() => onSelect(null)}>
          {t('select')} — {t('root')}
        </GLButton>
      )}
      <TableState pending={rows.isPending} error={rows.error} empty={!rows.data?.items.length}>
        <table>
          <thead>
            <tr>
              <th>{t('name')}</th>
              <th>{t('select')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.data?.items.map((c) => (
              <tr key={c.id}>
                <td>
                  <GLButton
                    variant="text"
                    onClick={() => {
                      setParent(c.id);
                      setTrail([...trail, { id: c.id, name: c.name }]);
                      setCursor('');
                    }}
                  >
                    {c.name} ({c.activeChildCount})
                  </GLButton>
                </td>
                <td>
                  <GLButton
                    disabled={leaf ? !c.canAddProducts : !c.canAddChildren}
                    onClick={() => onSelect(c)}
                  >
                    {t('select')}
                  </GLButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableState>
      {rows.data?.nextCursor && (
        <GLButton onClick={() => setCursor(rows.data!.nextCursor!)}>{t('next')}</GLButton>
      )}
    </>
  );
}
export function Categories({ id }: { id?: string }) {
  const api = useStaffApi(),
    { locale } = useLocale(),
    t = useAdminTranslation(),
    action = useAction(),
    [editor, setEditor] = useState<'create' | 'edit' | null>(null),
    [moving, setMoving] = useState(false),
    [destination, setDestination] = useState<string | null>(null),
    [ordered, setOrdered] = useState<string[]>([]);
  const [cover, setCover] = useState<string | null>(null),
    [coverOpen, setCoverOpen] = useState(false);
  const [orderRevision, setOrderRevision] = useState<string | null>(null);
  const parent = id ?? null,
    detail = useQuery({
      queryKey: ['staff', 'category', id, locale],
      queryFn: ({ signal }) =>
        api.request(
          `/admin/categories/${id}?locale=${locale}`,
          categorySchema,
          undefined,
          'GET',
          signal,
        ),
      enabled: !!id,
    });
  const rows = useInfiniteQuery({
    queryKey: ['staff', 'categories', parent, locale],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      api.request(
        `/admin/categories?locale=${locale}${parent ? '&parentId=' + parent : ''}&limit=100${pageParam ? '&cursor=' + encodeURIComponent(pageParam) : ''}`,
        categoryPageSchema,
        undefined,
        'GET',
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = rows.data?.pages.flatMap((page) => page.items) ?? [];
  const form = useForm<TranslationForm>({ defaultValues: structuredClone(emptyTranslations) });
  useUnsaved(
    form.formState.isDirty ||
      ordered.length > 0 ||
      (editor !== null &&
        cover !== (editor === 'edit' ? (detail.data?.coverAssetId ?? null) : null)),
  );
  const path = useInfiniteQuery({
    queryKey: ['staff', 'breadcrumbs', id, locale],
    initialPageParam: '',
    queryFn: ({ signal, pageParam }) =>
      api.request(
        `/admin/categories/${id}/breadcrumbs?locale=${locale}${pageParam ? '&cursor=' + encodeURIComponent(pageParam) : ''}`,
        z.object({
          items: z.array(
            categorySchema.omit({
              translations: true,
              coverAssetId: true,
              activeChildCount: true,
              activeProductCount: true,
              canAddProducts: true,
              canAddChildren: true,
            }),
          ),
          nextCursor: z.string().nullable(),
          pathRevision: z.string(),
        }),
        undefined,
        'GET',
        signal,
      ),
    enabled: !!id,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const preview = useQuery({
    queryKey: ['staff', 'category-delete-preview', id],
    queryFn: ({ signal }) =>
      api.request(
        `/admin/categories/${id}/deletion-preview`,
        z.object({
          previewPrecondition: z.string(),
          category: categorySchema,
          impact: z.record(z.string()),
        }),
        undefined,
        'GET',
        signal,
      ),
    enabled: !!id,
  });
  const source = useQuery({
    queryKey: ['staff', 'category-source', detail.data?.parentId, locale],
    queryFn: ({ signal }) =>
      api.request(
        `/admin/categories?locale=${locale}${detail.data?.parentId ? '&parentId=' + detail.data.parentId : ''}`,
        categoryPageSchema,
        undefined,
        'GET',
        signal,
      ),
    enabled: !!detail.data && moving,
  });
  const destinations = useQuery({
    queryKey: ['staff', 'move-destinations', id, destination, locale],
    queryFn: ({ signal }) =>
      api.request(
        `/admin/categories/${id}/move-destinations?locale=${locale}${destination ? '&parentId=' + destination : ''}`,
        categoryPageSchema.extend({
          rootDestination: z.object({ parentId: z.null(), listRevision: z.string() }),
        }),
        undefined,
        'GET',
        signal,
      ),
    enabled: !!id && moving,
  });
  useEffect(() => setOrdered([]), [id, locale]);
  const listed = ordered.length
    ? ordered.map((key) => items.find((c) => c.id === key)!).filter(Boolean)
    : items;
  function shift(index: number, step: number) {
    if (!ordered.length) setOrderRevision(rows.data!.pages[0]!.listRevision);
    const next = listed.map((c) => c.id);
    const target = index + step;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrdered(next);
  }
  return (
    <>
      <GLHeading level={1} role="heading3">
        {detail.data?.name ?? t('categories')}
      </GLHeading>
      <GLBreadcrumb
        items={[
          { label: t('root'), href: '/admin/categories' },
          ...(path.data?.pages.flatMap((page) => page.items) ?? []).map((c) => ({
            label: c.name,
            href: '/admin/categories/' + c.id,
          })),
        ]}
      />
      {path.hasNextPage && (
        <GLButton loading={path.isFetchingNextPage} onClick={() => void path.fetchNextPage()}>
          {t('next')}
        </GLButton>
      )}
      <GLAlert>{t('leafRule')}</GLAlert>
      <ActionFeedback
        action={action}
        reload={() => {
          void rows.refetch();
          void detail.refetch();
        }}
      />
      <div className="gl-admin-toolbar">
        <GLButton
          disabled={!!id && !detail.data?.canAddChildren}
          onClick={() => {
            form.reset(structuredClone(emptyTranslations));
            setCover(null);
            setEditor('create');
          }}
        >
          {t('create')}
        </GLButton>
        {detail.data && (
          <>
            <GLButton
              variant="secondary"
              onClick={() => {
                form.reset(translationDefaults(detail.data!.translations));
                setCover(detail.data!.coverAssetId);
                setEditor('edit');
              }}
            >
              {t('edit')}
            </GLButton>
            <GLButton variant="secondary" onClick={() => setMoving(true)}>
              {t('move')}
            </GLButton>
            <Confirm
              title={t('remove')}
              disabled={!preview.data}
              work={() =>
                api
                  .request(
                    `/admin/categories/${id}`,
                    jsonResponse,
                    {
                      confirm: true,
                      expectedVersion: preview.data!.category.version,
                      previewPrecondition: preview.data!.previewPrecondition,
                    },
                    'DELETE',
                  )
                  .then(() => {
                    window.location.assign('/admin/categories');
                  })
              }
            >
              {t('confirmDelete')}
              <pre>
                {preview.data
                  ? `${t('categories')}: ${preview.data.impact['totalCategoryCount']} · ${t('products')}: ${preview.data.impact['productCount']}`
                  : t('loading')}
              </pre>
            </Confirm>
          </>
        )}
      </div>
      <TableState pending={rows.isPending} error={rows.error} empty={!items.length}>
        <table>
          <thead>
            <tr>
              <th>{t('name')}</th>
              <th>{t('categories')}</th>
              <th>{t('products')}</th>
              <th>{t('order')}</th>
            </tr>
          </thead>
          <tbody>
            {listed.map((c, index) => (
              <tr key={c.id}>
                <td>
                  <a href={'/admin/categories/' + c.id}>{c.name}</a>
                </td>
                <td>{c.activeChildCount}</td>
                <td>{c.activeProductCount}</td>
                <td>
                  <div className="gl-admin-toolbar">
                    <GLButton
                      variant="ghost"
                      disabled={index === 0 || rows.hasNextPage || items.length > 500}
                      onClick={() => shift(index, -1)}
                    >
                      {t('up')}
                    </GLButton>
                    <GLButton
                      variant="ghost"
                      disabled={
                        index === listed.length - 1 || rows.hasNextPage || items.length > 500
                      }
                      onClick={() => shift(index, 1)}
                    >
                      {t('down')}
                    </GLButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableState>
      {rows.hasNextPage && (
        <GLButton loading={rows.isFetchingNextPage} onClick={() => void rows.fetchNextPage()}>
          {t('next')}
        </GLButton>
      )}
      {ordered.length > 0 && (
        <GLButton
          disabled={rows.hasNextPage || items.length > 500}
          loading={action.isPending}
          onClick={() =>
            action.mutate(
              () =>
                api.request(
                  '/admin/categories/reorder',
                  jsonResponse,
                  {
                    parentId: parent,
                    orderedIds: ordered,
                    expectedListRevision: orderRevision,
                  },
                  'POST',
                ),
              {
                onSuccess: () => {
                  setOrdered([]);
                  setOrderRevision(null);
                },
              },
            )
          }
        >
          {t('reorder')}
        </GLButton>
      )}
      <GLModal
        open={editor != null}
        title={editor === 'edit' ? t('edit') : t('create')}
        onClose={() => setEditor(null)}
      >
        <form
          onSubmit={form.handleSubmit((v) => {
            if (!v.names.ar.trim()) {
              form.setError('names.ar', { message: t('required') });
              return;
            }
            action.mutate(
              () =>
                api.request(
                  editor === 'edit' ? `/admin/categories/${id}` : '/admin/categories',
                  categorySchema.omit({
                    translations: true,
                    coverAssetId: true,
                    activeChildCount: true,
                    activeProductCount: true,
                    canAddProducts: true,
                    canAddChildren: true,
                  }),
                  editor === 'edit'
                    ? {
                        expectedVersion: detail.data!.version,
                        translations: translationInput(v),
                        coverAssetId: cover,
                      }
                    : {
                        parentId: parent,
                        expectedParentVersion: detail.data?.version ?? null,
                        translations: translationInput(v),
                        coverAssetId: cover,
                      },
                  editor === 'edit' ? 'PATCH' : 'POST',
                ),
              {
                onSuccess: () => {
                  form.reset(v);
                  setEditor(null);
                },
              },
            );
          })}
        >
          <TranslationFields form={form} />
          {cover && <MediaPreview asset={{ id: cover, kind: 'IMAGE' }} />}
          <GLButton variant="secondary" onClick={() => setCoverOpen(true)}>
            {t('cover')}
          </GLButton>
          {cover && (
            <GLButton variant="secondary" onClick={() => setCover(null)}>
              {t('detach')}
            </GLButton>
          )}
          <ActionFeedback action={action} />
          <GLButton type="submit" loading={action.isPending}>
            {t('save')}
          </GLButton>
        </form>
      </GLModal>
      <MediaPicker
        open={coverOpen}
        onClose={() => setCoverOpen(false)}
        allowedKind="IMAGE"
        onSelect={(asset) => setCover(asset.id)}
      />
      <GLModal open={moving} onClose={() => setMoving(false)} title={t('move')}>
        <GLButton variant="secondary" onClick={() => setDestination(null)}>
          {t('root')}
        </GLButton>
        {destinations.data?.items.map((c) => (
          <GLButton key={c.id} variant="text" onClick={() => setDestination(c.id)}>
            {c.name}
          </GLButton>
        ))}
        <ActionFeedback action={action} />
        <GLButton
          disabled={!source.data || !destinations.data}
          loading={action.isPending}
          onClick={() =>
            action.mutate(
              () =>
                api.request(
                  `/admin/categories/${id}/move`,
                  jsonResponse,
                  {
                    parentId: destination,
                    beforeId: null,
                    expectedVersion: detail.data!.version,
                    expectedSourceRevision: source.data!.listRevision,
                    expectedDestinationRevision:
                      destination === null
                        ? destinations.data!.rootDestination.listRevision
                        : destinations.data!.listRevision,
                  },
                  'POST',
                ),
              { onSuccess: () => setMoving(false) },
            )
          }
        >
          {t('confirm')}
        </GLButton>
      </GLModal>
    </>
  );
}
