import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { StaffApiClient, StaffApiError } from '@golden-lift/api';
import {
  GLAlert,
  GLButton,
  GLDrawer,
  GLHeading,
  GLInput,
  GLLanguageSwitcher,
  GLSpinner,
} from '@golden-lift/ui';
import { Menu } from '@golden-lift/icons';
import { usePathname, useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAdminTranslation } from './translations';
import './styles.css';
import './workspace.css';
import { frontendConfiguration } from '../../configuration';
const Context = createContext<StaffApiClient | null>(null);
const UnsavedContext = createContext<((id: symbol, dirty: boolean) => void) | null>(null);
function publicStaffPath(path: string) {
  return [
    '/admin/login',
    '/admin/invitation',
    '/admin/password-reset',
    '/admin/reset-request',
  ].includes(path);
}
export function useStaffApi() {
  const api = useContext(Context);
  if (!api) throw new Error('Staff API provider required');
  return api;
}
export function StaffProvider({ children }: { children: ReactNode }) {
  const redirecting = useRef(false);
  const t = useAdminTranslation();
  const [dirtyEditors, setDirtyEditors] = useState<Set<symbol>>(() => new Set());
  const registerDirty = useCallback((id: symbol, dirty: boolean) => {
    setDirtyEditors((previous) => {
      if (previous.has(id) === dirty) return previous;
      const next = new Set(previous);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  useEffect(() => {
    if (!dirtyEditors.size) return;
    function unload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    function click(event: MouseEvent) {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      const link = (event.target as HTMLElement).closest('a[href]');
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === '_blank' ||
        link.hasAttribute('download')
      )
        return;
      const destination = new URL(link.href);
      if (
        destination.origin === location.origin &&
        destination.pathname === location.pathname &&
        destination.search === location.search
      )
        return;
      if (!window.confirm(t('unsaved'))) event.preventDefault();
    }
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, [dirtyEditors.size, t]);
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15000,
            retry: (count, error) =>
              error instanceof StaffApiError && error.status >= 500 && count < 1,
            refetchOnWindowFocus: true,
          },
          mutations: { retry: false },
        },
      }),
  );
  const api = useMemo(
    () =>
      new StaffApiClient(
        frontendConfiguration.apiOrigin,
        () => {
          client.clear();
          if (!publicStaffPath(window.location.pathname) && !redirecting.current) {
            redirecting.current = true;
            window.location.assign('/admin/login');
          }
        },
        frontendConfiguration.mediaOrigin,
      ),
    [client],
  );
  return (
    <QueryClientProvider client={client}>
      <Context.Provider value={api}>
        <UnsavedContext.Provider value={registerDirty}>{children}</UnsavedContext.Provider>
      </Context.Provider>
    </QueryClientProvider>
  );
}
export function useStaffSession() {
  const api = useStaffApi();
  return useQuery({
    queryKey: ['staff', 'session'],
    queryFn: ({ signal }) => api.session(signal),
    retry: false,
    refetchInterval: 30000,
  });
}
export function StaffError({ error, reload }: { error: unknown; reload?: () => void }) {
  const t = useAdminTranslation();
  return (
    <GLAlert tone="error">
      {error instanceof StaffApiError && error.status === 409
        ? t('conflict')
        : error instanceof StaffApiError && error.status === 401
          ? t('expired')
          : error instanceof StaffApiError && error.validationMessage
            ? error.validationMessage
            : t('error')}
      {reload && (
        <GLButton variant="secondary" onClick={reload}>
          {t('reload')}
        </GLButton>
      )}
    </GLAlert>
  );
}
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(512) });
export function StaffShell({ children }: { children: ReactNode }) {
  const api = useStaffApi(),
    session = useStaffSession(),
    pathname = usePathname(),
    router = useRouter(),
    query = useQueryClient(),
    t = useAdminTranslation(),
    [drawer, setDrawer] = useState(false);
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) }),
    [error, setError] = useState<unknown>(null);
  const home = session.data?.account.role === 'SUPER_ADMIN' ? '/super-admin/admins' : '/admin';
  useEffect(() => {
    if (session.data && pathname === '/admin/login') router.replace(home);
  }, [session.data, pathname, router, home]);
  useEffect(() => {
    if (!session.data) return;
    const timer = setTimeout(
      () => {
        api.clearSession();
        query.clear();
        router.replace('/admin/login');
      },
      Math.max(0, Date.parse(session.data.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session.data, api, query, router]);
  if (pathname === '/admin/login')
    return (
      <main className="gl-admin-login">
        <GLLanguageSwitcher />
        <GLHeading level={1} role="heading3">
          {t('login')}
        </GLHeading>
        <form
          onSubmit={form.handleSubmit(async (v) => {
            setError(null);
            try {
              await api.login(v.email, v.password);
              form.reset();
              await query.invalidateQueries({ queryKey: ['staff', 'session'] });
            } catch (e) {
              setError(e);
            }
          })}
        >
          <GLInput
            label={t('email')}
            type="email"
            autoComplete="username"
            {...form.register('email')}
            error={form.formState.errors.email ? t('error') : undefined}
          />
          <GLInput
            label={t('password')}
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
            error={form.formState.errors.password ? t('error') : undefined}
          />
          {error != null && <StaffError error={error} />}
          <GLButton type="submit" loading={form.formState.isSubmitting}>
            {t('login')}
          </GLButton>
        </form>
        <a href="/admin/reset-request">{t('changePassword')}</a>
      </main>
    );
  if (session.isPending)
    return (
      <main className="gl-admin-content">
        <GLSpinner label={t('loading')} />
      </main>
    );
  if (!session.data)
    return (
      <main className="gl-admin-content">
        <StaffError error={session.error} reload={() => void session.refetch()} />
      </main>
    );
  const isSuper = session.data.account.role === 'SUPER_ADMIN';
  const permitted = isSuper
    ? /^\/super-admin\/(admins(?:\/[^/]+)?|account)\/?$/.test(pathname)
    : pathname.startsWith('/admin') && !pathname.startsWith('/super-admin');
  const links = isSuper
    ? [
        ['/super-admin/admins', t('admins')],
        ['/super-admin/account', t('account')],
      ]
    : [
        ['/admin', t('dashboard')],
        ['/admin/categories', t('categories')],
        ['/admin/products', t('products')],
        ['/admin/product-types', t('types')],
        ['/admin/attributes', t('attributes')],
        ['/admin/attribute-groups', t('groups')],
        ['/admin/units', t('units')],
        ['/admin/media', t('media')],
        ['/admin/account', t('account')],
      ];
  const groups = isSuper
    ? [
        { title: t('staff'), items: links.slice(0, 1) },
        { title: t('account'), items: links.slice(1) },
      ]
    : [
        { title: t('overview'), items: links.slice(0, 1) },
        { title: t('catalog'), items: links.slice(1, 7) },
        { title: t('media'), items: links.slice(7, 8) },
        { title: t('account'), items: links.slice(8) },
      ];
  const nav = (
    <nav aria-label={t('dashboard')}>
      {groups.map((group) => (
        <div className="gl-nav-group" key={group.title}>
          <p>{group.title}</p>
          {group.items.map(([href, label]) => (
            <a
              key={href}
              href={href}
              aria-current={
                pathname === href || (href !== '/admin' && pathname.startsWith(href + '/'))
                  ? 'page'
                  : undefined
              }
              onClick={() => setDrawer(false)}
            >
              {label}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
  return (
    <div className="gl-admin">
      <header className="gl-admin-top">
        <GLButton
          variant="ghost"
          className="gl-admin-menu"
          aria-label={t('dashboard')}
          onClick={() => setDrawer(true)}
        >
          <Menu size={20} />
        </GLButton>
        <strong>GOLDEN LIFT</strong>
        <span>{session.data.account.displayName}</span>
        <GLLanguageSwitcher />
        <GLButton variant="ghost" onClick={() => void api.logout().catch(() => {})}>
          {t('logout')}
        </GLButton>
      </header>
      <aside className="gl-admin-sidebar">{nav}</aside>
      <GLDrawer open={drawer} onClose={() => setDrawer(false)} title={t('dashboard')}>
        {nav}
      </GLDrawer>
      <main className="gl-admin-content" id="main">
        {permitted ? (
          children
        ) : (
          <GLAlert tone="error">
            {t('forbidden')}
            <a href={home}>{t('open')}</a>
          </GLAlert>
        )}
      </main>
    </div>
  );
}
export function useUnsaved(dirty: boolean) {
  const register = useContext(UnsavedContext);
  const [id] = useState(() => Symbol('staff editor'));
  useEffect(() => {
    register?.(id, dirty);
    return () => register?.(id, false);
  }, [dirty, id, register]);
}
