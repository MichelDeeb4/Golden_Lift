import { useState } from 'react';
import type { ReactNode } from 'react';
import { colors, palette, space, radius, shadows, typography } from '@golden-lift/tokens';
import type { TypographyRole } from '@golden-lift/tokens';
import {
  GLPageContainer,
  GLHeading,
  GLText,
  GLButton,
  GLIconButton,
  GLInput,
  GLTextarea,
  GLSelect,
  GLCombobox,
  GLCheckbox,
  GLRadio,
  GLSwitch,
  GLBreadcrumb,
  GLTabs,
  GLPagination,
  GLModal,
  GLDrawer,
  GLAlert,
  GLToast,
  GLTooltip,
  GLSkeleton,
  GLEmptyState,
  GLBadge,
  GLChip,
  GLCard,
  GLTable,
  GLSearchField,
  GLCategoryNavigation,
  GLXStack,
  GLYStack,
} from '@golden-lift/ui';
import type { ButtonSize, ButtonVariant } from '@golden-lift/ui';
import { GLProductCard, GLCategoryCard, GLSpecificationTable } from '@golden-lift/catalog-ui';
import { Search, Layers } from '@golden-lift/icons';
import { useGLTranslation } from '@golden-lift/i18n';
import { useProducts, useCategories } from '../catalog/queries';
import { useTitle } from '../catalog/pages';
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="gl-lab-section">
      <GLHeading>{title}</GLHeading>
      {children}
    </section>
  );
}
export function ComponentLab() {
  useTitle('lab');
  const { t } = useGLTranslation(),
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
      'dark',
      'light',
      'ghost',
      'text',
      'destructive',
    ],
    sizes: ButtonSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];
  return (
    <GLPageContainer>
      <GLBreadcrumb
        items={[
          { href: '/', label: t('home') },
          { href: '/component-lab', label: t('lab') },
        ]}
      />
      <div className="gl-section-heading">
        <div>
          <GLHeading level={1}>{t('lab')}</GLHeading>
          <p>{t('labBody')}</p>
        </div>
      </div>
      <Section title={t('palette')}>
        <div className="gl-lab-palette">
          {Object.entries(palette).map(([name, value]) => (
            <div key={name} className="gl-swatch">
              <div className="gl-swatch-color" style={{ background: value }} />
              <code>{name}</code>
              <code>{value}</code>
            </div>
          ))}
        </div>
      </Section>
      <Section title={t('semantic')}>
        <div className="gl-lab-palette">
          {Object.entries(colors).flatMap(([group, values]) =>
            Object.entries(values).map(([name, value]) => (
              <div key={group + name} className="gl-swatch">
                <div className="gl-swatch-color" style={{ background: value }} />
                <code>
                  {group}.{name}
                </code>
              </div>
            )),
          )}
        </div>
      </Section>
      <Section title={t('type')}>
        <GLYStack gap="$space4">
          {Object.keys(typography).map((role) => (
            <div key={role}>
              <code>{role} / </code>
              <GLText role={role as TypographyRole}>{t('example')} — Golden Lift / ١٢٣</GLText>
            </div>
          ))}
        </GLYStack>
      </Section>
      <Section title={t('spacing')}>
        <GLYStack gap="$space3">
          {Object.entries(space).map(([name, value]) => (
            <div className="gl-row" key={name}>
              <code>
                {name}: {value}
              </code>
              <div style={{ width: value, height: 16, background: colors.action.primary }} />
            </div>
          ))}
        </GLYStack>
      </Section>
      <Section title={t('radii')}>
        <div className="gl-lab-row">
          {Object.entries(radius).map(([name, value]) => (
            <div key={name} className="gl-lab-surface" style={{ borderRadius: value }}>
              <code>{name}</code>
            </div>
          ))}
        </div>
      </Section>
      <Section title={t('shadows')}>
        <div className="gl-lab-row">
          {Object.entries(shadows).map(([name, value]) => (
            <div className="gl-lab-surface" style={{ boxShadow: value }} key={name}>
              <code>{name}</code>
            </div>
          ))}
        </div>
      </Section>
      <Section title={t('buttons')}>
        {variants.map((variant) => (
          <div key={variant}>
            <GLHeading level={3} role="heading6">
              {t(variant)}
            </GLHeading>
            {sizes.map((size) => (
              <div className="gl-lab-row" key={size}>
                <code>{size}</code>
                <GLButton variant={variant} size={size}>
                  {t('default')}
                </GLButton>
                <GLButton variant={variant} size={size} className="lab-hover">
                  {t('example')}
                </GLButton>
                <GLButton variant={variant} size={size} className="lab-focus">
                  {t('focused')}
                </GLButton>
                <GLButton variant={variant} size={size} className="lab-pressed">
                  {t('filled')}
                </GLButton>
                <GLButton variant={variant} size={size} loading>
                  {t('loadingState')}
                </GLButton>
                <GLButton variant={variant} size={size} disabled>
                  {t('disabled')}
                </GLButton>
              </div>
            ))}
          </div>
        ))}
        <GLIconButton label={t('search')} variant="dark">
          <Search size={20} />
        </GLIconButton>
      </Section>
      <Section title={t('fields')}>
        <div className="gl-lab-fields">
          <GLInput label={t('default')} help={t('help')} />
          <GLInput label={t('focused')} className="lab-focus" />
          <GLInput label={t('filled')} defaultValue={t('example')} />
          <GLInput label={t('disabled')} disabled />
          <GLInput label={t('readonly')} readOnly value={t('example')} />
          <GLInput label={t('error')} error={t('invalid')} />
          <GLInput label={t('success')} success={t('valid')} defaultValue={t('example')} />
          <GLTextarea label={t('notes')} help={t('help')} />
          <GLSelect label={t('select')} value={select} onChange={setSelect} options={options} />
          <GLCombobox label={t('search')} value={combo} onChange={setCombo} options={options} />
          <GLSearchField label={t('searchHelp')} />
        </div>
      </Section>
      <Section title={t('controls')}>
        <GLXStack gap="$space6" flexWrap="wrap">
          <GLCheckbox label={t('checkbox')} />
          <GLCheckbox label={t('checked')} defaultChecked />
          <GLRadio label={t('choice1')} name="lab-radio" defaultChecked />
          <GLRadio label={t('choice2')} name="lab-radio" />
          <GLSwitch label={t('switch')} />
        </GLXStack>
      </Section>
      <Section title={t('cards')}>
        <div className="gl-grid">
          {products.data?.items.slice(0, 2).map((p) => (
            <GLProductCard key={p.id} product={p} />
          ))}
          {categories.data?.items.slice(0, 2).map((c) => (
            <GLCategoryCard key={c.id} category={c} />
          ))}
        </div>
        <GLCard>
          <GLText>{t('example')}</GLText>
        </GLCard>
        {products.data?.items[0] && (
          <GLSpecificationTable attributes={products.data.items[0].attributes} />
        )}
      </Section>
      <Section title={t('navigation')}>
        <GLBreadcrumb
          items={[
            { href: '/', label: t('home') },
            { href: '/products', label: t('products') },
            { href: '/component-lab', label: t('lab') },
          ]}
        />
        <GLCategoryNavigation
          links={[
            { href: '/products', label: t('products') },
            { href: '/categories', label: t('categories') },
          ]}
        />
        <GLTabs
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
        <GLPagination page={page} total={4} onChange={setPage} />
      </Section>
      <Section title={t('overlays')}>
        <div className="gl-lab-row">
          <GLButton onClick={() => setModal(true)}>{t('showModal')}</GLButton>
          <GLButton variant="secondary" onClick={() => setDrawer(true)}>
            {t('showDrawer')}
          </GLButton>
          <GLTooltip label={t('tooltip')}>
            <Layers size={24} />
          </GLTooltip>
        </div>
        <GLModal open={modal} onClose={() => setModal(false)} title={t('modalTitle')}>
          <p>{t('modalBody')}</p>
          <GLInput label={t('name')} />
          <GLButton onClick={() => setModal(false)}>{t('close')}</GLButton>
        </GLModal>
        <GLDrawer open={drawer} onClose={() => setDrawer(false)} title={t('drawerTitle')}>
          <a href="/products">{t('products')}</a>
        </GLDrawer>
      </Section>
      <Section title={t('feedback')}>
        <div className="gl-lab-row">
          <GLBadge>{t('example')}</GLBadge>
          <GLBadge tone="gold">{t('notice')}</GLBadge>
          <GLChip onRemove={() => setToast(t('toastBody'))} label={t('close')}>
            {t('example')}
          </GLChip>
        </div>
        <div className="gl-lab-fields">
          {(['info', 'warning', 'success', 'error'] as const).map((tone) => (
            <GLAlert tone={tone} key={tone}>
              {t('alertBody')}
            </GLAlert>
          ))}
        </div>
        <GLButton variant="secondary" onClick={() => setToast(t('toastBody'))}>
          {t('showToast')}
        </GLButton>
        <GLToast message={toast} onClose={() => setToast(null)} />
        <GLSkeleton />
        <GLEmptyState title={t('emptyTitle')} description={t('emptyBody')} />
      </Section>
      <Section title={t('responsive')}>
        <GLTable
          columns={[t('name'), t('technical')]}
          rows={[
            [t('small'), '4 / 16px'],
            [t('example'), '8 / 20px'],
            [t('large'), '12 / 24px'],
          ]}
        />
      </Section>
    </GLPageContainer>
  );
}
