import { useEffect, useMemo, useRef, useState } from 'react';
import { Topbar } from './components/Topbar';
import { MarketList } from './components/MarketList';
import { CoinHeader } from './components/CoinHeader';
import { PriceChart } from './components/PriceChart';
import { OrderTicket } from './components/OrderTicket';
import { BottomPanel } from './components/BottomPanel';
import { ComingSoon } from './components/ComingSoon';
import { MARKETS, type Market } from './lib/markets';
import { quote } from './lib/hedge';
import { useTheme, usePriceColors } from './lib/theme';
import { useTicker } from './lib/useTicker';
import { useAuth } from './lib/auth';

const COMING_SOON = import.meta.env.VITE_COMING_SOON !== 'false';

export function App() {
  const { theme, setTheme } = useTheme();
  const { priceColors, setPriceColors } = usePriceColors();
  const [view, setView] = useState<'trade' | 'issue' | 'portfolio'>('trade');
  const [market, setMarket] = useState<Market>(MARKETS[1]);
  const [side, setSide] = useState<'hedge' | 'issue'>('hedge');
  const [stake, setStake] = useState('100');
  const [m, setM] = useState(5);
  const [sheet, setSheet] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const app = useRef<HTMLDivElement>(null);

  const { me } = useAuth();
  // Admin wallets (ADMIN_WALLETS on the server) see the app before launch.
  const overlay = COMING_SOON && !me?.isAdmin;

  // Behind the coming-soon overlay nothing is focusable or announced.
  useEffect(() => {
    if (overlay) app.current?.setAttribute('inert', '');
    else app.current?.removeAttribute('inert');
  }, [overlay]);

  const { price: live, dir, tick } = useTicker(market.price, market.kind === 'Meme' ? 0.004 : 0.0012);

  useEffect(() => { setM((x) => Math.min(x, market.maxM)); }, [market]);
  useEffect(() => { setSide(view === 'issue' ? 'issue' : 'hedge'); }, [view]);

  // ⌘K / Ctrl+K focuses market search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.current?.focus(); }
      if (e.key === 'Escape') setSheet(false);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const q = useMemo(
    () => quote(Math.max(parseFloat(stake) || 0, 0), m, market.price, market.poolFee, market.depth),
    [stake, m, market],
  );

  const ticket = (
    <OrderTicket market={market} side={side} onSide={setSide} stake={stake} onStake={setStake} m={m} onM={setM} q={q} />
  );

  return (
    <>
      <div className="app" ref={app}>
        <a className="skip" href="#main">Skip to content</a>
        <Topbar
          view={view} onView={setView} theme={theme} onTheme={setTheme}
          priceColors={priceColors} onPriceColors={setPriceColors}
          onSearch={() => search.current?.focus()}
        />
        <main id="main" className="terminal">
          <MarketList ref={search} selected={market.symbol} onSelect={setMarket} />
          <div className="center">
            <CoinHeader market={market} live={live} dir={dir} tick={tick} />
            <PriceChart market={market} theme={theme} priceColors={priceColors} entry={market.price} liqPrice={q.liqPrice} />
          </div>
          <div className="ticket-col">{ticket}</div>
          <BottomPanel />
        </main>

        {/* Mobile: sticky Hedge / Issue bar opens the ticket as a bottom sheet. */}
        <div className="mobile-bar">
          <button className="btn btn-primary" onClick={() => { setSide('hedge'); setSheet(true); }}>Hedge</button>
          <button className="btn btn-gold" onClick={() => { setSide('issue'); setSheet(true); }}>Issue</button>
        </div>
        {sheet && (
          <div className="sheet-scrim" onClick={() => setSheet(false)}>
            <div className="sheet" role="dialog" aria-modal="true" aria-label="Order ticket" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-grip" aria-hidden="true" />
              <button className="icon-btn sheet-close" onClick={() => setSheet(false)} aria-label="Close">✕</button>
              {ticket}
            </div>
          </div>
        )}
      </div>
      {overlay && <ComingSoon />}
    </>
  );
}
