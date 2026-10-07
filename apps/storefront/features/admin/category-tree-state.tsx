import { createContext, useContext, useEffect, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { usePathname } from 'expo-router';
const TreeState = createContext<{
  expanded: Set<string>;
  setExpanded: Dispatch<SetStateAction<Set<string>>>;
} | null>(null);
// The staff layout owns UI state across Expo route instances. IDs stay in memory.
export function CategoryTreeStateProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === '/admin/login') setExpanded(new Set());
  }, [pathname]);
  return <TreeState.Provider value={{ expanded, setExpanded }}>{children}</TreeState.Provider>;
}
export function useCategoryTreeState() {
  const state = useContext(TreeState);
  if (!state) throw new Error('Persistent staff category tree state required');
  return state;
}
