// backx.trade = public front page; app.backx.trade = the trading/issuing app (owner 2026-10-22).
// Both are served by the same build; the hostname decides. Locally, add ?app to preview the app.
export const IS_APP = location.hostname.startsWith('app.') || (import.meta.env.DEV && new URLSearchParams(location.search).has('app'));
export const APP_URL = 'https://app.backx.trade';
export const SITE_URL = 'https://www.backx.trade';
