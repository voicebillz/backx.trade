import { useEffect, useState, type MouseEvent } from 'react';

// Tiny path router: a handful of pages does not need a library.
export type Route = 'trade' | 'issue' | 'swap' | 'whitepaper' | 'profile' | 'security' | 'wallet' | 'documents' | 'admin' | 'adminUsers' | 'adminParticipants' | 'adminContracts' | 'adminBranding' | 'adminKeepers';

const PATHS: Record<Route, string> = {
  trade: '/', issue: '/issue', swap: '/swap', whitepaper: '/whitepaper', profile: '/profile', security: '/profile/security', wallet: '/profile/wallet',
  documents: '/profile/documents', admin: '/admin', adminUsers: '/admin/users', adminParticipants: '/admin/participants', adminContracts: '/admin/contracts', adminBranding: '/admin/branding', adminKeepers: '/admin/keepers',
};

function parse(path: string): Route {
  if (/^\/trade(\/|$)/.test(path)) return 'trade';
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

// Each coin has its own address (owner 2026-10-25): /trade/<symbol>, e.g. app.backx.trade/trade/eth.
export const marketSlug = (symbol: string) => symbol.toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const marketPath = (symbol: string) => `/trade/${marketSlug(symbol)}`;
/** The coin in the address bar, or null on / and other pages. */
export const currentSlug = () => /^\/trade\/([a-z0-9-]+)\/?$/i.exec(location.pathname)?.[1]?.toLowerCase() ?? null;
/** Show a coin's address without a page change (push = a new history step, so Back returns to the last coin). */
export function showMarket(symbol: string, push = true) {
  const p = marketPath(symbol);
  if (location.pathname === p) return;
  history[push ? 'pushState' : 'replaceState'](null, '', p + location.search);
}
