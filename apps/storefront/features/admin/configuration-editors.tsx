import { useEffect, useState } from 'react';
import { useUnsaved } from './context';
import { useForm } from 'react-hook-form';
import { GLButton, GLCheckbox, GLInput, GLSelect } from '@golden-lift/ui';
import { ReviewedChange } from './reviewed-change';
import { TranslationFields, translationDefaults, translationInput } from './common';
import type { TranslationForm } from './common';
import { useAdminTranslation } from './translations';
type Translation = { locale: 'ar' | 'en' | 'ckb'; name: string; description: string | null };
export function OptionEditor({
  option,
}: {
  option: {
    id: string;
    code: string;
    version: string;
    sortOrder: string;
    translations: Translation[];
  };
}) {
  const t = useAdminTranslation(),
    form = useForm<TranslationForm>({ defaultValues: translationDefaults(option.translations) }),
    [order, setOrder] = useState(option.sortOrder);
  useUnsaved(form.formState.isDirty || order !== option.sortOrder);
  return (
    <details>
      <summary>
        {t('edit')} — {option.code}
      </summary>
      <TranslationFields form={form} />
      <GLInput label={t('order')} value={order} onChange={(e) => setOrder(e.target.value)} />
      <ReviewedChange
        path={`/admin/attribute-options/${option.id}`}
        version={option.version}
        schemaRevision={null}
        change={{
          kind: 'option.update',
          option: {
            code: option.code,
            translations: translationInput(form.watch()),
            sortOrder: order,
          },
        }}
        label={t('save')}
        onSaved={() => form.reset(form.getValues())}
      />
    </details>
  );
}
type Assignment = {
  id: string;
  definition: { id: string; code: string };
  groupPlacementId: string | null;
  sortOrder: string;
  required: boolean;
  public: boolean;
  filterable: boolean;
  searchable: boolean;
  comparable: boolean;
};
export function AssignmentEditor({
  path,
  version,
  revision,
  assignment,
  groups,
}: {
  path: string;
  version: string;
  revision: string;
  assignment: Assignment;
  groups: { id: string; group: { code: string } }[];
}) {
  const t = useAdminTranslation(),
    [value, setValue] = useState(assignment);
  useUnsaved(JSON.stringify(value) !== JSON.stringify(assignment));
  return (
    <details>
      <summary>
        {t('edit')} — {assignment.definition.code}
      </summary>
      <GLSelect
        label={t('group')}
        value={value.groupPlacementId ?? ''}
        options={[
          { value: '', label: t('all') },
          ...groups.map((g) => ({ value: g.id, label: g.group.code })),
        ]}
        onChange={(groupPlacementId) =>
          setValue({ ...value, groupPlacementId: groupPlacementId || null })
        }
      />
      <GLInput
        label={t('order')}
        value={value.sortOrder}
        onChange={(e) => setValue({ ...value, sortOrder: e.target.value })}
      />
      {(['required', 'public', 'filterable'] as const).map((flag) => (
        <GLCheckbox
          key={flag}
          label={t(flag)}
          checked={value[flag]}
          onChange={(e) => setValue({ ...value, [flag]: e.target.checked })}
        />
      ))}
      <ReviewedChange
        path={path}
        version={version}
        schemaRevision={revision}
        change={{
          kind: 'assignment.put',
          assignmentId: assignment.id,
          assignment: {
            definitionId: assignment.definition.id,
            groupPlacementId: value.groupPlacementId,
            sortOrder: value.sortOrder,
            required: value.required,
            public: value.public,
            filterable: value.filterable,
            searchable: value.searchable,
            comparable: value.comparable,
          },
        }}
        label={t('save')}
      />
    </details>
  );
}
export function OrderEditor({
  path,
  version,
  revision,
  collection,
  items,
}: {
  path: string;
  version: string;
  revision: string;
  collection: 'groups' | 'attributes';
  items: { id: string; label: string }[];
}) {
  const t = useAdminTranslation(),
    [order, setOrder] = useState(items.map((x) => x.id));
  const [baseline, setBaseline] = useState(order);
  const dirty = JSON.stringify(order) !== JSON.stringify(baseline);
  const incoming = JSON.stringify(items.map((item) => item.id));
  useUnsaved(dirty);
  useEffect(() => {
    if (dirty) return;
    const next: string[] = JSON.parse(incoming);
    setOrder(next);
    setBaseline(next);
  }, [incoming]);
  function move(index: number, step: number) {
    const next = [...order],
      target = index + step;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
  }
  return (
    <details>
      <summary>
        {t(collection)} — {t('order')}
      </summary>
      {order.map((id, index) => (
        <div key={id}>
          {items.find((x) => x.id === id)?.label}
          <GLButton variant="ghost" disabled={index === 0} onClick={() => move(index, -1)}>
            {t('up')}
          </GLButton>
          <GLButton
            variant="ghost"
            disabled={index === order.length - 1}
            onClick={() => move(index, 1)}
          >
            {t('down')}
          </GLButton>
        </div>
      ))}
      <ReviewedChange
        path={path}
        version={version}
        schemaRevision={revision}
        change={{ kind: 'type.order', collection, orderedIds: order }}
        label={t('reorder')}
        onSaved={() => setBaseline([...order])}
      />
    </details>
  );
}
