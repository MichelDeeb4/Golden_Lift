import type { ReactNode } from 'react';
import { useBPTranslation, useLocale, languageNames, locales } from '@business-platform/i18n';
import { Menu, Search } from '@business-platform/icons';
import { BPButton, BPIconButton } from './primitives';
import { BPDrawer } from './overlays';
export interface NavLink {
  readonly label: string;
  readonly href: string;
}
export function BPBreadcrumb({ items }: { items: readonly NavLink[] }) {
  const { t } = useBPTranslation(),
    { locale } = useLocale();
  return (
    <nav aria-label={t('navigation')} className="bp-breadcrumb">
      <ol>
        {items.map((item, i) => (
          <li key={item.href}>
            {i > 0 && <span aria-hidden="true">{locale === 'en' ? '›' : '‹'}</span>}
            {i === items.length - 1 ? (
              <span aria-current="page">{item.label}</span>
            ) : (
              <a href={item.href}>{item.label}</a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function BPTabs({
  tabs,
  value,
  onChange,
  idPrefix = '',
}: {
  tabs: readonly { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  idPrefix?: string;
}) {
  return (
    <div
      role="tablist"
      className="bp-tabs"
      onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement),
          rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
        const step = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : rtl ? 1 : -1;
        const idx =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? buttons.length - 1
              : (i + step + buttons.length) % buttons.length;
        buttons[idx]?.click();
        buttons[idx]?.focus();
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          id={idPrefix + 'tab-' + tab.id}
          aria-controls={idPrefix + 'panel-' + tab.id}
          aria-selected={tab.id === value}
          tabIndex={tab.id === value ? 0 : -1}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
export function BPPagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const { t } = useBPTranslation();
  return (
    <nav className="bp-pagination" aria-label={t('navigation')}>
      <BPButton variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {t('previous')}
      </BPButton>
      <span>{t('page', { page, total })}</span>
      <BPButton variant="secondary" disabled={page >= total} onClick={() => onChange(page + 1)}>
        {t('next')}
      </BPButton>
    </nav>
  );
}
export function BPLanguageSwitcher() {
  const { t } = useBPTranslation(),
    { locale, setLocale } = useLocale();
  return (
    <label className="bp-language">
      <span className="sr-only">{t('language')}</span>
      <select value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)}>
        {locales.map((l) => (
          <option key={l} value={l}>
            {languageNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
export function BPHeader({
  brand,
  links,
  active,
  onMenu,
  onSearch,
}: {
  brand: ReactNode;
  links: readonly NavLink[];
  active: string;
  onMenu: () => void;
  onSearch: () => void;
}) {
  const { t } = useBPTranslation();
  return (
    <>
      <header className="bp-header">
        <div className="bp-header-inner">
          <div className="desktop-brand">{brand}</div>
          <BPMobileHeader {...{ brand, onMenu, onSearch }} />
          <nav className="bp-main-nav" aria-label={t('navigation')}>
            {links.map((l) => (
              <a key={l.href} href={l.href} aria-current={active === l.href ? 'page' : undefined}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="bp-header-search">
            <div className="bp-utility">
              <BPLanguageSwitcher />
            </div>
            <BPIconButton label={t('search')} variant="ghost" onClick={onSearch}>
              <Search size={20} />
            </BPIconButton>
          </div>
        </div>
      </header>
    </>
  );
}
export function BPMobileHeader({
  brand,
  onMenu,
  onSearch,
}: {
  brand: ReactNode;
  onMenu: () => void;
  onSearch: () => void;
}) {
  const { t } = useBPTranslation();
  return (
    <div className="bp-mobile-header">
      <BPIconButton label={t('menu')} variant="ghost" onClick={onMenu}>
        <Menu size={20} />
      </BPIconButton>
      {brand}
      <BPIconButton label={t('search')} variant="ghost" onClick={onSearch}>
        <Search size={20} />
      </BPIconButton>
    </div>
  );
}
export function BPMobileNavigationDrawer({
  open,
  onClose,
  links,
}: {
  open: boolean;
  onClose: () => void;
  links: readonly NavLink[];
}) {
  const { t } = useBPTranslation();
  return (
    <BPDrawer open={open} onClose={onClose} title={t('menu')}>
      <nav className="bp-drawer-nav">
        {links.map((l) => (
          <a key={l.href} href={l.href} onClick={onClose}>
            {l.label}
          </a>
        ))}
      </nav>
      <BPLanguageSwitcher />
    </BPDrawer>
  );
}
export function BPCategoryNavigation({ links }: { links: readonly NavLink[] }) {
  return (
    <nav className="bp-category-nav">
      {links.map((l) => (
        <a key={l.href} href={l.href}>
          {l.label}
        </a>
      ))}
    </nav>
  );
}
