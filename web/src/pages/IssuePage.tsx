import { useMemo, useState } from 'react';
import type { Market } from '../lib/markets';
import { usd, usdCompact } from '../lib/format';
import { CoinIcon } from '../components/CoinIcon';

// Every coin has two reserves:
//   USD reserve (USDC)  → lends dollars to Hedges (price up)
//   Token reserve (coin) → lends the coin itself to Shorts (price down)
// Demo numbers, stable per coin, until the vaults exist on-chain.
function demoReserves(m: Market) {
  let s = [...m.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 11) % 2147483647 || 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const base = m.marketCap > 1e10 ? 4e6 : m.marketCap > 1e9 ? 1.2e6 : 2.5e5;
  const usdRes = Math.round(base * (0.4 + r()));
  const usdUtil = 0.3 + r() * 0.6;
  const tokUsd = Math.round(base * (0.2 + r() * 0.6));
  const tokUtil = 0.15 + r() * 0.55;
  const aprBase = m.maxM >= 25 ? 6 : m.maxM >= 10 ? 11 : 16;
  return {
    usd: { reserve: usdRes, util: usdUtil, apr: aprBase * (0.6 + usdUtil) + r() * 3 },
    token: { reserveUsd: tokUsd, reserveTokens: tokUsd / m.price, util: tokUtil, apr: aprBase * 0.8 * (0.6 + tokUtil) + r() * 2 },
  };
}

const amount = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 2 : 6 });

function Util({ v }: { v: number }) {
  return <span className="util"><span className="util-bar"><i style={{ width: `${v * 100}%` }} /></span><span className="num">{Math.round(v * 100)}%</span></span>;
}

