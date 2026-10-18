import { useId, useState } from 'react';
import type { Market } from '../lib/markets';
import { price, usd } from '../lib/format';
import type { Quote } from '../lib/hedge';

interface Props {
  market: Market;
  side: 'hedge' | 'issue';
  onSide: (s: 'hedge' | 'issue') => void;
  stake: string;
  onStake: (v: string) => void;
  m: number;
  onM: (m: number) => void;
  q: Quote;
}

const MARKS = [2, 3, 5, 10, 15, 20, 25, 30];

export function OrderTicket({ market, side, onSide, stake, onStake, m, onM, q }: Props) {
  const [feesOpen, setFeesOpen] = useState(false);
  const id = useId();
  const marks = MARKS.filter((x) => x <= market.maxM);
  const near = (m - 2) / Math.max(market.maxM - 2, 1); // 0..1, colours the track toward --down

  return (
    <aside className={'panel ticket' + (side === 'issue' ? ' is-issue' : '')} aria-label="Order ticket">
      <div className="seg" role="tablist" aria-label="Side">
        <button role="tab" aria-selected={side === 'hedge'} className={side === 'hedge' ? 'active' : ''} onClick={() => onSide('hedge')}>Hedge</button>
        <button role="tab" aria-selected={side === 'issue'} className={side === 'issue' ? 'active issue' : ''} onClick={() => onSide('issue')}>Issue</button>
      </div>

      {side === 'hedge' ? (
        <>
          <div className="field">
            <div className="field-head">
              <label htmlFor={id + 'stake'} className="label">Stake</label>
              <span className="label">Balance <span className="num">—</span></span>
            </div>
            <div className="input-wrap">
              <span className="prefix">$</span>
              <input id={id + 'stake'} inputMode="decimal" value={stake} onChange={(e) => onStake(e.target.value.replace(/[^0-9.]/g, ''))} className="num" />
              <button className="max-btn" disabled title="Sign in to use your balance">Max</button>
            </div>
          </div>

          <div className="field">
            <div className="field-head">
              <label htmlFor={id + 'm'} className="label">Multiplication</label>
              <span className="num m-value">{m}×</span>
            </div>
            <input
              id={id + 'm'} type="range" min={2} max={market.maxM} step={1} value={m}
              onChange={(e) => onM(+e.target.value)}
              className="m-slider"
              style={{ ['--near' as string]: String(near) }}
              aria-valuetext={`${m} times`}
            />
            <div className="m-marks">
              {marks.map((x) => (
                <button key={x} className={x === m ? 'active' : ''} onClick={() => onM(x)}>{x}×</button>
              ))}
            </div>
          </div>

          <dl className="kv">
            <div><dt>Liquidation price</dt><dd className="num down">{price(q.liqPrice)}</dd></div>
            <div><dt>Liquidation at</dt><dd className="num down">▼ −{(q.liqDrop * 100).toFixed(1)}%</dd></div>
            <div><dt>Position size</dt><dd className="num">{usd(q.equity + q.loan)}</dd></div>
          </dl>

          <div className="waterfall">
            <div className="label">If it rises 10%</div>
            <div className="wf-row"><span>You</span><span className={'num ' + (q.ifUp10.hedger >= 0 ? 'up' : 'down')}>{q.ifUp10.hedger >= 0 ? '+' : '−'}{usd(Math.abs(q.ifUp10.hedger))}</span></div>
            <div className="wf-row"><span>Issuers</span><span className="num gold">+{usd(q.ifUp10.issuers)}</span></div>
            <div className="label" style={{ marginTop: 8 }}>If liquidated</div>
            <div className="wf-row"><span>You keep</span><span className="num">{usd(q.ifLiquidated.hedgerKeeps)}</span></div>
          </div>

          <div className="fees">
            <button className="fees-toggle" aria-expanded={feesOpen} onClick={() => setFeesOpen((o) => !o)}>
              <span>Fees</span>
              <span className="num">{usd(q.fees.total)} <span aria-hidden="true">{feesOpen ? '▴' : '▾'}</span></span>
            </button>
            {feesOpen && (
              <dl className="kv small">
                <div><dt>Holders (2% of stake)</dt><dd className="num">{usd(q.fees.holders)}</dd></div>
                <div><dt>Borrow (0.2% of loan)</dt><dd className="num">{usd(q.fees.borrow)}</dd></div>
                <div><dt>Safety fund (0.5%)</dt><dd className="num">{usd(q.fees.safety)}</dd></div>
                <div><dt>Swap + impact (est.)</dt><dd className="num">{usd(q.fees.swap)}</dd></div>
              </dl>
            )}
            <p className="hint">No funding fees. One fee at open.</p>
          </div>

          <button className="btn btn-primary btn-block" disabled>Hedge {market.symbol} {m}×</button>
        </>
      ) : (
        <>
          <div className="vault">
            <div className="vault-title"><span className="label">Issuer vault</span><b>{market.symbol}</b></div>
            <dl className="kv">
              <div><dt>Deposited</dt><dd className="num">—</dd></div>
              <div><dt>Lent out</dt><dd className="num">—</dd></div>
              <div><dt>Earned (realized)</dt><dd className="num">—</dd></div>
              <div><dt>Safety fund</dt><dd className="num">—</dd></div>
            </dl>
            <p className="hint">Low-risk yield. Your principal comes back first.</p>
          </div>
          <div className="field">
            <div className="field-head"><label htmlFor={id + 'dep'} className="label">Deposit GUSD</label></div>
            <div className="input-wrap"><span className="prefix">$</span><input id={id + 'dep'} inputMode="decimal" placeholder="0.00" className="num" /></div>
          </div>
          <button className="btn btn-gold btn-block" disabled>Issue to {market.symbol} vault</button>
        </>
      )}
    </aside>
  );
}
