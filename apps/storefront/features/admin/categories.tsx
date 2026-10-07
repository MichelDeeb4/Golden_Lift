import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { categoryPageSchema, categorySchema } from '@golden-lift/api';
import { useLocale } from '@golden-lift/i18n';
import { GLButton, GLAlert } from '@golden-lift/ui';
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
      {warning && <GLAlert tone="warning">{t('leafCategoryOnly')}</GLAlert>}
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
