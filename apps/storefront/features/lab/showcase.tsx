import { useState } from 'react';
import type { ReactNode } from 'react';
import { colors, palette, space, radius, shadows, typography } from '@business-platform/tokens';
import type { TypographyRole } from '@business-platform/tokens';
import {
  BPPageContainer,
  BPHeading,
  BPText,
  BPButton,
  BPIconButton,
  BPInput,
  BPTextarea,
  BPSelect,
  BPCombobox,
  BPCheckbox,
  BPRadio,
  BPSwitch,
  BPBreadcrumb,
  BPTabs,
  BPPagination,
  BPModal,
  BPDrawer,
  BPAlert,
  BPToast,
  BPTooltip,
  BPSkeleton,
  BPEmptyState,
  BPBadge,
  BPChip,
  BPCard,
  BPTable,
  BPSearchField,
  BPCategoryNavigation,
  BPXStack,
  BPYStack,
} from '@business-platform/ui';
import type { ButtonSize, ButtonVariant } from '@business-platform/ui';
import { BPProductCard, BPCategoryCard, BPSpecificationTable } from '@business-platform/catalog-ui';
import { Search, Layers, Plus } from '@business-platform/icons';
import { useBPTranslation } from '@business-platform/i18n';
import { useProducts, useCategories } from '../catalog/queries';
import { useTitle } from '../catalog/pages';
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bp-lab-section">
      <BPHeading>{title}</BPHeading>
      {children}
    </section>
  );
}
export function ComponentLab() {
  useTitle('lab');
  const { t } = useBPTranslation(),
    [select, setSelect] = useState('one'),
    [combo, setCombo] = useState(''),
    [tab, setTab] = useState('overview'),
    [page, setPage] = useState(1),
    [modal, setModal] = useState(false),
    [drawer, setDrawer] = useState(false),
    [toast, setToast] = useState<string | null>(null),
    products = useProducts(),
    categories = useCategories();
  const options = [
    { value: 'one', label: t('choice1') },
    { value: 'two', label: t('choice2') },
  ];
  const variants: ButtonVariant[] = [
      'primary',
      'secondary',
      'neutral',
      'success',
      'warning',
      'dark',
      'light',
      'ghost',
      'text',
      'destructive',
    ],
    sizes: ButtonSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];
  return (
    <BPPageContainer>
      <BPBreadcrumb
        items={[
          { href: '/', label: t('home') },
          { href: '/component-lab', label: t('lab') },
        ]}
      />
      <div className="bp-section-heading">
        <div>
          <BPHeading level={1}>{t('lab')}</BPHeading>
          <p>{t('labBody')}</p>
        </div>
      </div>
      <Section title={t('palette')}>
        <div className="bp-lab-palette">
          {Object.entries(palette).map(([name, value]) => (
            <div key={name} className="bp-swatch">
              <div className="bp-swatch-color" style={{ background: value }} />
              <code>{name}</code>
              <code>{value}</code>
            </div>
          ))}
        </div>
      </Section>
      <Section title={t('semantic')}>
        <div className="bp-lab-palette">
          {Object.entries(colors).flatMap(([group, values]) =>
            Object.entries(values).map(([name, value]) => (
              <div key={group + name} className="bp-swatch">
                <div className="bp-swatch-color" style={{ background: value }} />
                <code>
                  {group}.{name}
                </code>
              </div>
            )),
          )}
        </div>
      </Section>
      <Section title={t('type')}>
        <BPYStack gap="$space4">
          {Object.keys(typography).map((role) => (
            <div key={role}>
              <code>{role} / </code>
              <BPText role={role as TypographyRole}>
                {t('example')} — Business Platform / ١٢٣
              </BPText>
            </div>
          ))}
        </BPYStack>
      </Section>
      <Section title={t('spacing')}>
        <BPYStack gap="$space3">
          {Object.entries(space).map(([name, value]) => (
            <div className="bp-row" key={name}>
              <code>
                {name}: {value}
              </code>
              <div style={{ width: value, height: 16, background: colors.action.primary }} />
            </div>
          ))}
        </BPYStack>
      </Section>
      <Section title={t('radii')}>
        <div className="bp-lab-row">
          {Object.entries(radius).map(([name, value]) => (
            <div key={name} className="bp-lab-surface" style={{ borderRadius: value }}>
              <code>{name}</code>
            </div>
          ))}
        </div>
      </Section>
      <Section title={t('shadows')}>
        <div className="bp-lab-row">
          {Object.entries(shadows).map(([name, value]) => (
            <div className="bp-lab-surface" style={{ boxShadow: value }} key={name}>
              <code>{name}</code>
            </div>
          ))}
        </div>
      </Section>
      <Section title={t('buttons')}>
        {variants.map((variant) => (
          <div key={variant}>
            <BPHeading level={3} role="heading6">
              {t(variant)}
            </BPHeading>
            {sizes.map((size) => (
              <div className="bp-lab-row" key={size}>
                <code>{size}</code>
                <BPButton variant={variant} size={size}>
                  <Plus size={18} aria-hidden="true" />
                  {t('default')}
                </BPButton>
                <BPButton variant={variant} size={size} className="lab-hover">
                  {t('example')}
                </BPButton>
                <BPButton variant={variant} size={size} className="lab-focus">
                  {t('focused')}
                </BPButton>
                <BPButton variant={variant} size={size} className="lab-pressed">
                  {t('filled')}
                </BPButton>
                <BPButton variant={variant} size={size} loading>
                  <Plus size={18} aria-hidden="true" />
                  {t('loadingState')}
                </BPButton>
                <BPButton variant={variant} size={size} disabled>
                  {t('disabled')}
                </BPButton>
              </div>
            ))}
          </div>
        ))}
        <BPIconButton label={t('search')} variant="dark">
          <Search size={20} />
        </BPIconButton>
      </Section>
      <Section title={t('fields')}>
        <div className="bp-lab-fields">
          <BPInput label={t('default')} help={t('help')} />
          <BPInput label={t('focused')} className="lab-focus" />
          <BPInput label={t('filled')} defaultValue={t('example')} />
          <BPInput label={t('disabled')} disabled />
          <BPInput label={t('readonly')} readOnly value={t('example')} />
          <BPInput label={t('error')} error={t('invalid')} />
          <BPInput label={t('success')} success={t('valid')} defaultValue={t('example')} />
          <BPTextarea label={t('notes')} help={t('help')} />
          <BPSelect label={t('select')} value={select} onChange={setSelect} options={options} />
          <BPCombobox label={t('search')} value={combo} onChange={setCombo} options={options} />
          <BPSearchField label={t('searchHelp')} />
        </div>
      </Section>
      <Section title={t('controls')}>
        <BPXStack gap="$space6" flexWrap="wrap">
          <BPCheckbox label={t('checkbox')} />
          <BPCheckbox label={t('checked')} defaultChecked />
          <BPRadio label={t('choice1')} name="lab-radio" defaultChecked />
          <BPRadio label={t('choice2')} name="lab-radio" />
          <BPSwitch label={t('switch')} />
        </BPXStack>
      </Section>
      <Section title={t('cards')}>
        <div className="bp-grid">
          {products.data?.items.slice(0, 2).map((p) => (
            <BPProductCard key={p.id} product={p} />
          ))}
          {categories.data?.items.slice(0, 2).map((c) => (
            <BPCategoryCard key={c.id} category={c} />
          ))}
        </div>
        <BPCard>
          <BPText>{t('example')}</BPText>
        </BPCard>
        {products.data?.items[0] && (
          <BPSpecificationTable attributes={products.data.items[0].attributes} />
        )}
      </Section>
      <Section title={t('navigation')}>
        <BPBreadcrumb
          items={[
            { href: '/', label: t('home') },
            { href: '/products', label: t('products') },
            { href: '/component-lab', label: t('lab') },
          ]}
        />
        <BPCategoryNavigation
          links={[
            { href: '/products', label: t('products') },
            { href: '/categories', label: t('categories') },
          ]}
        />
        <BPTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: t('tab1') },
            { id: 'details', label: t('tab2') },
          ]}
        />
        <div role="tabpanel" id={'panel-' + tab} aria-labelledby={'tab-' + tab} tabIndex={0}>
          {t(tab === 'overview' ? 'tab1' : 'tab2')}
        </div>
        <BPPagination page={page} total={4} onChange={setPage} />
      </Section>
      <Section title={t('overlays')}>
        <div className="bp-lab-row">
          <BPButton onClick={() => setModal(true)}>{t('showModal')}</BPButton>
          <BPButton variant="secondary" onClick={() => setDrawer(true)}>
            {t('showDrawer')}
          </BPButton>
          <BPTooltip label={t('tooltip')}>
            <Layers size={24} />
          </BPTooltip>
        </div>
        <BPModal open={modal} onClose={() => setModal(false)} title={t('modalTitle')}>
          <p>{t('modalBody')}</p>
          <BPInput label={t('name')} />
          <BPButton onClick={() => setModal(false)}>{t('close')}</BPButton>
        </BPModal>
        <BPDrawer open={drawer} onClose={() => setDrawer(false)} title={t('drawerTitle')}>
          <a href="/products">{t('products')}</a>
        </BPDrawer>
      </Section>
      <Section title={t('feedback')}>
        <div className="bp-lab-row">
          <BPBadge>{t('example')}</BPBadge>
          <BPBadge tone="gold">{t('notice')}</BPBadge>
          <BPChip onRemove={() => setToast(t('toastBody'))} label={t('close')}>
            {t('example')}
          </BPChip>
        </div>
        <div className="bp-lab-fields">
          {(['info', 'warning', 'success', 'error'] as const).map((tone) => (
            <BPAlert tone={tone} key={tone}>
              {t('alertBody')}
            </BPAlert>
          ))}
        </div>
        <BPButton variant="secondary" onClick={() => setToast(t('toastBody'))}>
          {t('showToast')}
        </BPButton>
        <BPToast message={toast} onClose={() => setToast(null)} />
        <BPSkeleton />
        <BPEmptyState title={t('emptyTitle')} description={t('emptyBody')} />
      </Section>
      <Section title={t('responsive')}>
        <BPTable
          columns={[t('name'), t('technical')]}
          rows={[
            [t('small'), '4 / 16px'],
            [t('example'), '8 / 20px'],
            [t('large'), '12 / 24px'],
          ]}
        />
      </Section>
    </BPPageContainer>
  );
}
