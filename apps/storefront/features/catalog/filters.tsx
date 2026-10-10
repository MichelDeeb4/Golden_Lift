import { useEffect, useState } from 'react';
import type { PublicFilterDefinition, PublicProductFilter } from '@business-platform/api';
import { BPAlert, BPButton, BPInput, BPSelect } from '@business-platform/ui';
import { useCategories } from './queries';
import type { Category } from '@business-platform/api';
import { useBPTranslation, useLocale } from '@business-platform/i18n';

export function DynamicFilters({
  definitions,
  value,
  onApply,
}: {
  definitions: readonly PublicFilterDefinition[];
  value: readonly PublicProductFilter[];
  onApply: (value: readonly PublicProductFilter[]) => void;
}) {
  const { t } = useBPTranslation(),
    { locale } = useLocale();
  const [draft, setDraft] = useState<Record<string, string>>({}),
    [error, setError] = useState(false);
  const serialized = JSON.stringify(value);
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const item of JSON.parse(serialized) as PublicProductFilter[]) {
      if (item.kind === 'NUMBER') {
        next[item.definitionId + ':min'] = item.minimum ?? '';
        next[item.definitionId + ':max'] = item.maximum ?? '';
      } else
        next[item.definitionId] =
          item.kind === 'CHOICE'
            ? JSON.stringify('optionIds' in item ? item.optionIds : [item.optionId])
            : String(item.value);
    }
    setDraft(next);
    setError(false);
  }, [serialized]);
  if (!definitions.length) return null;
  const field = (key: string) => ({
    value: draft[key] ?? '',
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setDraft({ ...draft, [key]: event.target.value }),
  });
  const words =
    locale === 'en'
      ? { min: 'Minimum', max: 'Maximum', yes: 'Yes', no: 'No' }
      : locale === 'ckb'
        ? { min: 'کەمترین', max: 'زۆرترین', yes: 'بەڵێ', no: 'نەخێر' }
        : { min: 'الحد الأدنى', max: 'الحد الأعلى', yes: 'نعم', no: 'لا' };
  return (
    <form
      className="bp-dynamic-filters"
      onSubmit={(event) => {
        event.preventDefault();
        const filters: PublicProductFilter[] = [];
        for (const d of definitions) {
          if (d.kind === 'NUMBER') {
            const minimum = draft[d.id + ':min']?.trim(),
              maximum = draft[d.id + ':max']?.trim();
            if (!minimum && !maximum) continue;
            if (
              [minimum, maximum].some(
                (v) => v && !/^-?(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/.test(v),
              )
            ) {
              setError(true);
              return;
            }
            filters.push({
              definitionId: d.id,
              kind: 'NUMBER',
              ...(minimum ? { minimum } : {}),
              ...(maximum ? { maximum } : {}),
            });
          } else if (draft[d.id]) {
            filters.push(
              d.kind === 'BOOLEAN'
                ? { definitionId: d.id, kind: 'BOOLEAN', value: draft[d.id] === 'true' }
                : d.kind === 'CHOICE'
                  ? {
                      definitionId: d.id,
                      kind: 'CHOICE',
                      optionIds: JSON.parse(draft[d.id]!) as string[],
                    }
                  : { definitionId: d.id, kind: 'TEXT', value: draft[d.id]!.trim() },
            );
          }
        }
        setError(false);
        onApply(filters);
      }}
    >
      {definitions.map((d) => (
        <div key={d.id}>
          {d.kind === 'NUMBER' ? (
            <fieldset>
              <legend>
                {d.label}
                {d.unitSymbol ? ' (' + d.unitSymbol + ')' : ''}
              </legend>
              <BPInput label={words.min} inputMode="decimal" {...field(d.id + ':min')} />
              <BPInput label={words.max} inputMode="decimal" {...field(d.id + ':max')} />
            </fieldset>
          ) : d.kind === 'TEXT' ? (
            <BPInput label={d.label} maxLength={200} {...field(d.id)} />
          ) : d.kind === 'CHOICE' ? (
            <fieldset className="bp-choice-options">
              <legend>{d.label}</legend>
              {d.options.map((o) => {
                const selected = JSON.parse(draft[d.id] || '[]') as string[];
                return (
                  <label key={o.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(o.id)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...selected, o.id]
                          : selected.filter((id) => id !== o.id);
                        setDraft({ ...draft, [d.id]: next.length ? JSON.stringify(next) : '' });
                      }}
                    />
                    {o.label}
                  </label>
                );
              })}
            </fieldset>
          ) : (
            <BPSelect
              label={d.label}
              value={draft[d.id] ?? ''}
              onChange={(v) => setDraft({ ...draft, [d.id]: v })}
              options={[
                { value: '', label: t('clear') },
                ...(d.kind === 'BOOLEAN'
                  ? [
                      { value: 'true', label: words.yes },
                      { value: 'false', label: words.no },
                    ]
                  : d.options.map((o) => ({ value: o.id, label: o.label }))),
              ]}
            />
          )}
        </div>
      ))}
      {error && <BPAlert tone="error">{t('errorBody')}</BPAlert>}
      <BPButton type="submit" variant="secondary">
        {t('filter')}
      </BPButton>
      <BPButton
        variant="text"
        onClick={() => {
          setDraft({});
          setError(false);
          onApply([]);
        }}
      >
        {t('clear')}
      </BPButton>
    </form>
  );
}

