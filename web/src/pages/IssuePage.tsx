import { useMemo, useState } from 'react';
import type { Market } from '../lib/markets';
import { usd, usdCompact } from '../lib/format';
import { CoinIcon } from '../components/CoinIcon';

// Every coin has a USD reserve (USDC) that lends dollars to Hedges (price up).
// The token reserve for Shorts is off in the product for now (owner 2026-10-19; contracts keep it disabled).
// Demo numbers, stable per coin, until the vaults exist on-chain.
function demoReserves(m: Market) {
  let s = [...m.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 11) % 2147483647 || 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const base = m.marketCap > 1e10 ? 4e6 : m.marketCap > 1e9 ? 1.2e6 : 2.5e5;
  const usdRes = Math.round(base * (0.4 + r()));
  const usdUtil = 0.3 + r() * 0.6;
  const aprBase = m.maxM >= 25 ? 6 : m.maxM >= 10 ? 11 : 16;
  return {
    usd: { reserve: usdRes, util: usdUtil, apr: aprBase * (0.6 + usdUtil) + r() * 3 },
  };
}

function Util({ v }: { v: number }) {
  return <span className="util"><span className="util-bar"><i style={{ width: `${v * 100}%` }} /></span><span className="num">{Math.round(v * 100)}%</span></span>;
}

export function IssuePage({ markets }: { markets: Market[] }) {
  const [sort, setSort] = useState<'usd' | 'apr'>('usd');
  const [issuing, setIssuing] = useState<Market | null>(null);
  const rows = useMemo(() => markets.slice(0, 100).map((m) => ({ m, v: demoReserves(m) }))
    .sort((a, b) => sort === 'apr' ? b.v.usd.apr - a.v.usd.apr : b.v.usd.reserve - a.v.usd.reserve), [markets, sort]);
  const totUsd = rows.reduce((s, r) => s + r.v.usd.reserve, 0);
  const lent = rows.reduce((s, r) => s + r.v.usd.reserve * r.v.usd.util, 0);

  return (
    <main id="main" className="page issue-page">
      <header className="page-head">
        <div>
          <p className="eyebrow gold">Issue Reserve</p>
          <h1>Back traders, earn on every trade</h1>
          <p className="page-sub">Issue <b>USDC</b> to back Hedges. What you issue comes back first, before the trader is paid.</p>
        </div>
        <dl className="page-stats">
          <div><dt className="label">USD reserve</dt><dd className="num">{usdCompact(totUsd)}</dd></div>
          <div><dt className="label">Lent to Hedges</dt><dd className="num">{usdCompact(lent)}</dd></div>
          <span className="demo-tag">Demo data</span>
        </dl>
      </header>

      <div className="panel">
        <div className="table-wrap">
          <table className="issue-table">
            <thead>
              <tr>
                <th rowSpan={2}>Coin</th>
                <th colSpan={3} className="grp grp-usd"><CoinIcon symbol="USDC" size={14} /> USD reserve · backs Hedges ▲</th>
                <th rowSpan={2} />
              </tr>
              <tr>
                <th className="r"><button className={'th-sort' + (sort === 'usd' ? ' on' : '')} onClick={() => setSort('usd')}>Reserve</button></th>
                <th>Lent out</th>
                <th className="r"><button className={'th-sort' + (sort === 'apr' ? ' on' : '')} onClick={() => setSort('apr')}>Est. APR</button></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, v }) => (
                <tr key={m.id}>
                  <td><span className="cell-market"><CoinIcon symbol={m.symbol} src={m.image} size={24} /><span><b>{m.symbol}</b><small className="muted"> {m.name}</small></span></span></td>
                  <td className="r num">{usd(v.usd.reserve, 0)}</td>
                  <td><Util v={v.usd.util} /></td>
                  <td className="r num gold">{v.usd.apr.toFixed(1)}%</td>
                  <td className="r"><button className="btn btn-gold btn-sm" onClick={() => setIssuing(m)}>Issue USDC</button></td>
                </tr>
              ))}
              {rows.length === 0 && Array.from({ length: 8 }, (_, i) => (
                <tr key={i} aria-hidden="true"><td colSpan={5}><span className="sk sk-w60" /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="hint">Est. APR is a demo estimate from utilization, not a promise. Live reserves will show realized earnings for the last 7 days.</p>

      {issuing && <IssueModal market={issuing} onClose={() => setIssuing(null)} />}
    </main>
  );
}

function IssueModal({ market, onClose }: { market: Market; onClose: () => void }) {
  const [amt, setAmt] = useState('');
  const v = demoReserves(market);
  return (
    <div className="sheet-scrim center" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Issue USDC to ${market.symbol}`} onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-title"><CoinIcon symbol={market.symbol} src={market.image} size={32} /><div><p className="eyebrow gold">Issue Reserve</p><h2>{market.symbol}</h2></div></div>

        <div className="field">
          <div className="field-head"><label htmlFor="issue-amt" className="label">Amount</label><span className="label">Balance <span className="num">—</span></span></div>
          <div className="input-wrap">
            <span className="prefix">$</span>
            <input id="issue-amt" inputMode="decimal" placeholder="0.00" className="num" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ''))} />
            <span className="prefix unit"><CoinIcon symbol="USDC" size={16} /> USDC</span>
          </div>
        </div>

        <dl className="kv">
          <div><dt>Backs</dt><dd><span className="up">▲</span> {market.symbol} Hedges</dd></div>
          <div><dt>Est. APR</dt><dd className="num gold">{v.usd.apr.toFixed(1)}%</dd></div>
          <div><dt>Lent out</dt><dd className="num">{Math.round(v.usd.util * 100)}%</dd></div>
          <div><dt>Comes back first</dt><dd>Same dollars (USDC)</dd></div>
        </dl>
        <p className="hint">Your USDC is lent to Hedges and comes back first when they close. A sudden drop past a liquidation can leave a gap; the Reserve Security Fund covers it first.</p>
        <button className="btn btn-gold btn-block" disabled>Issuing opens at launch</button>
      </div>
    </div>
  );
}
