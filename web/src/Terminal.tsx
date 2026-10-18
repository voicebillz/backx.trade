import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { quote, shortQuote, type Side } from './lib/hedge';
import { useTheme, usePriceColors } from './lib/theme';
import { useTicker } from './lib/useTicker';
import { useRoute, navigate } from './lib/router';
import { useAuth } from './lib/auth';
import { useBalances } from './lib/useBalances';

/** The app shell after sign-in. Loaded as its own chunk, only once the visitor may see it (see App.tsx). */
export default function Terminal() {
  const { theme, setTheme } = useTheme();
  const { priceColors, setPriceColors } = usePriceColors();
  const route = useRoute();
  const { me } = useAuth();
  const balances = useBalances(!!me);
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
      {route === 'trade' && <Trade market={market} moving={moving} onSelect={setMarket} theme={theme} priceColors={priceColors} />}
      {route === 'issue' && <IssuePage markets={moving.items} />}
      {route === 'swap' && <SwapPage onDone={() => setTimeout(balances.refresh, 4000)} />}
      {(route === 'profile' || route === 'security' || route === 'wallet' || route === 'documents') && <ProfilePage route={route} balances={balances} />}
    </div>
  );
}

interface TradeProps {
  market: Market | null;
  moving: ReturnType<typeof useMovingMarkets>;
  onSelect: (m: Market) => void;
  theme: ReturnType<typeof useTheme>['theme'];
  priceColors: ReturnType<typeof usePriceColors>['priceColors'];
}

function Trade({ market, moving, onSelect, theme, priceColors }: TradeProps) {
  const [side, setSide] = useState<Side>('hedge');
  const [stake, setStake] = useState('100');
  const [m, setM] = useState(5);
  const [sheet, setSheet] = useState(false);
  const { price: live, dir, tick } = useTicker(market?.price ?? 0, market?.kind === 'Major' ? 0.0012 : 0.004);

  const maxM = market ? (side === 'short' ? market.shortMaxM : market.maxM) : 30; // no clamp before a market loads
  useEffect(() => { setM((x) => Math.min(x, maxM)); }, [maxM]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const q = useMemo(
    () => market && (side === 'short' ? shortQuote : quote)(Math.max(parseFloat(stake) || 0, 0), Math.min(m, maxM), market.price, market.poolFee, market.depth),
    [stake, m, market, side, maxM],
  );

  const ticket = market && q && (
    <OrderTicket market={market} side={side} onSide={setSide} stake={stake} onStake={setStake} m={m} onM={setM} q={q} />
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

      {/* Mobile: sticky Hedge / Issue bar opens the ticket as a bottom sheet. */}
      <div className="mobile-bar">
        <button className="btn btn-primary" onClick={() => { setSide('hedge'); setSheet(true); }}>Hedge</button>
        <button className="btn btn-short" onClick={() => { setSide('short'); setSheet(true); }}>Short</button>
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
