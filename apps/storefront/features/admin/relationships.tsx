import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { namedSchema, pageSchema } from '@business-platform/api';
import { useLocale } from '@business-platform/i18n';
import { ArrowUp, ArrowDown, Save, Plus } from '@business-platform/icons';
import {
  BPButton,
  BPCheckbox,
  BPInput,
  BPFormSection,
  BPModal,
  BPAlert,
} from '@business-platform/ui';
import { useStaffApi, useUnsaved, StaffError, useConfirmDiscard } from './context';
import { FocusedEditor, ActionFeedback, useAction, jsonResponse } from './common';
import { useAdminTranslation } from './translations';

const membershipSchema = z.object({ version: z.string(), orderedIds: z.array(z.string().uuid()) });
const impactSchema = z.object({
  precondition: z.string(),
  affectedProductCount: z.string(),
  invalidProductCount: z.string(),
  removedAttributeIds: z.array(z.string()),
  addedAttributeIds: z.array(z.string()),
  blockers: z.array(z.string()),
  valuesRetained: z.boolean(),
});
export function RelationshipSelection({
  resource,
  value,
  onChange,
  disabled = false,
  ordered = true,
}: {
  resource: 'attribute-groups' | 'attributes';
  value: readonly string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  ordered?: boolean;
}) {
  const api = useStaffApi(),
    { locale } = useLocale(),
    t = useAdminTranslation();
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const list = useQuery({
    queryKey: ['staff', 'relationship-options', resource, search, page],
    queryFn: ({ signal }) =>
      api.request(
        `/admin/${resource}?page=${page}&pageSize=25${search.trim() ? '&q=' + encodeURIComponent(search.trim()) : ''}&state=active`,
        pageSchema(namedSchema),
        undefined,
        'GET',
        signal,
      ),
  });
  const selected = useQuery({
    queryKey: ['staff', 'relationship-labels', resource, value],
    queryFn: async ({ signal }) => {
      const rows: z.infer<typeof namedSchema>[] = [];
      // Bound parallel detail reads; selections outside the current search/page keep their names.
      for (let offset = 0; offset < value.length; offset += 10)
        rows.push(
          ...(await Promise.all(
            value
              .slice(offset, offset + 10)
              .map((id) =>
                api.request(`/admin/${resource}/${id}`, namedSchema, undefined, 'GET', signal),
              ),
          )),
        );
      return rows;
    },
    enabled: value.length > 0,
  });
  useEffect(() => {
    if (list.data || selected.data)
      setLabels((previous) => ({
        ...previous,
        ...Object.fromEntries(
          [...(list.data?.items ?? []), ...(selected.data ?? [])].map((x) => [
            x.id,
            x.translations.find((t) => t.locale === locale)?.name ??
              x.translations.find((t) => t.locale === 'ar')?.name ??
              x.code,
          ]),
        ),
      }));
  }, [list.data, selected.data, locale]);
  function move(index: number, delta: number) {
    const next = [...value];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    onChange(next);
  }
  const SelectionList = ordered ? 'ol' : 'ul';
  return (
    <BPFormSection title={resource === 'attributes' ? t('attributes') : t('groups')}>
      <BPInput
        label={t('search')}
        type="search"
        onClear={() => {
          setSearch('');
          setPage(1);
        }}
        value={search}
        disabled={disabled}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      {list.isPending && <p role="status">{t('loading')}</p>}
      {list.error && <StaffError error={list.error} reload={() => void list.refetch()} />}
      {selected.error && (
        <StaffError error={selected.error} reload={() => void selected.refetch()} />
      )}
      <div className="bp-membership-options">
        {list.data?.items.map((row) => (
          <BPCheckbox
            key={row.id}
            label={labels[row.id] ?? row.code}
            checked={value.includes(row.id)}
            disabled={disabled}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, row.id] : value.filter((id) => id !== row.id))
            }
          />
        ))}
      </div>
      {list.data && (list.data.totalItems ?? 0) > 25 && (
        <div className="bp-dialog-actions">
          <BPButton
            variant="secondary"
            disabled={page === 1 || disabled}
            onClick={() => setPage(page - 1)}
          >
            {t('previous')}
          </BPButton>
          <span>
            {page} / {Math.ceil((list.data.totalItems ?? 0) / 25)}
          </span>
          <BPButton
            variant="secondary"
            disabled={page * 25 >= (list.data.totalItems ?? 0) || disabled}
            onClick={() => setPage(page + 1)}
          >
            {t('next')}
          </BPButton>
        </div>
      )}
      <SelectionList className="bp-membership-order">
        {value.map((id, index) => (
          <li key={id}>
            <span>{labels[id] ?? id}</span>
            {ordered && (
              <BPButton
                variant="ghost"
                aria-label={t('previous') + ' — ' + (labels[id] ?? id)}
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={18} />
              </BPButton>
            )}
            {ordered && (
              <BPButton
                variant="ghost"
                aria-label={t('next') + ' — ' + (labels[id] ?? id)}
                disabled={disabled || index === value.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={18} />
              </BPButton>
            )}
            <BPButton
              variant="ghost"
              disabled={disabled}
              onClick={() => onChange(value.filter((x) => x !== id))}
            >
              {t('detach')}
            </BPButton>
          </li>
        ))}
      </SelectionList>
    </BPFormSection>
  );
}
export function RelationshipEditor({
  resource,
  id,
}: {
  resource: 'categories' | 'attribute-groups' | 'attributes';
  id: string;
}) {
  const [open, setOpen] = useState(false);
  const t = useAdminTranslation();
  return (
    <>
      <BPButton variant="secondary" onClick={() => setOpen(true)}>
        <Plus size={18} />
        {resource === 'attribute-groups' ? t('attributes') : t('groups')}
      </BPButton>
      {open && (
        <RelationshipEditorBody resource={resource} id={id} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
function RelationshipEditorBody({
  resource,
  id,
  onClose,
}: {
  resource: 'categories' | 'attribute-groups' | 'attributes';
  id: string;
  onClose: () => void;
}) {
  const api = useStaffApi(),
    t = useAdminTranslation(),
    query = useQueryClient(),
    confirmDiscard = useConfirmDiscard(),
    action = useAction('configuration');
  const path = `/admin/${resource}/${id}/memberships`;
  const state = useQuery({
    queryKey: ['staff', 'memberships', resource, id],
    queryFn: ({ signal }) => api.request(path, membershipSchema, undefined, 'GET', signal),
  });
  const [draft, setDraft] = useState<string[] | null>(null),
    [baseline, setBaseline] = useState<z.infer<typeof membershipSchema> | null>(null),
    [review, setReview] = useState<{
      impact: z.infer<typeof impactSchema>;
      orderedIds: string[];
      version: string;
    } | null>(null);
  useEffect(() => {
    if (state.data && !baseline) {
      setBaseline(state.data);
      setDraft(state.data.orderedIds);
    }
  }, [state.data, baseline]);
  const dirty = Boolean(
    draft &&
    baseline &&
    JSON.stringify(resource === 'attributes' ? [...draft].sort() : draft) !==
      JSON.stringify(
        resource === 'attributes' ? [...baseline.orderedIds].sort() : baseline.orderedIds,
      ),
  );
  useUnsaved(dirty);
  return (
    <FocusedEditor
      dialog
      open
      title={resource === 'attribute-groups' ? t('attributes') : t('groups')}
      dirty={dirty}
      pending={action.isPending}
      onClose={onClose}
    >
      {state.error && <StaffError error={state.error} />}
      {draft && baseline && (
        <>
          <RelationshipSelection
            resource={resource === 'attribute-groups' ? 'attributes' : 'attribute-groups'}
            value={draft}
            onChange={setDraft}
            disabled={action.isPending}
            ordered={resource !== 'attributes'}
          />
          <ActionFeedback
            action={action}
            reload={async () => {
              if (!dirty || (await confirmDiscard())) {
                const latest = await state.refetch();
                if (latest.data) {
                  setBaseline(latest.data);
                  setDraft(latest.data.orderedIds);
                  setReview(null);
                  action.reset();
                }
              }
            }}
          />
          <BPButton
            variant="secondary"
            disabled={action.isPending}
            onClick={async () => {
              if (!dirty || (await confirmDiscard())) onClose();
            }}
          >
            {t('cancel')}
          </BPButton>
          <BPButton
            disabled={!dirty}
            loading={action.isPending}
            onClick={() =>
              action.mutate(
                () =>
                  api.request(
                    path + '/preview',
                    impactSchema,
                    { orderedIds: draft, expectedVersion: baseline.version },
                    'POST',
                  ),
                {
                  onSuccess: (value) => {
                    setReview({
                      impact: impactSchema.parse(value),
                      orderedIds: [...draft],
                      version: baseline.version,
                    });
                    action.setSaved(false);
                  },
                },
              )
            }
          >
            <Save size={18} />
            {t('save')}
          </BPButton>
        </>
      )}
      <BPModal
        open={!!review}
        title={t('impact')}
        onClose={() => {
          if (!action.isPending) setReview(null);
        }}
      >
        {review && (
          <>
            <p>
              {t('products')}: {review.impact.affectedProductCount}
            </p>
            <p>
              {t('attributes')}: +{review.impact.addedAttributeIds.length} / −
              {review.impact.removedAttributeIds.length}
            </p>
            <p>{t('retainedValues')}</p>
            {review.impact.blockers.map((b) => (
              <BPAlert key={b} tone="error">
                {b}
              </BPAlert>
            ))}
            <BPButton
              variant="secondary"
              disabled={action.isPending}
              onClick={() => setReview(null)}
            >
              {t('cancel')}
            </BPButton>
            <BPButton
              loading={action.isPending}
              disabled={review.impact.blockers.length > 0}
              onClick={() =>
                action.mutate(
                  () =>
                    api.request(
                      path,
                      jsonResponse,
                      {
                        orderedIds: review.orderedIds,
                        expectedVersion: review.version,
                        precondition: review.impact.precondition,
                        confirm: true,
                      },
                      'POST',
                    ),
                  {
                    onSuccess: async () => {
                      setDraft(null);
                      setReview(null);
                      await query.invalidateQueries({ queryKey: ['staff'] });
                      onClose();
                    },
                  },
                )
              }
            >
              <Save size={18} />
              {t('confirm')}
            </BPButton>
            <ActionFeedback action={action} />
          </>
        )}
      </BPModal>
    </FocusedEditor>
  );
}
