import { GLSelect, GLCheckbox, GLInput, GLFormSection } from '@golden-lift/ui';
import { useAdminTranslation } from './translations';
import { MoreOptions } from './common';

export function AttributeKind({
  kind,
  setKind,
}: {
  kind: string;
  setKind: (value: string) => void;
}) {
  const t = useAdminTranslation();
  return (
    <GLSelect
      label={t('type')}
      value={kind}
      onChange={setKind}
      options={['NUMBER', 'BOOLEAN', 'TEXT', 'CHOICE'].map((value) => ({
        value,
        label: t(value.toLowerCase() as 'number' | 'boolean' | 'text' | 'choice'),
      }))}
    />
  );
}

export function AttributeConstraints({
  kind,
  unit,
  minimum,
  maximum,
  multiple,
  multiline,
  maxLength,
  setUnit,
  setMinimum,
  setMaximum,
  setMultiple,
  setMultiline,
  setMaxLength,
  units,
}: {
  kind: string;
  unit: string;
  minimum: string;
  maximum: string;
  multiple: boolean;
  multiline: boolean;
  maxLength: string;
  setUnit: (value: string) => void;
  setMinimum: (value: string) => void;
  setMaximum: (value: string) => void;
  setMultiple: (value: boolean) => void;
  setMultiline: (value: boolean) => void;
  setMaxLength: (value: string) => void;
  units: {
    items: readonly { code: string; symbol: string }[];
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => Promise<unknown>;
  };
}) {
  const t = useAdminTranslation();
  return (
    <GLFormSection title={t('constraints')}>
      <div className="gl-admin-grid">
        {kind === 'NUMBER' && (
          <>
            <GLSelect
              label={t('unit')}
              value={unit}
              onChange={setUnit}
              options={[
                { value: '', label: t('choose') },
                ...units.items.map((item) => ({
                  value: item.code,
                  label: `${item.code} (${item.symbol})`,
                })),
              ]}
            />
            <MoreOptions query={units} label={t('unit')} />
            <GLInput
              label={t('minimum')}
              value={minimum}
              onChange={(e) => setMinimum(e.target.value)}
            />
            <GLInput
              label={t('maximum')}
              value={maximum}
              onChange={(e) => setMaximum(e.target.value)}
            />
          </>
        )}
        {kind === 'CHOICE' && (
          <GLCheckbox
            label={t('multiple')}
            checked={multiple}
            onChange={(e) => setMultiple(e.target.checked)}
          />
        )}
        {kind === 'TEXT' && (
          <>
            <GLCheckbox
              label={t('multiline')}
              checked={multiline}
              onChange={(e) => setMultiline(e.target.checked)}
            />
            <GLInput
              label={t('maxLength')}
              value={maxLength}
              onChange={(e) => setMaxLength(e.target.value)}
            />
          </>
        )}
        {kind === 'BOOLEAN' && <p>{t('boolean')}</p>}
      </div>
    </GLFormSection>
  );
}

export function AttributeVisibility({
  pub,
  filterable,
  setPub,
  setFilterable,
}: {
  pub: boolean;
  filterable: boolean;
  setPub: (value: boolean) => void;
  setFilterable: (value: boolean) => void;
}) {
  const t = useAdminTranslation();
  return (
    <GLFormSection title={t('visibility')}>
      <div className="gl-admin-grid">
        <GLCheckbox label={t('public')} checked={pub} onChange={(e) => setPub(e.target.checked)} />
        <GLCheckbox
          label={t('filterable')}
          checked={filterable}
          onChange={(e) => setFilterable(e.target.checked)}
        />
      </div>
    </GLFormSection>
  );
}