export function CategoryFilterPanel({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useBPTranslation(),
    [cursor, setCursor] = useState<string | undefined>(),
    q = useCategories(null, cursor);
  return (
    <fieldset className="bp-category-filter">
      <legend>{t('categories')}</legend>
      <BPButton variant="text" aria-pressed={!value} onClick={() => onChange('')}>
        {t('allCategories')}
      </BPButton>
      {q.isError ? (
        <BPAlert tone="error">
          {t('errorBody')}
          <BPButton onClick={() => void q.refetch()}>{t('retry')}</BPButton>
        </BPAlert>
      ) : (
        <ul>
          {q.data?.items.map((c) => (
            <CategoryFilterNode key={c.id} category={c} value={value} onChange={onChange} />
          ))}
        </ul>
      )}
      {q.isPending && <p>{t('loading')}</p>}
      {q.data?.nextCursor && (
        <BPButton onClick={() => setCursor(q.data?.nextCursor ?? undefined)}>
          {t('loadMore')}
        </BPButton>
      )}
    </fieldset>
  );
}
function CategoryFilterNode({
  category,
  value,
  onChange,
}: {
  category: Category;
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useBPTranslation(),
    [open, setOpen] = useState(false),
    [cursor, setCursor] = useState<string | undefined>(),
    q = useCategories(category.id, cursor, open);
  return (
    <li>
      <div>
        <button
          type="button"
          aria-pressed={value === category.id}
          onClick={() => onChange(category.id)}
        >
          {category.name}
        </button>
        <button
          type="button"
          aria-label={t('viewCategories') + ' — ' + category.name}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? '−' : '+'}
        </button>
      </div>
      {open &&
        (q.isPending ? (
          <p>{t('loading')}</p>
        ) : q.isError ? (
          <BPAlert tone="error">
            {t('errorBody')}
            <BPButton onClick={() => void q.refetch()}>{t('retry')}</BPButton>
          </BPAlert>
        ) : (
          <>
            <ul>
              {q.data?.items.map((c) => (
                <CategoryFilterNode key={c.id} category={c} value={value} onChange={onChange} />
              ))}
            </ul>
            {q.data?.nextCursor && (
              <BPButton onClick={() => setCursor(q.data?.nextCursor ?? undefined)}>
                {t('loadMore')}
              </BPButton>
            )}
          </>
        ))}
    </li>
  );
}
