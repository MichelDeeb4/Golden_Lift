import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GLDataPagination } from '@golden-lift/ui';
import { useAdminTranslation } from './translations';
export interface AdminPageData {
  readonly items: readonly unknown[];
  readonly totalItems?: number;
  readonly page?: number;
  readonly nextCursor?: string | null;
  readonly next?: string | null;
}
function state(params: Record<string, unknown>, mode: 'numbered' | 'cursor') {
  const size = Number(params['pageSize'] ?? 25),
    page = Number(params['page'] ?? 1);
  let trail: string[] = [];
  try {
    const key = params['trailKey'];
    const source =
      typeof key === 'string' && /^[a-f0-9-]{36}$/.test(key)
        ? sessionStorage.getItem('gl.admin.cursor-trail.' + key)
        : params['trail'];
    const value = JSON.parse(
      typeof source === 'string' && source.length < 2000000 ? source : '[]',
    ) as unknown;
    if (
      Array.isArray(value) &&
      value.length < 100000 &&
      value.every((x) => typeof x === 'string' && x.length <= 2048)
    )
      trail = value as string[];
  } catch {
    /* Invalid navigation state normalizes to the first page. */
  }
  return {
    page:
      [10, 25, 50, 100].includes(size) &&
      Number.isInteger(page) &&
      page > 0 &&
      page <= 100000 &&
      (mode === 'numbered' || page <= trail.length + 1)
        ? page
        : 1,
    pageSize: [10, 25, 50, 100].includes(size) ? size : 25,
    trail,
  };
}
export function useAdminPagination(mode: 'numbered' | 'cursor', local = false) {
  const params = useLocalSearchParams(),
    router = useRouter();
  const [localParams, setLocalParams] = useState<Record<string, string>>({});
  const current = state(local ? localParams : params, mode);
  const navigation = (trail: string[]) => {
    const encoded = JSON.stringify(trail);
    if (local || encoded.length <= 1200) return { trail: encoded, trailKey: '' };
    // Large visited histories stay in this tab; URLs remain bounded for HTTP refresh.
    const key =
      typeof params.trailKey === 'string' && /^[a-f0-9-]{36}$/.test(params.trailKey)
        ? params.trailKey
        : crypto.randomUUID();
    try {
      sessionStorage.setItem('gl.admin.cursor-trail.' + key, encoded);
      return { trail: '', trailKey: key };
    } catch {
      // Storage-restricted browsers retain portable URL navigation where possible.
      return { trail: encoded, trailKey: '' };
    }
  };
  const update = (patch: Record<string, string>, replace = false) => {
    if (local) setLocalParams((previous) => ({ ...previous, ...patch }));
    else {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries({ ...params, ...patch }))
        if (typeof value === 'string' && value) query.set(key, value);
      const destination = (window.location.pathname + '?' + query.toString()) as '/admin';
      if (replace) router.setParams(patch);
      else router.navigate(destination);
    }
  };
  const cursor = current.page > 1 ? (current.trail[current.page - 2] ?? '') : '';
  useEffect(() => {
    if (
      !local &&
      (Number(params.page ?? 1) !== current.page ||
        Number(params.pageSize ?? 25) !== current.pageSize)
    )
      update(
        {
          page: String(current.page),
          pageSize: String(current.pageSize),
          ...navigation(current.trail),
        },
        true,
      );
  }, [params.page, params.pageSize, params.trail, params.trailKey, local]);
  return {
    ...current,
    cursor,
    mode,
    filters: (patch: Record<string, string>) =>
      update({ ...patch, page: '1', trail: '', trailKey: '', cursor: '' }),
    normalize: (page: number) =>
      update({ page: String(page), ...navigation(current.trail), cursor: '' }, true),
    size: (pageSize: number) =>
      update({ pageSize: String(pageSize), page: '1', trail: '', trailKey: '', cursor: '' }),
    move: (page: number, next: string | null) => {
      const trail =
        mode === 'cursor' && page > current.page && next
          ? [...current.trail.slice(0, current.page - 1), next]
          : current.trail;
      update({
        page: String(page),
        pageSize: String(current.pageSize),
        ...navigation(mode === 'cursor' ? trail : []),
        cursor: '',
      });
    },
  };
}
export function AdminPagination({
  pagination,
  data,
  loading,
  placeholder = false,
}: {
  pagination: ReturnType<typeof useAdminPagination>;
  data?: AdminPageData;
  loading: boolean;
  placeholder?: boolean;
}) {
  const t = useAdminTranslation();
  useEffect(() => {
    if (!data || loading || placeholder) return;
    if (data.page !== undefined && data.page !== pagination.page) pagination.normalize(data.page);
    else if (pagination.mode === 'cursor' && pagination.page > 1 && !data.items.length)
      pagination.normalize(pagination.page - 1);
  }, [data, loading, placeholder, pagination.page]);
  return (
    <GLDataPagination
      currentPage={data?.page ?? pagination.page}
      pageSize={pagination.pageSize}
      totalItems={data?.totalItems}
      rowCount={data?.items.length ?? 0}
      mode={pagination.mode}
      hasNext={!!(data?.nextCursor ?? data?.next)}
      isLoading={loading}
      onPageChange={(page) => pagination.move(page, data?.nextCursor ?? data?.next ?? null)}
      onPageSizeChange={pagination.size}
      labels={{
        navigation: t('pagination'),
        previous: t('previous'),
        next: t('next'),
        rows: t('rowsPerPage'),
        loading: t('loading'),
        range: (first, last, total) =>
          t('showing') +
          ' ' +
          first +
          '–' +
          last +
          (total !== undefined ? ' ' + t('of') + ' ' + total : ''),
      }}
    />
  );
}
