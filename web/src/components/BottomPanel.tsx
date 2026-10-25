import { useState } from 'react';
import { CoinIcon } from './CoinIcon';
import { arrow, price, usd } from '../lib/format';
import { DEMO_POSITIONS as POSITIONS, pnlOf } from '../lib/demoPositions';

// Demo rows for admins until history and vaults come from the contracts.

const HISTORY = [
  { t: '18 Oct 11:42', sym: 'SOL', action: 'Opened', m: 10, size: 1000, px: 106.4, pnl: null },
  { t: '18 Oct 09:15', sym: 'ETH', action: 'Opened', m: 5, size: 500, px: 2391.2, pnl: null },
  { t: '17 Oct 22:03', sym: 'BNB', action: 'Closed', m: 3, size: 300, px: 723.0, pnl: 41.8 },
  { t: '17 Oct 16:27', sym: 'DOGE', action: 'Liquidated', m: 15, size: 750, px: 0.2288, pnl: -48.6 },
  { t: '16 Oct 13:50', sym: 'BTC', action: 'Closed', m: 2, size: 400, px: 79880, pnl: 17.2 },
];
const VAULTS = [
  { sym: 'ETH', asset: 'USDC', backs: 'Hedges', deposited: '5,000 USDC', util: 0.62, earned: '+84.35 USDC', share: 0.012 },
  { sym: 'SOL', asset: 'USDC', backs: 'Hedges', deposited: '2,400 USDC', util: 0.41, earned: '+31.20 USDC', share: 0.006 },
  { sym: 'BTC', asset: 'USDC', backs: 'Hedges', deposited: '1,200 USDC', util: 0.71, earned: '+22.15 USDC', share: 0.003 },
];

const TABS = [
  { id: 'positions', label: 'Positions', count: POSITIONS.length },
  { id: 'history', label: 'History', count: HISTORY.length },
  { id: 'vaults', label: 'My vaults', count: VAULTS.length },
] as const;

const signed = (n: number) => (n >= 0 ? '+' : '−') + usd(Math.abs(n));

function Market({ sym, m }: { sym: string; m?: number }) {
  return <span className="cell-market"><CoinIcon symbol={sym} size={18} /><b>{sym}</b>{m != null && <span className="m-chip num">{m}×</span>}</span>;
}

export function BottomPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('positions');
  return (
    <section className="panel bottom" aria-label="Account">
      <div className="tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'active' : ''} onClick={() => setTab(x.id)}>
            {x.label} <span className="tab-count num">{x.count}</span>
          </button>
        ))}
        <span className="demo-tag">Demo data</span>
      </div>
      <div className="table-wrap" role="tabpanel">
        {tab === 'positions' && (
          <table>
            <thead><tr><th>Market</th><th className="c-sm">Side</th><th className="r">Size</th><th className="r c-md">Entry</th><th className="r c-md">Mark</th><th className="r c-sm">Liq. price</th><th className="r">PnL</th><th className="c-sm" /></tr></thead>
            <tbody>
              {POSITIONS.map((p) => {
                const pnl = pnlOf(p);
                return (
                  <tr key={p.sym + p.side}>
                    <td><Market sym={p.sym} m={p.m} /></td>
                    <td className="c-sm">{p.side === 'hedge' ? <span className="side side-hedge">▲ Hedge</span> : <span className="side side-short">▼ Short</span>}</td>
                    <td className="r num">{usd(p.size)}</td>
                    <td className="r num c-md">{price(p.entry)}</td>
                    <td className="r num c-md">{price(p.mark)}</td>
                    <td className="r num c-sm">{p.liq == null ? <span className="muted">None</span> : <span className="down">{price(p.liq)}</span>}</td>
                    <td className={'r num ' + (pnl >= 0 ? 'up' : 'down')}>{arrow(pnl)} {signed(pnl)} <small className="c-md">({(pnl / p.size * 100).toFixed(1)}%)</small></td>
                    <td className="r c-sm"><button className="btn-mini" disabled>Close</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tab === 'history' && (
          <table>
            <thead><tr><th className="c-sm">Time</th><th>Market</th><th className="c-md">Action</th><th className="r">Size</th><th className="r c-md">Price</th><th className="r">Result</th></tr></thead>
            <tbody>
              {HISTORY.map((h) => (
                <tr key={h.t + h.sym}>
                  <td className="num muted c-sm">{h.t}</td>
                  <td><Market sym={h.sym} m={h.m} /></td>
                  <td className="c-md"><span className={'side side-' + h.action.toLowerCase()}>{h.action}</span></td>
                  <td className="r num">{usd(h.size)}</td>
                  <td className="r num c-md">{price(h.px)}</td>
                  <td className={'r num ' + (h.pnl == null ? 'muted' : h.pnl >= 0 ? 'up' : 'down')}>{h.pnl == null ? 'Open' : `${arrow(h.pnl)} ${signed(h.pnl)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'vaults' && (
          <table>
            <thead><tr><th>Reserve</th><th className="c-sm">Backs</th><th className="r">Issued</th><th className="c-md">Lent out</th><th className="r">Earned</th><th className="r c-md">Share</th><th className="c-sm" /></tr></thead>
            <tbody>
              {VAULTS.map((v) => (
                <tr key={v.sym + v.asset}>
                  <td><span className="cell-market"><CoinIcon symbol={v.sym} size={18} /><b>{v.sym}</b><span className="m-chip num">{v.asset}</span></span></td>
                  <td className="c-sm"><span className="side side-hedge">▲ Hedges</span></td>
                  <td className="r num">{v.deposited}</td>
                  <td className="c-md"><span className="util"><span className="util-bar"><i style={{ width: `${v.util * 100}%` }} /></span><span className="num">{Math.round(v.util * 100)}%</span></span></td>
                  <td className="r num gold">{v.earned}</td>
                  <td className="r num c-md">{(v.share * 100).toFixed(1)}%</td>
                  <td className="r c-sm"><button className="btn-mini" disabled>Withdraw</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
