import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'expo-router';

type ActionToken = { path: string; value: string };
const Context = createContext<{ token: ActionToken | null; clear: () => void } | null>(null);
/** Root-owned memory survives canonical route replacement; nothing is persisted. */
export function StaffActionTokenProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname(),
    router = useRouter();
  const [token, setToken] = useState<ActionToken | null>(() => {
    if (
      typeof window === 'undefined' ||
      !['/admin/invitation', '/admin/password-reset'].includes(window.location.pathname)
    )
      return null;
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    return value && value.length <= 512 ? { path: window.location.pathname, value } : null;
  });
  useEffect(() => {
    if (!token) return;
    if (pathname !== token.path) {
      setToken(null);
      return;
    }
    if (window.location.hash) {
      window.history.replaceState(window.history.state, '', token.path);
      router.replace({
        pathname: '/admin/[...path]',
        params: { path: [token.path.slice('/admin/'.length)] },
      });
    }
  }, [token, pathname, router]);
  return (
    <Context.Provider value={{ token, clear: () => setToken(null) }}>{children}</Context.Provider>
  );
}
export function useStaffActionToken(path: string) {
  const context = useContext(Context);
  if (!context) throw new Error('Staff action-token provider required');
  return {
    token: context.token?.path === path ? context.token.value : '',
    clear: context.clear,
  };
}