export function IssuePage({ markets }: { markets: Market[] }) {
  const [sort, setSort] = useState<'usd' | 'token' | 'apr'>('usd');
  const [issuing, setIssuing] = useState<{ m: Market; asset: 'usd' | 'token' } | null>(null);
  const rows = useMemo(() => markets.slice(0, 100).map((m) => ({ m, v: demoReserves(m) }))
    .sort((a, b) => sort === 'apr' ? Math.max(b.v.usd.apr, b.v.token.apr) - Math.max(a.v.usd.apr, a.v.token.apr)
      : sort === 'token' ? b.v.token.reserveUsd - a.v.token.reserveUsd : b.v.usd.reserve - a.v.usd.reserve), [markets, sort]);
  const totUsd = rows.reduce((s, r) => s + r.v.usd.reserve, 0);
  const totTok = rows.reduce((s, r) => s + r.v.token.reserveUsd, 0);

  return (
    <main id="main" className="page issue-page">
      <header className="page-head">
        <div>
          <p className="eyebrow gold">Issue Reserve</p>
          <h1>Back traders, earn on every trade</h1>
          <p className="page-sub">Issue <b>USD</b> to back Hedges, or issue the <b>coin itself</b> to back Shorts. What you issue comes back first, in the same asset.</p>
        </div>
        <dl className="page-stats">
          <div><dt className="label">USD reserve</dt><dd className="num">{usdCompact(totUsd)}</dd></div>
          <div><dt className="label">Token reserve</dt><dd className="num">{usdCompact(totTok)}</dd></div>
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
                <th colSpan={3} className="grp grp-tok">Token reserve · backs Shorts ▼</th>
                <th rowSpan={2} />
              </tr>
              <tr>
                <th className="r"><button className={'th-sort' + (sort === 'usd' ? ' on' : '')} onClick={() => setSort('usd')}>Reserve</button></th>
                <th>Lent out</th>
                <th className="r"><button className={'th-sort' + (sort === 'apr' ? ' on' : '')} onClick={() => setSort('apr')}>Est. APR</button></th>
                <th className="r"><button className={'th-sort' + (sort === 'token' ? ' on' : '')} onClick={() => setSort('token')}>Reserve</button></th>
                <th>Lent out</th>
                <th className="r">Est. APR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, v }) => (
                <tr key={m.id}>
                  <td><span className="cell-market"><CoinIcon symbol={m.symbol} src={m.image} size={24} /><span><b>{m.symbol}</b><small className="muted"> {m.name}</small></span></span></td>
                  <td className="r num">{usd(v.usd.reserve, 0)}</td>
                  <td><Util v={v.usd.util} /></td>
                  <td className="r num gold">{v.usd.apr.toFixed(1)}%</td>
                  <td className="r num"><span className="tok-amt">{amount(v.token.reserveTokens)} {m.symbol}</span><small className="muted">{usdCompact(v.token.reserveUsd)}</small></td>
                  <td><Util v={v.token.util} /></td>
                  <td className="r num gold">{v.token.apr.toFixed(1)}%</td>
                  <td className="r"><button className="btn btn-gold btn-sm" onClick={() => setIssuing({ m, asset: 'usd' })}>Issue capital</button></td>
                </tr>
              ))}
              {rows.length === 0 && Array.from({ length: 8 }, (_, i) => (
                <tr key={i} aria-hidden="true"><td colSpan={8}><span className="sk sk-w60" /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="hint">Est. APR is a demo estimate from utilization, not a promise. Live reserves will show realized earnings for the last 7 days.</p>

      {issuing && <IssueModal market={issuing.m} initial={issuing.asset} onClose={() => setIssuing(null)} />}
    </main>
  );
}

function IssueModal({ market, initial, onClose }: { market: Market; initial: 'usd' | 'token'; onClose: () => void }) {
  const [asset, setAsset] = useState<'usd' | 'token'>(initial);
  const [amt, setAmt] = useState('');
  const v = demoReserves(market);
  const tok = asset === 'token';
  const unit = tok ? market.symbol : 'USDC';
  const n = parseFloat(amt) || 0;
  return (
    <div className="sheet-scrim center" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Issue capital to ${market.symbol}`} onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-title"><CoinIcon symbol={market.symbol} src={market.image} size={32} /><div><p className="eyebrow gold">Issue Reserve</p><h2>{market.symbol}</h2></div></div>

        <div className="asset-pick" role="radiogroup" aria-label="What to issue">
          <button role="radio" aria-checked={!tok} className={'asset-opt' + (!tok ? ' on' : '')} onClick={() => { setAsset('usd'); setAmt(''); }}>
            <CoinIcon symbol="USDC" size={28} />
            <span><b>Issue USD</b><small>USDC · backs Hedges ▲</small></span>
          </button>
          <button role="radio" aria-checked={tok} className={'asset-opt' + (tok ? ' on' : '')} onClick={() => { setAsset('token'); setAmt(''); }}>
            <CoinIcon symbol={market.symbol} src={market.image} size={28} />
            <span><b>Issue {market.symbol}</b><small>Native token · backs Shorts ▼</small></span>
          </button>
        </div>

        <div className="field">
          <div className="field-head"><label htmlFor="issue-amt" className="label">Amount</label><span className="label">Balance <span className="num">—</span></span></div>
          <div className="input-wrap">
            {!tok && <span className="prefix">$</span>}
            <input id="issue-amt" inputMode="decimal" placeholder="0.00" className="num" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ''))} />
            <span className="prefix unit"><CoinIcon symbol={tok ? market.symbol : 'USDC'} src={tok ? market.image : undefined} size={16} /> {unit}</span>
          </div>
          {tok && n > 0 && <span className="hint">≈ {usd(n * market.price)} at today's price</span>}
        </div>

        <dl className="kv">
          <div><dt>Est. APR</dt><dd className="num gold">{(tok ? v.token.apr : v.usd.apr).toFixed(1)}%</dd></div>
          <div><dt>Lent out</dt><dd className="num">{Math.round((tok ? v.token.util : v.usd.util) * 100)}%</dd></div>
          <div><dt>Comes back first</dt><dd>{tok ? `Same number of ${market.symbol}` : 'Same dollars (USDC)'}</dd></div>
        </dl>
        <p className="hint">
          {tok
            ? `Your ${market.symbol} stays ${market.symbol}: its dollar value moves with the price, and earnings are paid in ${market.symbol}. A sudden pump past a short's liquidation can leave a gap; the safety fund covers it first.`
            : 'Your USDC is lent to Hedges and comes back first when they close. A sudden drop past a liquidation can leave a gap; the safety fund covers it first.'}
        </p>
        <button className="btn btn-gold btn-block" disabled>Issuing opens at launch</button>
      </div>
    </div>
  );
}
