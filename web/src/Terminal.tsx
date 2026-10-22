import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Topbar } from './components/Topbar';
import { MarketList } from './components/MarketList';
import { CoinHeader } from './components/CoinHeader';
import { PriceChart } from './components/PriceChart';
import { OrderTicket } from './components/OrderTicket';
import { BottomPanel } from './components/BottomPanel';
import { IssuePage } from './pages/IssuePage';
import { ProfilePage } from './pages/ProfilePage';
import { SwapPage } from './pages/SwapPage';
import { searchMarkets, useMovingMarkets, type Market } from './lib/markets';
import { maxNotional, quote } from './lib/hedge';
import { availableToLend, maxHedgeMFor } from './lib/reserves';
import { useTheme, usePriceColors } from './lib/theme';
import { useTicker } from './lib/useTicker';
import { useRoute, navigate } from './lib/router';
import { WhitepaperPage } from './pages/WhitepaperPage';
import { useAuth } from './lib/auth';
import { useBalances, usdcOf } from './lib/useBalances';

// Admin portal: own chunk, only fetched when an admin opens it. The server guards every /api/admin call.
const AdminPage = lazy(() => import('./pages/AdminPage'));

const TITLES: Record<string, string> = {
  trade: 'backx.trade · Hedge & Issuer Trading on Robinhood Chain', issue: 'Issue · backx.trade', swap: 'Swap portal · backx.trade', whitepaper: 'Whitepaper · backx.trade',
  profile: 'Profile · backx.trade', security: 'Security · backx.trade', wallet: 'Wallet · backx.trade', documents: 'Documents · backx.trade',
  admin: 'Admin · Listed assets', adminUsers: 'Admin · Users', adminParticipants: 'Admin · Participants', adminContracts: 'Admin · Contracts',
};
const PRIVATE = new Set(['profile', 'security', 'wallet', 'documents', 'admin', 'adminUsers', 'adminParticipants', 'adminContracts']);

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

  // Start on ETH (from the suggestions), falling back to the top mover.
  useEffect(() => {
    if (market) return;
    searchMarkets('').then((r) => setMarket((cur) => cur ?? r.items.find((m) => m.symbol === 'ETH') ?? r.items[0] ?? null)).catch(() => {});
  }, [market]);
  useEffect(() => { if (!market && moving.items[0]) setMarket(moving.items[0]); }, [market, moving.items]);

  const selectMarket = useCallback((m: Market) => { setMarket(m); navigate('trade'); }, []);

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <Topbar
        route={route} theme={theme} onTheme={setTheme} priceColors={priceColors} onPriceColors={setPriceColors}
        onSelectMarket={selectMarket} balances={balances}
      />
      {route === 'trade' && <Trade market={market} moving={moving} onSelect={setMarket} theme={theme} priceColors={priceColors} usdc={me ? usdcOf(balances.data) : null} />}
      {route === 'issue' && <IssuePage markets={moving.items} usdc={me ? usdcOf(balances.data) : null} />}
      {route === 'whitepaper' && <WhitepaperPage />}
      {route === 'swap' && <SwapPage onDone={() => setTimeout(balances.refresh, 4000)} />}
      {(route === 'profile' || route === 'security' || route === 'wallet' || route === 'documents') && <ProfilePage route={route} balances={balances} />}
      {(route === 'admin' || route === 'adminUsers' || route === 'adminParticipants' || route === 'adminContracts') && (me?.isAdmin
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
  const [m, setM] = useState(5);
  const [sheet, setSheet] = useState(false);
  const { price: live, dir, tick } = useTicker(market?.price ?? 0, market?.kind === 'Major' ? 0.0012 : 0.004);

  // The coin's cap, limited by the USDC issuers can lend for this stake (contract maxHedgeMFor). No clamp before a market loads.
  const stakeNum = Math.max(parseFloat(stake) || 0, 0);
  const maxM = market ? maxHedgeMFor(market, stakeNum, maxNotional(market.depth)) : 30;
  useEffect(() => { setM((x) => Math.max(1, Math.min(x, maxM))); }, [maxM]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const q = useMemo(
    () => market && quote(Math.max(parseFloat(stake) || 0, 0), Math.min(m, maxM), market.price, market.poolFee, market.depth, market.liqMargin ?? 0),
    [stake, m, market, maxM],
  );

  const ticket = market && q && (
    <OrderTicket market={market} usdc={usdc} maxM={maxM} available={availableToLend(market)} stake={stake} onStake={setStake} m={m} onM={setM} q={q} />
  );

  return (
    <>
      <main id="main" className="terminal">
        <MarketList {...moving} selected={market?.id ?? null} onSelect={onSelect} />
        <div className="center">
          {market && q ? (
            <>
              <CoinHeader market={market} live={live} dir={dir} tick={tick} />
              <PriceChart market={market} theme={theme} priceColors={priceColors} entry={market.price} liqPrice={q.noLiquidation ? null : q.liqPrice} />
            </>
          ) : (
            <>
              <div className="coin-header" aria-busy="true"><span className="sk sk-w30" /><span className="sk sk-w60" /></div>
              <div className="panel chart-panel sk-chart" aria-busy="true" />
            </>
          )}
        </div>
        <div className="ticket-col">{ticket ?? <div className="panel ticket sk-chart" aria-busy="true" />}</div>
        <BottomPanel />
      </main>

      {/* Mobile: sticky Hedge button opens the ticket as a bottom sheet. */}
      <div className="mobile-bar single">
        <button className="btn btn-primary" onClick={() => setSheet(true)}>▲ Hedge {market?.symbol ?? ''}</button>
      </div>
      {sheet && ticket && (
        <div className="sheet-scrim" onClick={() => setSheet(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Order ticket" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" aria-hidden="true" />
            <button className="icon-btn sheet-close" onClick={() => setSheet(false)} aria-label="Close">✕</button>
            {ticket}
          </div>
        </div>
      )}
    </>
  );
}
