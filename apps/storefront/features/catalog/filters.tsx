import { useEffect, useState } from 'react';
import type { PublicFilterDefinition, PublicProductFilter } from '@golden-lift/api';
import { GLAlert, GLButton, GLInput, GLSelect } from '@golden-lift/ui';
import { useGLTranslation, useLocale } from '@golden-lift/i18n';

export function DynamicFilters({
  definitions,
  value,
  onApply,
}: {
  definitions: readonly PublicFilterDefinition[];
  value: readonly PublicProductFilter[];
  onApply: (value: readonly PublicProductFilter[]) => void;
}) {
  const { t } = useGLTranslation(),
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
      } else next[item.definitionId] = item.kind === 'CHOICE' ? item.optionId : String(item.value);
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
      className="gl-dynamic-filters"
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
                  ? { definitionId: d.id, kind: 'CHOICE', optionId: draft[d.id]! }
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
              <GLInput label={words.min} inputMode="decimal" {...field(d.id + ':min')} />
              <GLInput label={words.max} inputMode="decimal" {...field(d.id + ':max')} />
            </fieldset>
          ) : d.kind === 'TEXT' ? (
            <GLInput label={d.label} maxLength={200} {...field(d.id)} />
          ) : (
            <GLSelect
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
      {error && <GLAlert tone="error">{t('errorBody')}</GLAlert>}
      <GLButton type="submit" variant="secondary">
        {t('filter')}
      </GLButton>
      <GLButton
        variant="text"
        onClick={() => {
          setDraft({});
          setError(false);
          onApply([]);
        }}
      >
        {t('clear')}
      </GLButton>
    </form>
  );
}
