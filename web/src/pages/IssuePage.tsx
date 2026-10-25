import { useEffect, useMemo, useState } from 'react';
import type { Market } from '../lib/markets';
import { usd, usdCompact } from '../lib/format';
import { CoinIcon } from '../components/CoinIcon';
import { demoReserves } from '../lib/reserves';
import { SwapOverlay } from './SwapPage';
import type { usdcOf } from '../lib/useBalances';

type Usdc = ReturnType<typeof usdcOf> | null;
type Kind = 'hedge' | 'short' | 'dex';
type Venue = 'pancakeswap' | 'uniswap';
type Range = 'full' | 'wide' | 'narrow';

/** A demo issue: lives only in this browser, never touches a wallet or a contract. */
/** amount = USD value; coins = how many coins went into a Short Pool. apr = the pool's demo APR at the time. */
interface DemoIssue { id: number; kind: Kind; symbol: string; image: string; amount: number; coins?: number; apr?: number; venue?: Venue; range?: Range; at: number }

const DEMO_START = 10_000;
/** DEX liquidity pools need the hook contract (not written yet): shown greyed out with a Soon badge (owner 2026-10-22). */
const DEX_OPEN = false;
const VENUES: Record<Venue, string> = { pancakeswap: 'PancakeSwap Infinity', uniswap: 'Uniswap v4' };
// Narrower range = more of the trading fees while the price stays inside it, nothing while it is outside.
const RANGES: Record<Range, { label: string; hint: string; feeMult: number }> = {
  full: { label: 'Full range', hint: 'Earns at every price, lowest fee share', feeMult: 1 },
  wide: { label: 'Wide ±25 %', hint: 'Earns while the price stays within ±25 %', feeMult: 2.2 },
  narrow: { label: 'Narrow ±10 %', hint: 'Highest fee share, stops earning outside ±10 %', feeMult: 4.5 },
};
const KEY = 'backx.issue.demo';

function loadDemo(): { on: boolean; items: DemoIssue[] } {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && Array.isArray(v.items)) return v; } catch { /* storage off */ }
  return { on: false, items: [] };
}

function Util({ v }: { v: number }) {
  return <span className="util"><span className="util-bar"><i style={{ width: `${v * 100}%` }} /></span><span className="num">{Math.round(v * 100)}%</span></span>;
}

