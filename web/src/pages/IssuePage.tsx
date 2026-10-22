import { useEffect, useMemo, useState } from 'react';
import type { Market } from '../lib/markets';
import { usd, usdCompact } from '../lib/format';
import { CoinIcon } from '../components/CoinIcon';
import { demoReserves } from '../lib/reserves';
import type { usdcOf } from '../lib/useBalances';

type Usdc = ReturnType<typeof usdcOf> | null;
type Kind = 'hedge' | 'dex';
type Venue = 'pancakeswap' | 'uniswap';
type Range = 'full' | 'wide' | 'narrow';

/** A demo issue: lives only in this browser, never touches a wallet or a contract. */
interface DemoIssue { id: number; kind: Kind; symbol: string; image: string; amount: number; venue?: Venue; range?: Range; at: number }

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
  const [sort, setSort] = useState<'usd' | 'apr' | 'dex'>('usd');
  const [issuing, setIssuing] = useState<Market | null>(null);
  const [demo, setDemo] = useState(loadDemo);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(demo)); } catch { /* storage off */ } }, [demo]);

  const rows = useMemo(() => markets.slice(0, 100).map((m) => ({ m, v: demoReserves(m) }))
    .sort((a, b) => sort === 'apr' ? b.v.usd.apr - a.v.usd.apr : sort === 'dex' ? b.v.dex.tvl - a.v.dex.tvl : b.v.usd.reserve - a.v.usd.reserve), [markets, sort]);
  const totUsd = rows.reduce((s, r) => s + r.v.usd.reserve, 0);
  const totDex = rows.reduce((s, r) => s + r.v.dex.tvl, 0);
  const lent = rows.reduce((s, r) => s + r.v.usd.reserve * r.v.usd.util, 0);
  const demoBal = Math.floor((DEMO_START - demo.items.reduce((s, i) => s + i.amount, 0)) * 100) / 100;

  return (
    <main id="main" className="page issue-page">
      <header className="page-head">
        <div>
          <p className="eyebrow gold">Issue <span className="soon-badge">Coming soon</span></p>
          <h1>Put your capital to work</h1>
          <p className="page-sub">Issue <b>USDC</b> into a <b>Hedge Pool</b> that backs traders, or into a <b>Liquidity Pool</b> that trades on DEXs.</p>
        </div>
        {/* Numbers are blurred until launch: the pools are not live yet. */}
        <dl className="page-stats stats-soon">
          <div><dt className="label">Hedge pools</dt><dd className="num"><span className="blurred" aria-hidden="true">{usdCompact(totUsd)}</span><span className="sr-only">Coming soon</span></dd></div>
          <div><dt className="label">Lent to Hedges</dt><dd className="num"><span className="blurred" aria-hidden="true">{usdCompact(lent)}</span><span className="sr-only">Coming soon</span></dd></div>
          <div><dt className="label">DEX pools</dt><dd className="num"><span className="blurred" aria-hidden="true">{usdCompact(totDex)}</span><span className="sr-only">Coming soon</span></dd></div>
        </dl>
      </header>

      <section className={'demo-bar' + (demo.on ? ' on' : '')}>
        <label className="switch-row">
          <input type="checkbox" checked={demo.on} onChange={(e) => setDemo((d) => ({ ...d, on: e.target.checked }))} />
          <span className="switch" aria-hidden="true" />
          <span><b>Demo mode</b> <small className="muted">Try issuing with ${DEMO_START.toLocaleString('en-US')} play USDC. Nothing is sent.</small></span>
        </label>
        {demo.on && <span className="num demo-bal">Demo USDC <b>{usd(demoBal)}</b></span>}
      </section>

      {demo.on && demo.items.length > 0 && (
        <section className="card demo-issues">
          <div className="row-between"><h2 className="contracts-h">Your demo issues</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setDemo((d) => ({ ...d, items: [] }))}>Reset demo</button></div>
          <ul>
            {demo.items.map((i) => (
              <li key={i.id}>
                <CoinIcon symbol={i.symbol} src={i.image} size={24} />
                <span><b>{i.symbol}</b> <span className={'kind-pill ' + i.kind}>{i.kind === 'hedge' ? 'Hedge Pool' : 'Liquidity Pool'}</span>
                  <small className="muted block">{i.kind === 'dex' ? `${VENUES[i.venue!]} · ${RANGES[i.range!].label}` : 'Backs hedges, comes back first'}</small></span>
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
                <th colSpan={3} className="grp grp-usd"><CoinIcon symbol="USDC" size={14} /> Hedge Pool · backs Hedges ▲</th>
                <th colSpan={2} className={'grp grp-dex' + (DEX_OPEN ? '' : ' is-soon')}>Liquidity Pool · DEX {!DEX_OPEN && <span className="soon-badge">Soon</span>}</th>
                <th rowSpan={2} />
              </tr>
              <tr>
                <th className="r"><button className={'th-sort' + (sort === 'usd' ? ' on' : '')} onClick={() => setSort('usd')}>Reserve</button></th>
                <th>Lent out</th>
                <th className="r"><button className={'th-sort' + (sort === 'apr' ? ' on' : '')} onClick={() => setSort('apr')}>Est. APR</button></th>
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
                  <td className={'r num' + (DEX_OPEN ? '' : ' is-soon')}>{usd(v.dex.tvl, 0)}</td>
                  <td className={'r num' + (DEX_OPEN ? '' : ' is-soon')}>{v.dex.apr.toFixed(1)}%</td>
                  <td className="r"><button className="btn btn-gold btn-sm" onClick={() => setIssuing(m)}>Issue</button></td>
                </tr>
              ))}
              {rows.length === 0 && Array.from({ length: 8 }, (_, i) => (
                <tr key={i} aria-hidden="true"><td colSpan={7}><span className="sk sk-w60" /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="hint">Est. APR figures are demo estimates, not a promise. Live pools will show realized earnings for the last 7 days.</p>

      {issuing && (
        <IssueModal
          market={issuing} usdc={usdc} demo={demo.on} demoBal={demoBal} onClose={() => setIssuing(null)}
          onDemoIssue={(i) => setDemo((d) => ({ ...d, items: [{ ...i, id: Date.now(), at: Date.now() }, ...d.items] }))}
        />
      )}
    </main>
  );
}

function IssueModal({ market, usdc, demo, demoBal, onClose, onDemoIssue }: {
  market: Market; usdc: Usdc; demo: boolean; demoBal: number; onClose: () => void;
  onDemoIssue: (i: Omit<DemoIssue, 'id' | 'at'>) => void;
}) {
  const [kind, setKind] = useState<Kind>('hedge');
  const [venue, setVenue] = useState<Venue>('pancakeswap');
  const [range, setRange] = useState<Range>('wide');
  const [amt, setAmt] = useState('');
  const [done, setDone] = useState(false);
  const v = demoReserves(market);
  const bal = demo ? demoBal : usdc?.total ?? null;
  const n = parseFloat(amt) || 0;
  const tooMuch = bal != null && n > bal + 1e-9;
  const half = Math.floor((n / 2) * 100) / 100;
  const coins = market.price > 0 ? half / market.price : 0;
  const dexApr = v.dex.apr * RANGES[range].feeMult;

  const issueDemo = () => {
    onDemoIssue({ kind, symbol: market.symbol, image: market.image, amount: Math.floor(n * 100) / 100, ...(kind === 'dex' ? { venue, range } : {}) });
    setDone(true);
  };

  return (
    <div className="sheet-scrim center" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Issue to ${market.symbol}`} onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-title"><CoinIcon symbol={market.symbol} src={market.image} size={32} /><div><p className="eyebrow gold">Issue{demo ? ' · Demo' : ''}</p><h2>{market.symbol}</h2></div></div>

        {done ? (
          <>
            <p className="ok">▲ Demo issue added: {usd(Math.floor(n * 100) / 100)} into the {market.symbol} {kind === 'hedge' ? 'Hedge Pool' : `Liquidity Pool on ${VENUES[venue]}`}.</p>
            <p className="hint">It shows under “Your demo issues”. Nothing was sent: demo mode never touches your wallet.</p>
            <button className="btn btn-gold btn-block" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <div className="seg issue-kind" role="tablist" aria-label="Pool type">
              <button role="tab" aria-selected={kind === 'hedge'} className={kind === 'hedge' ? 'active issue' : ''} onClick={() => setKind('hedge')}>Hedge Pool</button>
              <button role="tab" aria-selected={kind === 'dex'} className={(kind === 'dex' ? 'active issue' : '') + (DEX_OPEN ? '' : ' is-soon')} onClick={() => setKind('dex')} disabled={!DEX_OPEN} aria-disabled={!DEX_OPEN}>
                Liquidity Pool · DEX {!DEX_OPEN && <span className="soon-badge">Soon</span>}
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
                  <span className="hint">{RANGES[range].hint}.</span>
                </div>
              </>
            )}

            <div className="field">
              <div className="field-head"><label htmlFor="issue-amt" className="label">Amount</label><span className="label">{demo ? 'Demo USDC' : 'USDC'} <span className="num">{bal != null ? usd(bal) : '—'}</span></span></div>
              <div className="input-wrap">
                <span className="prefix">$</span>
                <input id="issue-amt" inputMode="decimal" placeholder="0.00" className="num" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ''))} />
                <span className="prefix unit"><CoinIcon symbol="USDC" size={16} /> USDC</span>
                <button className="max-btn" disabled={!bal || bal <= 0} onClick={() => bal && setAmt(String(Math.floor(bal * 100) / 100))}>Max</button>
              </div>
              {tooMuch
                ? <span className="field-err">Not enough {demo ? 'demo ' : ''}USDC: you have {usd(bal!)}.{demo ? '' : ' Deposit USDC, or swap to USDC in the Swap portal.'}</span>
                : <span className="hint">Issued in USDC. USDC on another chain moves to the pool's chain automatically when you issue.</span>}
            </div>

            {kind === 'hedge' ? (
              <>
                <dl className="kv">
                  <div><dt>Backs</dt><dd><span className="up">▲</span> {market.symbol} Hedges</dd></div>
                  <div><dt>Est. APR</dt><dd className="num gold">{v.usd.apr.toFixed(1)}%</dd></div>
                  <div><dt>Lent out</dt><dd className="num">{Math.round(v.usd.util * 100)}%</dd></div>
                  <div><dt>Comes back first</dt><dd>Same dollars (USDC)</dd></div>
                </dl>
                <p className="hint">Your USDC is lent to Hedges and comes back first when they close. Issuers share in traders' gains, and when a position falls it is closed early and the reserve is paid back first. Rewards go into the pool and are shared by all issuers in proportion: nothing to claim. A sudden drop past a liquidation can leave a gap; the Reserve Security Fund covers it first.</p>
              </>
            ) : (
              <>
                <dl className="kv">
                  <div><dt>Pool</dt><dd>{market.symbol} / USDC on {VENUES[venue]}</dd></div>
                  <div><dt>Goes in</dt><dd className="num">{n > 0 ? <>{usd(half)} USDC + {coins.toLocaleString('en-US', { maximumSignificantDigits: 6 })} {market.symbol}</> : '—'}</dd></div>
                  <div><dt>Est. fee APR</dt><dd className="num gold">{dexApr.toFixed(1)}%</dd></div>
                  <div><dt>Pool size</dt><dd className="num">{usd(v.dex.tvl, 0)}</dd></div>
                </dl>
                <p className="hint">Half of your USDC is swapped to {market.symbol} and both go into the pool, which anyone can trade against on DEXs. You earn a share of the trading fees. When the price moves, the pool holds more of whichever side fell, so you can get back less than you put in; fees can offset this, they do not remove it.</p>
              </>
            )}

            {demo
              ? <button className="btn btn-gold btn-block" disabled={!(n > 0) || tooMuch} onClick={issueDemo}>Issue {n > 0 ? usd(Math.floor(n * 100) / 100) : ''} (demo)</button>
              : <button className="btn btn-gold btn-block" disabled>Issuing opens at launch</button>}
            {!demo && <p className="hint hint-center">Turn on Demo mode on the Issue page to try it now.</p>}
          </>
        )}
      </div>
    </div>
  );
}
