import { useEffect, useState, type MouseEvent } from 'react';

// Tiny path router: a handful of pages does not need a library.
export type Route = 'trade' | 'issue' | 'swap' | 'profile' | 'security' | 'wallet' | 'documents' | 'admin' | 'adminUsers' | 'adminParticipants' | 'adminContracts';

const PATHS: Record<Route, string> = {
  trade: '/', issue: '/issue', swap: '/swap', profile: '/profile', security: '/profile/security', wallet: '/profile/wallet',
  documents: '/profile/documents', admin: '/admin', adminUsers: '/admin/users', adminParticipants: '/admin/participants', adminContracts: '/admin/contracts',
};

function parse(path: string): Route {
  const hit = (Object.keys(PATHS) as Route[]).find((r) => PATHS[r] === path.replace(/\/+$/, '') || (r === 'trade' && path === '/'));
  return hit ?? 'trade';
}

export function navigate(r: Route) {
  if (location.pathname === PATHS[r]) return;
  history.pushState(null, '', PATHS[r]);
  dispatchEvent(new PopStateEvent('popstate'));
  scrollTo(0, 0);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(location.pathname));
  useEffect(() => {
    const on = () => setRoute(parse(location.pathname));
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  return route;
}

/** onClick for <a href> links that should route in-app (keeps cmd/ctrl-click working). */
export const go = (r: Route) => (e: MouseEvent) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(r);
};
export const href = (r: Route) => PATHS[r];
