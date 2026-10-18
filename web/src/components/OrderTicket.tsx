import { useId, useState } from 'react';
import type { Market } from '../lib/markets';
import { price, usd } from '../lib/format';
import type { Quote, Side } from '../lib/hedge';
import { MultiplierSlider } from './MultiplierSlider';
import { CoinIcon } from './CoinIcon';

interface Props {
  market: Market;
  side: Side;
  onSide: (s: Side) => void;
  stake: string;
  onStake: (v: string) => void;
  m: number;
  onM: (m: number) => void;
  q: Quote;
}

const signed = (n: number) => (n >= 0 ? '+' : '−') + usd(Math.abs(n));

/** Hedge = price up, backed by the USD vault. Short = price down, backed by the coin's own token vault. */
export function OrderTicket({ market, side, onSide, stake, onStake, m, onM, q }: Props) {
  const [feesOpen, setFeesOpen] = useState(false);
  const id = useId();
  const short = side === 'short';
  const max = short ? market.shortMaxM : market.maxM;

  return (
    <aside className={'panel ticket' + (short ? ' is-short' : '')} aria-label="Order ticket">
      <div className="seg" role="tablist" aria-label="Side">
        <button role="tab" aria-selected={!short} className={!short ? 'active hedge' : ''} onClick={() => onSide('hedge')}>▲ Hedge</button>
        <button role="tab" aria-selected={short} className={short ? 'active short' : ''} onClick={() => onSide('short')}>▼ Short</button>
      </div>

      <p className="ticket-sub">
        {short
          ? <>Profit when {market.symbol} falls. Backed by issuers' <CoinIcon symbol={market.symbol} src={market.image} size={14} /> {market.symbol}.</>
          : <>Profit when {market.symbol} rises. Backed by issuers' <CoinIcon symbol="USDC" size={14} /> USDC.</>}
      </p>

      <div className="field">
        <div className="field-head">
          <label htmlFor={id + 'stake'} className="label">Stake (USDC)</label>
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
          <span className="label">Multiplication</span>
          <span className="num m-value">{m}×</span>
        </div>
        <MultiplierSlider value={Math.min(m, max)} min={1} max={max} onChange={onM} />
        {short && max < market.maxM && <span className="hint">Shorts cap at {max}× on this coin: sudden pumps gap harder than drops.</span>}
      </div>

      <dl className="kv">
        {q.noLiquidation ? (
          <div><dt>Liquidation</dt><dd className="num ok">None at 1×</dd></div>
        ) : (
          <>
            <div><dt>Liquidation price</dt><dd className="num down">{price(q.liqPrice)}</dd></div>
            <div><dt>Liquidation at</dt><dd className="num down">{short ? `▲ +${(q.liqMove * 100).toFixed(1)}%` : `▼ −${(q.liqMove * 100).toFixed(1)}%`}</dd></div>
          </>
        )}
        <div><dt>{short ? 'Short size' : 'Position size'}</dt><dd className="num">{usd(q.notional)}</dd></div>
        {short && <div><dt>{market.symbol} borrowed</dt><dd className="num">{(q.loan / market.price).toLocaleString('en-US', { maximumFractionDigits: 4 })}</dd></div>}
      </dl>

      <div className="waterfall">
        <div className="label">If it {short ? 'falls' : 'rises'} 10%</div>
        <div className="wf-row"><span>You</span><span className={'num ' + (q.ifWin10.trader >= 0 ? 'up' : 'down')}>{signed(q.ifWin10.trader)}</span></div>
        <div className="wf-row"><span>Issuers</span><span className="num gold">+{usd(q.ifWin10.issuers)}</span></div>
        {q.noLiquidation ? (
          <p className="hint">1× borrows nothing: no liquidation, issuers get 0%.</p>
        ) : (
          <>
            <div className="label" style={{ marginTop: 8 }}>If liquidated</div>
            <div className="wf-row"><span>You keep</span><span className="num">{usd(q.ifLiquidated.traderKeeps)}</span></div>
          </>
        )}
      </div>

      <div className="fees">
        <button className="fees-toggle" aria-expanded={feesOpen} onClick={() => setFeesOpen((o) => !o)}>
          <span>Fees</span>
          <span className="num">{usd(q.fees.total)} <span aria-hidden="true">{feesOpen ? '▴' : '▾'}</span></span>
        </button>
        {feesOpen && (
          <dl className="kv small">
            <div><dt>Holders (2% of stake)</dt><dd className="num">{usd(q.fees.holders)}</dd></div>
            <div><dt>Borrow (0.2% of {short ? 'tokens lent' : 'loan'})</dt><dd className="num">{usd(q.fees.borrow)}</dd></div>
            <div><dt>Safety fund (0.5%)</dt><dd className="num">{usd(q.fees.safety)}</dd></div>
            <div><dt>Swap + impact, both ways (est.)</dt><dd className="num">{usd(q.fees.swap)}</dd></div>
          </dl>
        )}
        <p className="hint">No funding fees. One fee at open.</p>
      </div>

      <button className={'btn btn-block ' + (short ? 'btn-short' : 'btn-primary')} disabled>
        {short ? 'Short' : 'Hedge'} {market.symbol} {Math.min(m, max)}×
      </button>
    </aside>
  );
}
