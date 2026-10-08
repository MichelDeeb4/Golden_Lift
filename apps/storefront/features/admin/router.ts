import { TabRouter } from 'expo-router';
type StaffNavigationAction = Parameters<ReturnType<typeof TabRouter>['getStateForAction']>[1];
let backGuard: ((action: StaffNavigationAction) => boolean) | null = null;
/** The mounted staff shell owns the guard; the router owns interception before state changes. */
export function registerStaffBackGuard(guard: (action: StaffNavigationAction) => boolean) {
  backGuard = guard;
  return () => {
    if (backGuard === guard) backGuard = null;
  };
}

/** Keep a web workspace mounted while recording same-route query navigation. */
export const StaffRouter: typeof TabRouter = (options) => {
  const base = TabRouter(options);
  const getStateForAction: typeof base.getStateForAction = (state, action, configuration) => {
    if (action.type === 'GO_BACK' && backGuard && !backGuard(action)) return null;
    const next = base.getStateForAction(state, action, configuration);
    if (
      !next ||
      next.index === undefined ||
      !next.history ||
      action.type !== 'NAVIGATE' ||
      options.backBehavior !== 'fullHistory'
    )
      return next;
    const previousRoute = state.routes[state.index],
      nextRoute = next.routes[next.index];
    if (
      previousRoute?.key === nextRoute?.key &&
      next.history.length === state.history.length &&
      JSON.stringify(previousRoute?.params) !== JSON.stringify(nextRoute?.params)
    ) {
      const current = next.history.at(-1);
      if (current) return { ...next, history: [...state.history, current] };
    }
    return next;
  };
  return { ...base, getStateForAction };
};
