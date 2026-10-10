import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'expo-router';
import {
  BPHeader,
  BPMobileNavigationDrawer,
  BPPageContainer,
  BPLanguageSwitcher,
  BPText,
} from '@business-platform/ui';
import { useBPTranslation } from '@business-platform/i18n';
import { useCatalog } from '../../providers/storefront';
export function Brand() {
  return (
    <a href="/" className="bp-brand" aria-label="Business Platform">
      <span className="bp-brand-mark" aria-hidden="true" />
      <strong>BUSINESS PLATFORM</strong>
    </a>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const { t } = useBPTranslation(),
    pathname = usePathname(),
    router = useRouter(),
    [drawer, setDrawer] = useState(false),
    source = useCatalog();
  const links = [
    { href: '/', label: t('home') },
    { href: '/products', label: t('products') },
    { href: '/categories', label: t('categories') },
    { href: '/about', label: t('about') },
    { href: '/contact', label: t('contact') },
  ];
  useEffect(() => {
    function scroll() {
      document.documentElement.classList.toggle('is-scrolled', window.scrollY > 40);
    }
    scroll();
    window.addEventListener('scroll', scroll, { passive: true });
    return () => window.removeEventListener('scroll', scroll);
  }, []);
  return (
    <>
      <a className="bp-skip" href="#main">
        {t('skip')}
      </a>
      <BPHeader
        brand={<Brand />}
        links={links}
        active={pathname.startsWith('/products') ? '/products' : pathname}
        onMenu={() => setDrawer(true)}
        onSearch={() => router.push('/search')}
      />
      <BPMobileNavigationDrawer open={drawer} onClose={() => setDrawer(false)} links={links} />
      {source.demo && <div className="bp-demo-banner">{t('demo')}</div>}
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="bp-footer">
        <BPPageContainer>
          <div className="bp-footer-statement">
            <span className="bp-overline">BUSINESS PLATFORM / {t('brand')}</span>
            <p>{t('heroTitle')}</p>
            <a href="/products">{t('explore')} ↗</a>
          </div>
          <div className="bp-footer-grid">
            <div>
              <Brand />
              <p>{t('footerBody')}</p>
            </div>
            <nav aria-label={t('products')}>
              <span>{t('collection')}</span>
              <a href="/products">{t('products')}</a>
              <a href="/categories">{t('categories')}</a>
              <a href="/search">{t('search')}</a>
            </nav>
            <nav aria-label={t('company')}>
              <span>{t('company')}</span>
              <a href="/about">{t('about')}</a>
              <a href="/contact">{t('contact')}</a>
            </nav>
          </div>
          <div className="bp-footer-bottom">
            <BPText role="caption">© {new Date().getFullYear()} Business Platform</BPText>
            <BPLanguageSwitcher />
          </div>
        </BPPageContainer>
      </footer>
    </>
  );
}