export function IssuePage({ markets, usdc }: { markets: Market[]; usdc: Usdc }) {
  const [sort, setSort] = useState<'usd' | 'apr' | 'coin' | 'dex'>('usd');
  const [issuing, setIssuing] = useState<Market | null>(null);
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [demo, setDemo] = useState(loadDemo);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(demo)); } catch { /* storage off */ } }, [demo]);

  const rows = useMemo(() => markets.slice(0, 100).map((m) => ({ m, v: demoReserves(m) }))
    .sort((a, b) => sort === 'apr' ? b.v.usd.apr - a.v.usd.apr : sort === 'coin' ? b.v.coin.reserve - a.v.coin.reserve : sort === 'dex' ? b.v.dex.tvl - a.v.dex.tvl : b.v.usd.reserve - a.v.usd.reserve), [markets, sort]);
  const totUsd = rows.reduce((s, r) => s + r.v.usd.reserve, 0);
  const totDex = rows.reduce((s, r) => s + r.v.dex.tvl, 0);
  const totCoin = rows.reduce((s, r) => s + r.v.coin.reserve, 0);
  // Demo rewards: USDC earned so far at each pool's demo APR (live: claimable from the reserve contract).
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);
  const demoRewards = demo.items.filter((i) => i.kind !== 'dex').reduce((s, i) => s + i.amount * ((i.apr ?? 0) / 100) * ((now - i.at) / 31_536_000_000), 0);
  const lent = rows.reduce((s, r) => s + r.v.usd.reserve * r.v.usd.util, 0);
  const demoBal = Math.floor((DEMO_START - demo.items.reduce((s, i) => s + i.amount, 0)) * 100) / 100;

  return (
    <main id="main" className="page issue-page">
      <header className="page-head">
        <div>
          <p className="eyebrow gold">Issue <span className="soon-badge">Coming soon</span></p>
          <h1>Put your capital to work</h1>
        </div>
        <dl className="page-stats">
          <div><dt className="label">Hedge pools</dt><dd className="num">{usdCompact(totUsd)}</dd></div>
          <div><dt className="label">Short pools</dt><dd className="num">{usdCompact(totCoin)}</dd></div>
          <div><dt className="label">Lent to Hedges</dt><dd className="num">{usdCompact(lent)}</dd></div>
          <div><dt className="label">DEX pools</dt><dd className="num">{usdCompact(totDex)}</dd></div>
        </dl>
      </header>

      <section className={'demo-bar' + (demo.on ? ' on' : '')}>
        <label className="switch-row">
          <input type="checkbox" checked={demo.on} onChange={(e) => setDemo((d) => ({ ...d, on: e.target.checked }))} />
          <span className="switch" aria-hidden="true" />
          <span><b>Demo mode</b></span>
        </label>
        {demo.on && <span className="num demo-bal">Demo USDC <b>{usd(demoBal)}</b></span>}
      </section>

      <section className="card rewards-card">
        <div>
          <p className="label">Your rewards</p>
          <p className="num rewards-amt">{usd(demo.on ? Math.floor(demoRewards * 100) / 100 : 0)} <small className="muted">USDC{demo.on ? ' · demo' : ''}</small></p>
        </div>
        <button className="btn btn-gold btn-sm" disabled>Claim</button>
      </section>

      {demo.on && demo.items.length > 0 && (
        <section className="card demo-issues">
          <div className="row-between"><h2 className="contracts-h">Your demo issues</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setDemo((d) => ({ ...d, items: [] }))}>Reset demo</button></div>
          <ul>
            {demo.items.map((i) => (
              <li key={i.id}>
                <CoinIcon symbol={i.symbol} src={i.image} size={24} />
                <span><b>{i.symbol}</b> <span className={'kind-pill ' + i.kind}>{i.kind === 'hedge' ? 'Hedge Pool' : i.kind === 'short' ? 'Short Pool' : 'Liquidity Pool'}</span>
                  <small className="muted block">{i.kind === 'dex' ? `${VENUES[i.venue!]} · ${RANGES[i.range!].label}`
                    : i.kind === 'short' ? `${(i.coins ?? 0).toLocaleString('en-US', { maximumSignificantDigits: 6 })} ${i.symbol} · same coins back` : 'Backs Buys, comes back first'}</small></span>
                <span className="num">{usd(i.amount)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setDemo((d) => ({ ...d, items: d.items.filter((x) => x.id !== i.id) }))}>Withdraw</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="panel">
        <div className="table-wrap">
          <table className="issue-table">
            <thead>
              <tr>
                <th rowSpan={2}>Coin</th>
                <th colSpan={3} className="grp grp-usd"><CoinIcon symbol="USDC" size={14} /> Hedge Pool · backs Buys ▲</th>
                <th colSpan={2} className="grp grp-coin">Short Pool · the coin · backs Sells ▼</th>
                <th colSpan={2} className={'grp grp-dex' + (DEX_OPEN ? '' : ' is-soon')}>Liquidity Pool · DEX {!DEX_OPEN && <span className="soon-badge">Soon</span>}</th>
                <th rowSpan={2} />
              </tr>
              <tr>
                <th className="r"><button className={'th-sort' + (sort === 'usd' ? ' on' : '')} onClick={() => setSort('usd')}>Reserve</button></th>
                <th>Lent out</th>
                <th className="r"><button className={'th-sort' + (sort === 'apr' ? ' on' : '')} onClick={() => setSort('apr')}>Est. APR</button></th>
                <th className="r"><button className={'th-sort' + (sort === 'coin' ? ' on' : '')} onClick={() => setSort('coin')}>Reserve</button></th>
                <th className="r">Est. APR</th>
                <th className={'r' + (DEX_OPEN ? '' : ' is-soon')}><button className={'th-sort' + (sort === 'dex' ? ' on' : '')} onClick={() => setSort('dex')} disabled={!DEX_OPEN}>Pool size</button></th>
                <th className={'r' + (DEX_OPEN ? '' : ' is-soon')}>Est. fee APR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, v }) => (
                <tr key={m.id}>
                  <td><span className="cell-market"><CoinIcon symbol={m.symbol} src={m.image} size={24} /><span><b>{m.symbol}</b><small className="muted"> {m.name}</small></span></span></td>
                  <td className="r num">{usd(v.usd.reserve, 0)}</td>
                  <td><Util v={v.usd.util} /></td>
                  <td className="r num gold">{v.usd.apr.toFixed(1)}%</td>
                  <td className="r num">{usd(v.coin.reserve, 0)}</td>
                  <td className="r num gold">{v.coin.apr.toFixed(1)}%</td>
                  <td className={'r num' + (DEX_OPEN ? '' : ' is-soon')}>{usd(v.dex.tvl, 0)}</td>
                  <td className={'r num' + (DEX_OPEN ? '' : ' is-soon')}>{v.dex.apr.toFixed(1)}%</td>
                  <td className="r"><button className="btn btn-gold btn-sm" onClick={() => setIssuing(m)}>Issue</button></td>
                </tr>
              ))}
              {rows.length === 0 && Array.from({ length: 8 }, (_, i) => (
                <tr key={i} aria-hidden="true"><td colSpan={9}><span className="sk sk-w60" /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {issuing && (
        <IssueModal
          market={issuing} usdc={usdc} demo={demo.on} demoBal={demoBal} onClose={() => setIssuing(null)} onSwap={setSwapFor}
          onDemoIssue={(i) => setDemo((d) => ({ ...d, items: [{ ...i, id: Date.now(), at: Date.now() }, ...d.items] }))}
        />
      )}
      {swapFor && <SwapOverlay want={swapFor} onClose={() => setSwapFor(null)} />}
    </main>
  );
}

function IssueModal({ market, usdc, demo, demoBal, onClose, onDemoIssue, onSwap }: {
  market: Market; usdc: Usdc; demo: boolean; demoBal: number; onClose: () => void; onSwap: (symbol: string) => void;
  onDemoIssue: (i: Omit<DemoIssue, 'id' | 'at'>) => void;
}) {
  const [kind, setKind] = useState<Kind>('hedge');
  const [venue, setVenue] = useState<Venue>('pancakeswap');
  const [range, setRange] = useState<Range>('wide');
  const [amt, setAmt] = useState('');
  const [done, setDone] = useState(false);
  const v = demoReserves(market);
  // Short Pool: the amount is in coins. Demo: paid from play USDC at today's price. Live: from the wallet's coins.
  const inCoins = kind === 'short';
  const bal = demo ? (inCoins ? demoBal / Math.max(market.price, 1e-12) : demoBal) : inCoins ? null : usdc?.total ?? null;
  const n = parseFloat(amt) || 0;
  const tooMuch = bal != null && n > bal + 1e-9;
  const half = Math.floor((n / 2) * 100) / 100;
  const coins = market.price > 0 ? half / market.price : 0;
  const dexApr = v.dex.apr * RANGES[range].feeMult;

  const issueDemo = () => {
    if (kind === 'short') {
      onDemoIssue({ kind, symbol: market.symbol, image: market.image, amount: Math.floor(n * market.price * 100) / 100, coins: n, apr: v.coin.apr });
    } else {
      onDemoIssue({ kind, symbol: market.symbol, image: market.image, amount: Math.floor(n * 100) / 100, apr: kind === 'hedge' ? v.usd.apr : undefined, ...(kind === 'dex' ? { venue, range } : {}) });
    }
    setDone(true);
  };

  return (
    <div className="sheet-scrim center" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Issue to ${market.symbol}`} onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-title"><CoinIcon symbol={market.symbol} src={market.image} size={32} /><div><p className="eyebrow gold">Issue{demo ? ' · Demo' : ''}</p><h2>{market.symbol}</h2></div></div>

        {done ? (
          <>
            <p className="ok">▲ Demo issue added: {inCoins ? `${n} ${market.symbol}` : usd(Math.floor(n * 100) / 100)} into the {market.symbol} {kind === 'hedge' ? 'Hedge Pool' : kind === 'short' ? 'Short Pool' : `Liquidity Pool on ${VENUES[venue]}`}.</p>
            <button className="btn btn-gold btn-block" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <div className="seg issue-kind" role="tablist" aria-label="Pool type">
              <button role="tab" aria-selected={kind === 'hedge'} className={kind === 'hedge' ? 'active issue' : ''} onClick={() => { setKind('hedge'); setAmt(''); }}>Hedge · USDC</button>
              <button role="tab" aria-selected={kind === 'short'} className={kind === 'short' ? 'active issue' : ''} onClick={() => { setKind('short'); setAmt(''); }}>Short · {market.symbol}</button>
              <button role="tab" aria-selected={kind === 'dex'} className={(kind === 'dex' ? 'active issue' : '') + (DEX_OPEN ? '' : ' is-soon')} onClick={() => setKind('dex')} disabled={!DEX_OPEN} aria-disabled={!DEX_OPEN}>
                DEX pool {!DEX_OPEN && <span className="soon-badge">Soon</span>}
              </button>
            </div>

            {kind === 'dex' && (
              <>
                <div className="field">
                  <span className="label">DEX</span>
                  <div className="chip-row">
                    {(Object.keys(VENUES) as Venue[]).map((k) => (
                      <button key={k} className={'chip-btn' + (venue === k ? ' on' : '')} aria-pressed={venue === k} onClick={() => setVenue(k)}>{VENUES[k]}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="label">Price range</span>
                  <div className="chip-row">
                    {(Object.keys(RANGES) as Range[]).map((k) => (
                      <button key={k} className={'chip-btn' + (range === k ? ' on' : '')} aria-pressed={range === k} onClick={() => setRange(k)}>{RANGES[k].label}</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="field">
              <div className="field-head"><label htmlFor="issue-amt" className="label">Amount</label>
                <span className="label">{inCoins ? (demo ? `Demo ${market.symbol}` : market.symbol) : demo ? 'Demo USDC' : 'USDC'} <span className="num">{bal == null ? '—' : inCoins ? bal.toLocaleString('en-US', { maximumSignificantDigits: 6 }) : usd(bal)}</span></span></div>
              <div className="input-wrap">
                {!inCoins && <span className="prefix">$</span>}
                <input id="issue-amt" inputMode="decimal" placeholder="0.00" className="num" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ''))} />
                <span className="prefix unit">{inCoins ? <><CoinIcon symbol={market.symbol} src={market.image} size={16} /> {market.symbol}</> : <><CoinIcon symbol="USDC" size={16} /> USDC</>}</span>
                <button className="max-btn" disabled={!bal || bal <= 0} onClick={() => bal && setAmt(String(inCoins ? parseFloat(bal.toPrecision(6)) : Math.floor(bal * 100) / 100))}>Max</button>
              </div>
              {tooMuch
                ? <span className="field-err row-between">Not enough {demo ? 'demo ' : ''}{inCoins ? market.symbol : 'USDC'}
                    {!demo && <button type="button" className="btn-mini" onClick={() => onSwap(inCoins ? market.symbol : 'USDC')}>Swap</button>}</span>
                : inCoins && n > 0 ? <span className="hint">≈ {usd(n * market.price)}</span> : null}
              {!demo && (inCoins || (usdc != null && usdc.total <= 0)) && !tooMuch && (
                <button type="button" className="btn-mini swap-link" onClick={() => onSwap(inCoins ? market.symbol : 'USDC')}>
                  <CoinIcon symbol={inCoins ? market.symbol : 'USDC'} src={inCoins ? market.image : undefined} size={14} /> Get {inCoins ? market.symbol : 'USDC'} · Swap
                </button>
              )}
            </div>

            {kind === 'short' ? (
              <>
                <dl className="kv">
                  <div><dt>Backs</dt><dd><span className="down">▼</span> {market.symbol} Sells (shorts)</dd></div>
                  <div><dt>Est. APR</dt><dd className="num gold">{v.coin.apr.toFixed(1)}%</dd></div>
                  <div><dt>Lent out</dt><dd className="num">{Math.round(v.coin.util * 100)}%</dd></div>
                  <div><dt>Comes back</dt><dd>The same number of {market.symbol}</dd></div>
                  <div><dt>Rewards</dt><dd>USDC, claimable</dd></div>
                </dl>
              </>
            ) : kind === 'hedge' ? (
              <>
                <dl className="kv">
                  <div><dt>Backs</dt><dd><span className="up">▲</span> {market.symbol} Buys (hedges)</dd></div>
                  <div><dt>Est. APR</dt><dd className="num gold">{v.usd.apr.toFixed(1)}%</dd></div>
                  <div><dt>Lent out</dt><dd className="num">{Math.round(v.usd.util * 100)}%</dd></div>
                  <div><dt>Comes back first</dt><dd>Same dollars (USDC)</dd></div>
                </dl>
              </>
            ) : (
              <>
                <dl className="kv">
                  <div><dt>Pool</dt><dd>{market.symbol} / USDC on {VENUES[venue]}</dd></div>
                  <div><dt>Goes in</dt><dd className="num">{n > 0 ? <>{usd(half)} USDC + {coins.toLocaleString('en-US', { maximumSignificantDigits: 6 })} {market.symbol}</> : '—'}</dd></div>
                  <div><dt>Est. fee APR</dt><dd className="num gold">{dexApr.toFixed(1)}%</dd></div>
                  <div><dt>Pool size</dt><dd className="num">{usd(v.dex.tvl, 0)}</dd></div>
                </dl>
              </>
            )}

            {demo
              ? <button className="btn btn-gold btn-block" disabled={!(n > 0) || tooMuch} onClick={issueDemo}>Issue {n > 0 ? (inCoins ? `${n} ${market.symbol}` : usd(Math.floor(n * 100) / 100)) : ''} (demo)</button>
              : <button className="btn btn-gold btn-block" disabled>Issuing opens at launch</button>}
          </>
        )}
      </div>
    </div>
  );
}
