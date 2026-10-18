import { useState } from 'react';
import { CoinIcon } from './CoinIcon';
import { arrow, price, usd } from '../lib/format';

// Demo rows for admins until positions and vaults come from the contracts.
const POSITIONS = [
  { sym: 'ETH', m: 5, size: 500, entry: 2391.2, mark: 2418.1, liq: 2079.3 },
  { sym: 'SOL', m: 10, size: 1000, entry: 106.4, mark: 104.2, liq: 99.3 },
  { sym: 'BTC', m: 3, size: 300, entry: 80510, mark: 82012, liq: 62390 },
  { sym: 'DOGE', m: 1, size: 120, entry: 0.2391, mark: 0.2471, liq: null },
];
const HISTORY = [
  { t: '18 Oct 11:42', sym: 'SOL', action: 'Opened', m: 10, size: 1000, px: 106.4, pnl: null },
  { t: '18 Oct 09:15', sym: 'ETH', action: 'Opened', m: 5, size: 500, px: 2391.2, pnl: null },
  { t: '17 Oct 22:03', sym: 'BNB', action: 'Closed', m: 3, size: 300, px: 723.0, pnl: 41.8 },
  { t: '17 Oct 16:27', sym: 'DOGE', action: 'Liquidated', m: 15, size: 750, px: 0.2288, pnl: -48.6 },
  { t: '16 Oct 13:50', sym: 'BTC', action: 'Closed', m: 2, size: 400, px: 79880, pnl: 17.2 },
];
const VAULTS = [
  { sym: 'ETH', deposited: 5000, util: 0.62, earned: 84.35, share: 0.012 },
  { sym: 'SOL', deposited: 2500, util: 0.48, earned: 37.9, share: 0.009 },
  { sym: 'BTC', deposited: 1200, util: 0.71, earned: 22.15, share: 0.003 },
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
            <thead><tr><th>Market</th><th>Side</th><th className="r">Size</th><th className="r">Entry</th><th className="r">Mark</th><th className="r">Liq. price</th><th className="r">PnL</th><th /></tr></thead>
            <tbody>
              {POSITIONS.map((p) => {
                const pnl = p.size * p.m * (p.mark / p.entry - 1);
                return (
                  <tr key={p.sym}>
                    <td><Market sym={p.sym} m={p.m} /></td>
                    <td><span className="side side-hedge">Hedge</span></td>
                    <td className="r num">{usd(p.size)}</td>
                    <td className="r num">{price(p.entry)}</td>
                    <td className="r num">{price(p.mark)}</td>
                    <td className="r num">{p.liq == null ? <span className="muted">None</span> : <span className="down">{price(p.liq)}</span>}</td>
                    <td className={'r num ' + (pnl >= 0 ? 'up' : 'down')}>{arrow(pnl)} {signed(pnl)} <small>({(pnl / p.size * 100).toFixed(1)}%)</small></td>
                    <td className="r"><button className="btn-mini" disabled>Close</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tab === 'history' && (
          <table>
            <thead><tr><th>Time</th><th>Market</th><th>Action</th><th className="r">Size</th><th className="r">Price</th><th className="r">Result</th></tr></thead>
            <tbody>
              {HISTORY.map((h) => (
                <tr key={h.t + h.sym}>
                  <td className="num muted">{h.t}</td>
                  <td><Market sym={h.sym} m={h.m} /></td>
                  <td><span className={'side side-' + h.action.toLowerCase()}>{h.action}</span></td>
                  <td className="r num">{usd(h.size)}</td>
                  <td className="r num">{price(h.px)}</td>
                  <td className={'r num ' + (h.pnl == null ? 'muted' : h.pnl >= 0 ? 'up' : 'down')}>{h.pnl == null ? 'Open' : `${arrow(h.pnl)} ${signed(h.pnl)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'vaults' && (
          <table>
            <thead><tr><th>Vault</th><th className="r">Deposited</th><th>Lent out</th><th className="r">Earned, realized</th><th className="r">Vault share</th><th /></tr></thead>
            <tbody>
              {VAULTS.map((v) => (
                <tr key={v.sym}>
                  <td><Market sym={v.sym} /></td>
                  <td className="r num">{usd(v.deposited)}</td>
                  <td><span className="util"><span className="util-bar"><i style={{ width: `${v.util * 100}%` }} /></span><span className="num">{Math.round(v.util * 100)}%</span></span></td>
                  <td className="r num gold">+{usd(v.earned)}</td>
                  <td className="r num">{(v.share * 100).toFixed(1)}%</td>
                  <td className="r"><button className="btn-mini" disabled>Withdraw</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
