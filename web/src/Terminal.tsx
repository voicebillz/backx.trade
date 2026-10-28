import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Topbar } from './components/Topbar';
import { MarketList } from './components/MarketList';
import { CoinHeader } from './components/CoinHeader';
import { PriceChart } from './components/PriceChart';
import { OrderTicket, type Action, type TicketLines } from './components/OrderTicket';
import { BottomPanel } from './components/BottomPanel';
import { IssuePage } from './pages/IssuePage';
import { ProfilePage } from './pages/ProfilePage';
import { SwapOverlay, SwapPage } from './pages/SwapPage';
import { searchMarkets, useMovingMarkets, type Market } from './lib/markets';
import { maxNotional, quote, shortQuote, shortTier, type Side } from './lib/hedge';
import { availableToLend, coinsToLend, maxHedgeMFor, maxShortMFor } from './lib/reserves';
import { useTheme, usePriceColors } from './lib/theme';
import { LIMITS, gridOf, useLayout, type Layout, type PanelKind } from './lib/layout';
import { useTicker } from './lib/useTicker';
import { useRoute, currentSlug, marketSlug, showMarket } from './lib/router';
import { WhitepaperPage } from './pages/WhitepaperPage';
import { useAuth } from './lib/auth';
import { useBalances, usdcOf } from './lib/useBalances';

// Admin portal: own chunk, only fetched when an admin opens it. The server guards every /api/admin call.
const AdminPage = lazy(() => import('./pages/AdminPage'));

const TITLES: Record<string, string> = {
  trade: 'backx.trade · Hedge & Issuer Trading on Robinhood Chain', issue: 'Issue · backx.trade', stake: 'Staking · backx.trade', swap: 'Swap portal · backx.trade', whitepaper: 'Whitepaper · backx.trade',
  profile: 'Profile · backx.trade', security: 'Security · backx.trade', wallet: 'Wallet · backx.trade', documents: 'Documents · backx.trade',
  admin: 'Admin · Listed assets', adminUsers: 'Admin · Users', adminParticipants: 'Admin · Participants', adminContracts: 'Admin · Contracts', adminBranding: 'Admin · Branding', adminKeepers: 'Admin · Validators', adminPitch: 'Admin · Pitch deck', adminMemo: 'Admin · Investor memo', adminInvestors: 'Admin · Investors',
};
const PRIVATE = new Set(['profile', 'security', 'wallet', 'stake', 'agents', 'documents', 'admin', 'adminUsers', 'adminParticipants', 'adminContracts', 'adminBranding', 'adminKeepers', 'adminPitch', 'adminMemo', 'adminInvestors']);

/** Per-page title, and noindex on private pages (vercel.json also sends X-Robots-Tag there). */
function usePageMeta(route: string) {
  useEffect(() => {
    document.title = TITLES[route] ?? TITLES.trade;
    let tag = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!tag) { tag = document.createElement('meta'); tag.name = 'robots'; document.head.appendChild(tag); }
    tag.content = PRIVATE.has(route) ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1';
  }, [route]);
}

