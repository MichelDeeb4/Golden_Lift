import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'expo-router';
import {
  GLHeader,
  GLMobileNavigationDrawer,
  GLPageContainer,
  GLLanguageSwitcher,
  GLText,
} from '@golden-lift/ui';
import { useGLTranslation } from '@golden-lift/i18n';
import { useCatalog } from '../../providers/storefront';
export function Brand() {
  return (
    <a href="/" className="gl-brand" aria-label="Golden Lift">
      <span className="gl-brand-mark" aria-hidden="true" />
      <strong>GOLDEN LIFT</strong>
    </a>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const { t } = useGLTranslation(),
    pathname = usePathname(),
    router = useRouter(),
    [drawer, setDrawer] = useState(false),
    source = useCatalog();
  const links = [
    { href: '/', label: t('home') },
    { href: '/products', label: t('products') },
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
      <a className="gl-skip" href="#main">
        {t('skip')}
      </a>
      <GLHeader
        brand={<Brand />}
        links={links}
        active={pathname.startsWith('/products') ? '/products' : pathname}
        onMenu={() => setDrawer(true)}
        onSearch={() => router.push('/search')}
      />
      <GLMobileNavigationDrawer open={drawer} onClose={() => setDrawer(false)} links={links} />
      {source.demo && <div className="gl-demo-banner">{t('demo')}</div>}
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="gl-footer">
        <GLPageContainer>
          <div className="gl-footer-grid">
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
          <div className="gl-footer-bottom">
            <GLText role="caption">© {new Date().getFullYear()} Golden Lift</GLText>
            <GLLanguageSwitcher />
          </div>
        </GLPageContainer>
      </footer>
    </>
  );
}
