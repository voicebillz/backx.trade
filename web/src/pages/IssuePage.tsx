import { useMemo, useState } from 'react';
import type { Market } from '../lib/markets';
import { usd, usdCompact } from '../lib/format';
import { CoinIcon } from '../components/CoinIcon';

// Demo vault numbers derived from each market, stable per coin, until vaults exist on-chain.
function demoVault(m: Market) {
  let s = [...m.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 11) % 2147483647 || 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const reserve = Math.round((m.marketCap > 1e10 ? 4e6 : m.marketCap > 1e9 ? 1.2e6 : 2.5e5) * (0.4 + r()));
  const util = 0.3 + r() * 0.6;
  const apr = (m.maxM >= 25 ? 6 : m.maxM >= 10 ? 11 : 16) * (0.6 + util) + r() * 3;
  return { reserve, util, apr, issuers: Math.round(20 + r() * 400) };
}

export function IssuePage({ markets }: { markets: Market[] }) {
  const [sort, setSort] = useState<'apr' | 'reserve'>('reserve');
  const [issuing, setIssuing] = useState<Market | null>(null);
  const rows = useMemo(() => markets.slice(0, 100).map((m) => ({ m, v: demoVault(m) }))
    .sort((a, b) => (sort === 'apr' ? b.v.apr - a.v.apr : b.v.reserve - a.v.reserve)), [markets, sort]);
  const total = rows.reduce((s, r) => s + r.v.reserve, 0);

  return (
    <main id="main" className="page issue-page">
      <header className="page-head">
        <div>
          <p className="eyebrow gold">Issuer vaults</p>
          <h1>Issue capital</h1>
          <p className="page-sub">Back hedgers with your capital and earn on every hedge. Your principal comes back first.</p>
        </div>
        <dl className="page-stats">
          <div><dt className="label">Total reserve</dt><dd className="num">{usdCompact(total)}</dd></div>
          <div><dt className="label">Vaults</dt><dd className="num">{rows.length}</dd></div>
          <span className="demo-tag">Demo data</span>
        </dl>
      </header>

      <div className="panel">
        <div className="table-wrap">
          <table className="issue-table">
            <thead>
              <tr>
                <th>Vault</th>
                <th className="r"><button className={'th-sort' + (sort === 'reserve' ? ' on' : '')} onClick={() => setSort('reserve')}>Total reserve</button></th>
                <th>Lent out</th>
                <th className="r"><button className={'th-sort' + (sort === 'apr' ? ' on' : '')} onClick={() => setSort('apr')}>Est. APR</button></th>
                <th className="r">Issuers</th>
                <th className="r">Max mult.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, v }) => (
                <tr key={m.id}>
                  <td><span className="cell-market"><CoinIcon symbol={m.symbol} src={m.image} size={24} /><span><b>{m.symbol}</b><small className="muted"> {m.name}</small></span></span></td>
                  <td className="r num">{usd(v.reserve, 0)}</td>
                  <td><span className="util"><span className="util-bar"><i style={{ width: `${v.util * 100}%` }} /></span><span className="num">{Math.round(v.util * 100)}%</span></span></td>
                  <td className="r num gold">{v.apr.toFixed(1)}%</td>
                  <td className="r num">{v.issuers}</td>
                  <td className="r num">{m.maxM}×</td>
                  <td className="r"><button className="btn btn-gold btn-sm" onClick={() => setIssuing(m)}>Issue capital</button></td>
                </tr>
              ))}
              {rows.length === 0 && Array.from({ length: 8 }, (_, i) => (
                <tr key={i} aria-hidden="true"><td colSpan={7}><span className="sk sk-w60" /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="hint">Est. APR is a demo estimate from utilization, not a promise. Live vaults will show realized earnings for the last 7 days.</p>

      {issuing && (
        <div className="sheet-scrim center" onClick={() => setIssuing(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={`Issue capital to ${issuing.symbol}`} onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn modal-close" onClick={() => setIssuing(null)} aria-label="Close">✕</button>
            <div className="modal-title"><CoinIcon symbol={issuing.symbol} src={issuing.image} size={32} /><div><p className="eyebrow gold">Issuer vault</p><h2>{issuing.symbol}</h2></div></div>
            <div className="field">
              <div className="field-head"><label htmlFor="issue-amt" className="label">Amount</label><span className="label">Balance <span className="num">—</span></span></div>
              <div className="input-wrap"><span className="prefix">$</span><input id="issue-amt" inputMode="decimal" placeholder="0.00" className="num" /></div>
            </div>
            <dl className="kv">
              <div><dt>Est. APR</dt><dd className="num gold">{demoVault(issuing).apr.toFixed(1)}%</dd></div>
              <div><dt>Lent out</dt><dd className="num">{Math.round(demoVault(issuing).util * 100)}%</dd></div>
              <div><dt>Repayment order</dt><dd>Principal first</dd></div>
            </dl>
            <button className="btn btn-gold btn-block" disabled>Issuing opens at launch</button>
          </div>
        </div>
      )}
    </main>
  );
}
