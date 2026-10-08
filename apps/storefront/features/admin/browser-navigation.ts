interface Entry {
  session: string;
  index: number;
}
const key = '__goldenLiftStaffHistory';
let activePopGuard: ((event: PopStateEvent) => void) | null = null;
// Install before Expo's linking effects. On window, existing target listeners can
// reset the root synchronously before a later listener sees the dirty editor.
if (typeof window !== 'undefined')
  window.addEventListener('popstate', (event) => activePopGuard?.(event), true);
function entry(value: unknown, session: string): Entry | null {
  if (!value || typeof value !== 'object' || !(key in value)) return null;
  const candidate = value[key] as Partial<Entry> | null;
  return candidate?.session === session && Number.isSafeInteger(candidate.index)
    ? (candidate as Entry)
    : null;
}

/** Preserve the browser stack while asking before Expo restores a prior root state. */
export function guardStaffBrowserHistory(isDirty: () => boolean, confirm: () => Promise<boolean>) {
  const session = crypto.randomUUID();
  const history = window.history;
  const originalPush = history.pushState,
    originalReplace = history.replaceState;
  let current = 0,
    disposed = false;
  let pending: { target: number; restored: (() => void) | null } | null = null;
  let permitted: number | null = null;
  const stamp = (data: unknown, index: number) => ({
    ...(data && typeof data === 'object' ? data : {}),
    [key]: { session, index },
  });
  const push: History['pushState'] = (data: unknown, unused, url) => {
    current += 1;
    originalPush.call(history, stamp(data, current), unused, url);
  };
  const replace: History['replaceState'] = (data: unknown, unused, url) => {
    originalReplace.call(history, stamp(data, current), unused, url);
  };
  history.pushState = push;
  history.replaceState = replace;
  originalReplace.call(history, stamp(history.state, current), '');
  const pop = (event: PopStateEvent) => {
    const target = entry(event.state, session);
    // Entries outside this mounted application use the normal document unload policy.
    if (!target) return;
    if (permitted === target.index) {
      permitted = null;
      current = target.index;
      return;
    }
    if (!pending && !isDirty()) {
      current = target.index;
      return;
    }
    event.stopImmediatePropagation();
    if (target.index === current) {
      pending?.restored?.();
      return;
    }
    const restore = current - target.index;
    if (!pending) {
      let restored!: () => void;
      const restoration = new Promise<void>((resolve) => {
        restored = resolve;
      });
      pending = { target: target.index, restored };
      void restoration
        .then(() => (disposed ? false : confirm()))
        .then((leave) => {
          if (disposed) return;
          const destination = pending?.target;
          pending = null;
          if (leave && destination !== undefined) {
            permitted = destination;
            history.go(destination - current);
          }
        });
    }
    // Bounce to the exact entry, retaining its URL, query, Expo ID and mounted form.
    history.go(restore);
  };
  activePopGuard = pop;
  return () => {
    disposed = true;
    pending?.restored?.();
    if (history.pushState === push) history.pushState = originalPush;
    if (history.replaceState === replace) history.replaceState = originalReplace;
    if (activePopGuard === pop) activePopGuard = null;
  };
}