/** The app shell after sign-in. Loaded as its own chunk, only once the visitor may see it (see App.tsx). */
export default function Terminal() {
  const { theme, setTheme } = useTheme();
  const { priceColors, setPriceColors } = usePriceColors();
  const route = useRoute();
  const { me } = useAuth();
  const balances = useBalances(!!me);
  usePageMeta(route);
  const moving = useMovingMarkets();
  const [market, setMarket] = useState<Market | null>(null);

  // The coin comes from the address (/trade/eth); without one, start on ETH, falling back to the top mover.
  const [slug, setSlug] = useState(currentSlug);
  useEffect(() => {
    const on = () => setSlug(currentSlug());
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  useEffect(() => {
    if (market && (!slug || marketSlug(market.symbol) === slug)) return;
    const hit = slug ? moving.items.find((m) => marketSlug(m.symbol) === slug) : undefined;
    if (hit) { setMarket(hit); return; }
    searchMarkets(slug ?? '').then((r) => {
      const found = slug ? r.items.find((m) => marketSlug(m.symbol) === slug) : r.items.find((m) => m.symbol === 'ETH');
      setMarket((cur) => found ?? cur ?? r.items[0] ?? null);
    }).catch(() => {});
  }, [slug, market, moving.items]);
  useEffect(() => { if (!market && !slug && moving.items[0]) setMarket(moving.items[0]); }, [market, slug, moving.items]);
  // Keep the address and the tab title on the coin while trading.
  useEffect(() => {
    if (!market || route !== 'trade') return;
    showMarket(market.symbol, false);
    document.title = `${market.symbol} · ${market.name} · BackX`;
  }, [market, route]);

  // Picking a coin (list, search) goes to its own address; from another page it also opens Trade.
  const openMarket = useCallback((m: Market) => {
    setMarket(m);
    showMarket(m.symbol);
    dispatchEvent(new PopStateEvent('popstate'));
    scrollTo(0, 0);
  }, []);
  const selectMarket = openMarket;

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <Topbar
        route={route} theme={theme} onTheme={setTheme} priceColors={priceColors} onPriceColors={setPriceColors}
        onSelectMarket={selectMarket} balances={balances}
      />
      {route === 'trade' && <Trade market={market} moving={moving} onSelect={openMarket} theme={theme} priceColors={priceColors} usdc={me ? usdcOf(balances.data) : null} />}
      {route === 'issue' && <IssuePage markets={moving.items} usdc={me ? usdcOf(balances.data) : null} />}
      {route === 'whitepaper' && <WhitepaperPage />}
      {route === 'swap' && <SwapPage onDone={() => setTimeout(balances.refresh, 4000)} />}
      {(route === 'profile' || route === 'security' || route === 'wallet' || route === 'stake' || route === 'agents' || route === 'documents') && <ProfilePage route={route} balances={balances} />}
      {(route === 'admin' || route === 'adminUsers' || route === 'adminParticipants' || route === 'adminContracts' || route === 'adminBranding' || route === 'adminKeepers' || route === 'adminPitch' || route === 'adminMemo' || route === 'adminInvestors') && (me?.isAdmin
        ? <Suspense fallback={<main id="main" className="page" aria-busy="true"><div className="card"><span className="sk sk-w60" /></div></main>}><AdminPage route={route} /></Suspense>
        : <main id="main" className="page"><h1>Page not found</h1><p className="muted"><a href="/">Back to trading</a></p></main>)}
    </div>
  );
}

interface TradeProps {
  market: Market | null;
  moving: ReturnType<typeof useMovingMarkets>;
  onSelect: (m: Market) => void;
  theme: ReturnType<typeof useTheme>['theme'];
  priceColors: ReturnType<typeof usePriceColors>['priceColors'];
  usdc: ReturnType<typeof usdcOf> | null;
}

function Trade({ market, moving, onSelect, theme, priceColors, usdc }: TradeProps) {
  const [stake, setStake] = useState('100');
  const [m, setM] = useState(1);
  const [side, setSide] = useState<Side>('hedge');
  const [action, setAction] = useState<Action>('buy');
  const [lines, setLines] = useState<TicketLines | null>(null); // ticket entry / liq / TP / SL → chart lines
  const [swapFor, setSwapFor] = useState<string | null>(null);
  // Terminal layout (header gear): saved layout + a live override while a panel edge is being dragged.
  const { layout, set: saveLayout } = useLayout();
  const [drag, setDrag] = useState<Partial<Layout> | null>(null);
  const dragging = drag !== null;
  const L: Layout = { ...layout, ...drag };
  const base = useRef(layout);
  const L0 = () => base.current;
  const startDrag = (apply: (dx: number, dy: number) => Partial<Layout>) => {
    base.current = layout;
    return {
      move: (dx: number, dy: number) => setDrag(clampLayout(apply(dx, dy))),
      end: (dx: number, dy: number) => { saveLayout(clampLayout(apply(dx, dy))); setDrag(null); },
    };
  };
  const panel = (k: PanelKind) => k === 'markets' ? <MarketList {...moving} selected={market?.id ?? null} onSelect={onSelect} /> : k === 'positions' ? <BottomPanel /> : null;
  const [sheet, setSheet] = useState(false);
  const { price: live, dir, tick } = useTicker(market?.price ?? 0, market?.kind === 'Major' ? 0.0012 : 0.004);

  // The coin's cap, limited by what issuers can lend for this amount (contract maxMFor: USDC for a Buy/Hedge, the coin
  // itself for a Sell/Short). A short with no coins issued yet (0) can still be placed as an order. No clamp before a market loads.
  const stakeNum = Math.max(parseFloat(stake) || 0, 0);
  const canNow = market ? (side === 'hedge' ? maxHedgeMFor(market, stakeNum, maxNotional(market.depth)) : maxShortMFor(market, stakeNum, maxNotional(market.depth))) : 30;
  const maxM = market && side === 'short' && canNow === 0 ? Math.max(market.shortMaxM, 1) : canNow;
  useEffect(() => { setM((x) => Math.max(1, Math.min(x, maxM))); }, [maxM]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const q = useMemo(() => {
    if (!market) return null;
    const amt = Math.max(parseFloat(stake) || 0, 0), mm = Math.min(m, maxM);
    if (side === 'hedge') return quote(amt, mm, market.price, market.poolFee, market.depth, market.liqMargin ?? 0);
    const t = shortTier(market.maxM);
    return shortQuote(amt, mm, market.price, market.poolFee, market.depth, Math.max(t.margin, market.liqMargin ?? 0), t.roof);
  }, [stake, m, market, maxM, side]);

  const ticket = market && q && (
    <OrderTicket market={market} usdc={usdc} side={side} onSide={setSide} action={action} onAction={setAction} onLines={setLines} maxM={maxM} noCoins={side === 'short' && canNow === 0}
      available={side === 'hedge' ? availableToLend(market) : coinsToLend(market)} stake={stake} onStake={setStake} m={m} onM={setM} q={q} onSwap={setSwapFor} />
  );

  return (
    <>
      <main id="main" className={'terminal custom' + (L.side === 'none' ? ' no-side' : '') + (L.bottom === 'none' ? ' no-bottom' : '') + (dragging ? ' resizing' : '')} style={gridOf(L)}>
        {L.side !== 'none' && (
          <div className="slot slot-side">
            {panel(L.side)}
            <Resizer edge={L.ticketSide === 'right' ? 'r' : 'l'} start={startDrag} apply={(dx) => ({ sideW: L0().sideW + (L.ticketSide === 'right' ? dx : -dx) })} />
            {L.bottom !== 'none' && <Resizer edge={L.ticketSide === 'right' ? 'br' : 'bl'} start={startDrag}
              apply={(dx, dy) => ({ sideW: L0().sideW + (L.ticketSide === 'right' ? dx : -dx), bottomH: L0().bottomH - dy })} />}
          </div>
        )}
        <div className="center">
          {market && q ? (
            <>
              {L.header && <CoinHeader market={market} live={live} dir={dir} tick={tick} />}
              <PriceChart market={market} theme={theme} priceColors={priceColors} entry={lines?.entry ?? market.price} liqPrice={lines ? lines.liq : q.noLiquidation ? null : q.liqPrice} tp={lines?.tp ?? null} sl={lines?.sl ?? null} limit={lines?.limit ?? false} />
            </>
          ) : (
            <>
              <div className="coin-header" aria-busy="true"><span className="sk sk-w30" /><span className="sk sk-w60" /></div>
              <div className="panel chart-panel sk-chart" aria-busy="true" />
            </>
          )}
        </div>
        <div className="ticket-col slot">
          {ticket ?? <div className="panel ticket sk-chart" aria-busy="true" />}
          <Resizer edge={L.ticketSide === 'right' ? 'l' : 'r'} start={startDrag} apply={(dx) => ({ ticketW: L0().ticketW + (L.ticketSide === 'right' ? -dx : dx) })} />
          {L.bottom !== 'none' && <Resizer edge={L.ticketSide === 'right' ? 'bl' : 'br'} start={startDrag}
            apply={(dx, dy) => ({ ticketW: L0().ticketW + (L.ticketSide === 'right' ? -dx : dx), bottomH: L0().bottomH - dy })} />}
        </div>
        {L.bottom !== 'none' && (
          <div className="slot slot-bottom">
            {panel(L.bottom)}
            <Resizer edge="t" start={startDrag} apply={(_dx, dy) => ({ bottomH: L0().bottomH - dy })} />
          </div>
        )}
      </main>

      {/* Mobile: sticky Buy / Sell buttons open the ticket as a bottom sheet (Hedge | Short is flipped inside it). */}
      <div className="mobile-bar">
        <button className="btn btn-primary" onClick={() => { setAction('buy'); setSheet(true); }}>Buy {market?.symbol ?? ''}</button>
        <button className="btn btn-sell" onClick={() => { setAction('sell'); setSheet(true); }}>Sell {market?.symbol ?? ''}</button>
      </div>
      {sheet && ticket && <TicketSheet onClose={() => setSheet(false)}>{ticket}</TicketSheet>}
      {swapFor && <SwapOverlay want={swapFor} onClose={() => setSwapFor(null)} />}
    </>
  );
}

/** Phone bottom sheet for the ticket: the header (grip + close) stays put while the body scrolls, the Hedge button
 *  sticks to the bottom, a swipe down on the header or a tap on the backdrop closes it, and the page behind does not scroll. */
function TicketSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const y0 = useRef<number | null>(null);
  const [dy, setDy] = useState(0);
  useEffect(() => {
    const html = document.documentElement, prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = prev; };
  }, []);
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Order ticket" onClick={(e) => e.stopPropagation()}
        style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
        <div className="sheet-head"
          onPointerDown={(e) => { y0.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (y0.current !== null) setDy(Math.max(0, e.clientY - y0.current)); }}
          onPointerUp={() => { y0.current = null; if (dy > 80) onClose(); else setDy(0); }}
          onPointerCancel={() => { y0.current = null; setDy(0); }}>
          <span className="sheet-grip" aria-hidden="true" />
          <button className="icon-btn sheet-close" onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

const clampLayout = (p: Partial<Layout>): Partial<Layout> => {
  const c = (v: number | undefined, [lo, hi]: readonly [number, number]) => (v === undefined ? undefined : Math.min(hi, Math.max(lo, Math.round(v))));
  const out: Partial<Layout> = {};
  if (p.sideW !== undefined) out.sideW = c(p.sideW, LIMITS.sideW);
  if (p.ticketW !== undefined) out.ticketW = c(p.ticketW, LIMITS.ticketW);
  // Keep at least 320 px above the bottom panel for the coin header and the chart.
  if (p.bottomH !== undefined) out.bottomH = Math.min(c(p.bottomH, LIMITS.bottomH)!, Math.max(LIMITS.bottomH[0], innerHeight - 48 - 320));
  return out;
};

type Drag = { move: (dx: number, dy: number) => void; end: (dx: number, dy: number) => void };

/** Drag handle on a panel edge or corner (desktop): the grid follows live, the size is saved on release.
 *  Arrow keys move it 16 px for keyboard users. */
function Resizer({ edge, start, apply }: { edge: 'l' | 'r' | 't' | 'bl' | 'br'; start: (a: (dx: number, dy: number) => Partial<Layout>) => Drag; apply: (dx: number, dy: number) => Partial<Layout> }) {
  const d = useRef<{ x: number; y: number; h: Drag } | null>(null);
  const corner = edge === 'bl' || edge === 'br';
  const key = (e: { key: string; preventDefault: () => void }) => {
    const step = 16;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    start(apply).end(dx, dy);
  };
  return (
    <div className={'rz rz-' + edge} role="separator" tabIndex={0} aria-label={corner ? 'Resize panels' : 'Resize panel'}
      aria-orientation={edge === 't' ? 'horizontal' : 'vertical'} onKeyDown={key}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); d.current = { x: e.clientX, y: e.clientY, h: start(apply) }; }}
      onPointerMove={(e) => { const s = d.current; if (s) s.h.move(e.clientX - s.x, e.clientY - s.y); }}
      onPointerUp={(e) => { const s = d.current; d.current = null; if (s) s.h.end(e.clientX - s.x, e.clientY - s.y); }}
      onPointerCancel={() => { const s = d.current; d.current = null; if (s) s.h.end(0, 0); }} />
  );
}
