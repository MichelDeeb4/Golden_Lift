import { GLButton } from './primitives';
import { GLSelect } from './fields';
export interface PaginationLabels {
  readonly navigation: string;
  readonly previous: string;
  readonly next: string;
  readonly rows: string;
  readonly loading: string;
  readonly range: (first: number, last: number, total: number | undefined) => string;
}
export function GLDataPagination({
  currentPage,
  pageSize,
  totalItems,
  rowCount,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
  mode = 'numbered',
  hasNext = false,
  labels,
}: {
  currentPage: number;
  pageSize: number;
  totalItems?: number;
  rowCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  isLoading?: boolean;
  mode?: 'numbered' | 'cursor';
  hasNext?: boolean;
  labels: PaginationLabels;
}) {
  const totalPages =
    totalItems === undefined ? undefined : Math.max(1, Math.ceil(totalItems / pageSize));
  const next = mode === 'cursor' ? hasNext : currentPage < (totalPages ?? 1);
  const start = rowCount ? (currentPage - 1) * pageSize + 1 : 0,
    end = rowCount ? start + rowCount - 1 : 0;
  const pages = totalPages
    ? Array.from(
        new Set([
          1,
          ...Array.from({ length: 5 }, (_, i) => currentPage + i - 2).filter(
            (p) => p > 1 && p < totalPages,
          ),
          totalPages,
        ]),
      ).sort((a, b) => a - b)
    : [];
  return (
    <nav className="gl-data-pagination" aria-label={labels.navigation} aria-busy={isLoading}>
      <p className="gl-data-pagination-range" role="status" aria-live="polite">
        {labels.range(start, end, totalItems)}
        {isLoading ? ' · ' + labels.loading : ''}
      </p>
      <div className="gl-data-pagination-controls">
        <GLButton
          variant="secondary"
          disabled={isLoading || currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          {labels.previous}
        </GLButton>
        {mode === 'numbered' && (
          <div className="gl-data-pagination-pages" dir="ltr">
            {pages.map((p, i) => (
              <span key={p}>
                {i > 0 && p > pages[i - 1]! + 1 && <span aria-hidden="true">…</span>}
                <GLButton
                  variant={p === currentPage ? 'primary' : 'ghost'}
                  aria-current={p === currentPage ? 'page' : undefined}
                  disabled={isLoading}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </GLButton>
              </span>
            ))}
          </div>
        )}
        <span
          className={
            'gl-data-pagination-current' + (mode === 'numbered' ? ' gl-data-pagination-mobile' : '')
          }
          dir="ltr"
          aria-current="page"
        >
          <bdi>
            {currentPage}
            {totalPages ? ' / ' + totalPages : ''}
          </bdi>
        </span>
        <GLButton
          variant="secondary"
          disabled={isLoading || !next}
          onClick={() => onPageChange(currentPage + 1)}
        >
          {labels.next}
        </GLButton>
      </div>
      <GLSelect
        label={labels.rows}
        value={String(pageSize)}
        disabled={isLoading}
        onChange={(size) => onPageSizeChange(Number(size))}
        options={[10, 25, 50, 100].map((n) => ({ value: String(n), label: String(n) }))}
      />
    </nav>
  );
}
