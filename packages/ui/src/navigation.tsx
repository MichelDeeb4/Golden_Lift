import type { ReactNode } from 'react';
import { useGLTranslation, useLocale, languageNames, locales } from '@golden-lift/i18n';
import { Menu, Search } from '@golden-lift/icons';
import { GLButton, GLIconButton } from './primitives';
import { GLDrawer } from './overlays';
export interface NavLink {
  readonly label: string;
  readonly href: string;
}
export function GLBreadcrumb({ items }: { items: readonly NavLink[] }) {
  const { t } = useGLTranslation(),
    { locale } = useLocale();
  return (
    <nav aria-label={t('navigation')} className="gl-breadcrumb">
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
export function GLTabs({
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
      className="gl-tabs"
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
export function GLPagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const { t } = useGLTranslation();
  return (
    <nav className="gl-pagination" aria-label={t('navigation')}>
      <GLButton variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {t('previous')}
      </GLButton>
      <span>{t('page', { page, total })}</span>
      <GLButton variant="secondary" disabled={page >= total} onClick={() => onChange(page + 1)}>
        {t('next')}
      </GLButton>
    </nav>
  );
}
export function GLLanguageSwitcher() {
  const { t } = useGLTranslation(),
    { locale, setLocale } = useLocale();
  return (
    <label className="gl-language">
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
export function GLHeader({
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
  const { t } = useGLTranslation();
  return (
    <>
      <header className="gl-header">
        <div className="gl-header-inner">
          <div className="desktop-brand">{brand}</div>
          <GLMobileHeader {...{ brand, onMenu, onSearch }} />
          <nav className="gl-main-nav" aria-label={t('navigation')}>
            {links.map((l) => (
              <a key={l.href} href={l.href} aria-current={active === l.href ? 'page' : undefined}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="gl-header-search">
            <div className="gl-utility">
              <GLLanguageSwitcher />
            </div>
            <GLIconButton label={t('search')} variant="ghost" onClick={onSearch}>
              <Search size={20} />
            </GLIconButton>
          </div>
        </div>
      </header>
    </>
  );
}
export function GLMobileHeader({
  brand,
  onMenu,
  onSearch,
}: {
  brand: ReactNode;
  onMenu: () => void;
  onSearch: () => void;
}) {
  const { t } = useGLTranslation();
  return (
    <div className="gl-mobile-header">
      <GLIconButton label={t('menu')} variant="ghost" onClick={onMenu}>
        <Menu size={20} />
      </GLIconButton>
      {brand}
      <GLIconButton label={t('search')} variant="ghost" onClick={onSearch}>
        <Search size={20} />
      </GLIconButton>
    </div>
  );
}
export function GLMobileNavigationDrawer({
  open,
  onClose,
  links,
}: {
  open: boolean;
  onClose: () => void;
  links: readonly NavLink[];
}) {
  const { t } = useGLTranslation();
  return (
    <GLDrawer open={open} onClose={onClose} title={t('menu')}>
      <nav className="gl-drawer-nav">
        {links.map((l) => (
          <a key={l.href} href={l.href} onClick={onClose}>
            {l.label}
          </a>
        ))}
      </nav>
      <GLLanguageSwitcher />
    </GLDrawer>
  );
}
export function GLCategoryNavigation({ links }: { links: readonly NavLink[] }) {
  return (
    <nav className="gl-category-nav">
      {links.map((l) => (
        <a key={l.href} href={l.href}>
          {l.label}
        </a>
      ))}
    </nav>
  );
}
