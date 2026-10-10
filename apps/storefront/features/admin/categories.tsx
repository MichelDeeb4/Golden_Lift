import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { categoryPageSchema, categorySchema } from '@business-platform/api';
import { useLocale } from '@business-platform/i18n';
import { BPButton, BPAlert } from '@business-platform/ui';
import { useStaffApi } from './context';
import { useAdminTranslation } from './translations';
import { TableState } from './common';
import { CategoryTree, hasCategoryChildren } from './category-tree';
export { Categories } from './category-workspace';
function BranchCategoryPicker({
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
      <BPButton
        variant="secondary"
        onClick={() => {
          setParent(null);
          setTrail([]);
          setCursor('');
        }}
      >
        {t('root')}
      </BPButton>
      {trail.map((entry, index) => (
        <BPButton
          key={entry.id}
          variant="text"
          onClick={() => {
            setParent(entry.id);
            setCursor('');
            setTrail(trail.slice(0, index + 1));
          }}
        >
          {entry.name}
        </BPButton>
      ))}
      {!leaf && (
        <BPButton onClick={() => onSelect(null)}>
          {t('select')} — {t('root')}
        </BPButton>
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
                  <BPButton
                    variant="text"
                    onClick={() => {
                      setParent(c.id);
                      setTrail([...trail, { id: c.id, name: c.name }]);
                      setCursor('');
                    }}
                  >
                    {c.name} ({c.activeChildCount})
                  </BPButton>
                </td>
                <td>
                  <BPButton
                    disabled={leaf ? !c.canAddProducts : !c.canAddChildren}
                    onClick={() => onSelect(c)}
                  >
                    {t('select')}
                  </BPButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableState>
      {rows.data?.nextCursor && (
        <BPButton onClick={() => setCursor(rows.data!.nextCursor!)}>{t('next')}</BPButton>
      )}
    </>
  );
}

export function CategoryPicker({
  onSelect,
  leaf = false,
}: {
  onSelect: (category: z.infer<typeof categorySchema> | null) => void;
  leaf?: boolean;
}) {
  const t = useAdminTranslation();
  const [expanded, setExpanded] = useState(new Set<string>()),
    [warning, setWarning] = useState(false);
  if (!leaf) return <BranchCategoryPicker onSelect={onSelect} />;
  return (
    <>
      <p>{t('chooseLeafCategory')}</p>
      {warning && <BPAlert tone="warning">{t('leafCategoryOnly')}</BPAlert>}
      <CategoryTree
        expanded={expanded}
        onExpanded={setExpanded}
        pending={false}
        onSelect={(category) => {
          if (!category.canAddProducts || hasCategoryChildren(category)) {
            setWarning(true);
            setExpanded((previous) => new Set([...previous, category.id]));
            return;
          }
          setWarning(false);
          onSelect(category);
        }}
      />
    </>
  );
}
