// Every public page and how it looks when shared or found in search (owner 2026-10-23). One list for two uses:
// vite.config.ts writes a page's own HTML head at build time (so crawlers, X, Telegram and AI search see the right
// title and image without running JavaScript), and the admin Branding page shows the same link previews.
// www.backx.trade is the canonical host (backx.trade redirects to it); app.backx.trade is noindex.

export const SITE = 'https://www.backx.trade';
export const APP = 'https://app.backx.trade';
export const OG_IMAGE = `${SITE}/og.png`;

export interface SeoPage {
  /** Path on www.backx.trade, or a full URL for another host. */
  path: string;
  title: string;
  description: string;
  image: string;
  /** Built from index.html with this head (null: has its own static HTML or is not built here). */
  file: string | null;
  indexed: boolean;
}

export const SEO_PAGES: SeoPage[] = [
  {
    path: '/', file: null, indexed: true, image: OG_IMAGE,
    title: 'BackX · Future Trading for Agents & Capital',
    description: 'Go long or short on a coin with leverage or issue USDC that backs traders, on Robinhood Chain and 20+ chains. One login, your own self-custody wallet.',
  },
  {
    path: '/whitepaper', file: 'whitepaper.html', indexed: true, image: OG_IMAGE,
    title: 'Whitepaper · BackX',
    description: 'How BackX works: Long and Short with leverage, Issue into Long Pools, execution and liquidation speed, the Reserve Security Fund, fees and $GAZZ.',
  },
  {
    path: '/mcp', file: 'mcp.html', indexed: true, image: OG_IMAGE,
    title: 'Connect your AI agent · BackX',
    description: 'Connect Claude, ChatGPT, Cursor or any MCP agent to your own BackX account: it reads your positions and rewards and prepares trades, staking and Claim all. You sign every transaction.',
  },
  {
    path: '/terms', file: null, indexed: true, image: OG_IMAGE,
    title: 'Terms of Service · backx.trade',
    description: 'Terms of Service for backx.trade, the Hedge & Issuer trading platform on Robinhood Chain operated by GAZZFUN LLC.',
  },
  {
    path: '/privacy', file: null, indexed: true, image: OG_IMAGE,
    title: 'Privacy Policy · backx.trade',
    description: 'Privacy Policy for backx.trade: what data GAZZFUN LLC collects, why, and your rights.',
  },
  {
    path: APP, file: null, indexed: false, image: OG_IMAGE,
    title: 'BackX App',
    description: 'The BackX trading and issuing app. Private beta: admins only for now.',
  },
];

export const pageUrl = (p: SeoPage) => (p.path.startsWith('http') ? p.path : SITE + (p.path === '/' ? '/' : p.path));
