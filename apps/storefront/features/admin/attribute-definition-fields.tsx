import { BPSelect, BPCheckbox, BPInput, BPFormSection } from '@business-platform/ui';
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
    <BPSelect
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
    <BPFormSection title={t('constraints')}>
      <div className="bp-admin-grid">
        {kind === 'NUMBER' && (
          <>
            <BPSelect
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
            <BPInput
              label={t('minimum')}
              value={minimum}
              onChange={(e) => setMinimum(e.target.value)}
            />
            <BPInput
              label={t('maximum')}
              value={maximum}
              onChange={(e) => setMaximum(e.target.value)}
            />
          </>
        )}
        {kind === 'CHOICE' && (
          <BPCheckbox
            label={t('multiple')}
            checked={multiple}
            onChange={(e) => setMultiple(e.target.checked)}
          />
        )}
        {kind === 'TEXT' && (
          <>
            <BPCheckbox
              label={t('multiline')}
              checked={multiline}
              onChange={(e) => setMultiline(e.target.checked)}
            />
            <BPInput
              label={t('maxLength')}
              value={maxLength}
              onChange={(e) => setMaxLength(e.target.value)}
            />
          </>
        )}
        {kind === 'BOOLEAN' && <p>{t('boolean')}</p>}
      </div>
    </BPFormSection>
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
    <BPFormSection title={t('visibility')}>
      <div className="bp-admin-grid">
        <BPCheckbox label={t('public')} checked={pub} onChange={(e) => setPub(e.target.checked)} />
        <BPCheckbox
          label={t('filterable')}
          checked={filterable}
          onChange={(e) => setFilterable(e.target.checked)}
        />
      </div>
    </BPFormSection>
  );
}
