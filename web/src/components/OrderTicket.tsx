import { useEffect, useId, useState } from 'react';
import type { Market } from '../lib/markets';
import { price, usd } from '../lib/format';
import { LIMIT_SLIP, maxNotional, type Quote, type Side } from '../lib/hedge';
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
const pct = (f: number) => (f >= 0 ? '+' : '−') + Math.abs(f * 100).toFixed(1) + '%';
/** Quick targets: moves in the trader's favour. */
const HEDGE_STEPS = [0.1, 0.25, 0.5, 1];
const SHORT_STEPS = [0.1, 0.25, 0.5];
/** Same precision as the price shown, so a chip fills a clean number. */
const roundPrice = (n: number) => parseFloat(n >= 1 ? n.toFixed(n >= 1000 ? 2 : 4) : n.toPrecision(4));

/** Hedge = price up, backed by the USD vault. Short = price down, backed by the coin's own token vault. */
export function OrderTicket({ market, side, onSide, stake, onStake, m, onM, q }: Props) {
  const [feesOpen, setFeesOpen] = useState(false);
  const id = useId();
  const short = side === 'short';
  const max = short ? market.shortMaxM : market.maxM;
  const maxStake = Math.floor(maxNotional(market.depth) / Math.max(m, 1));
  const tooBig = (parseFloat(stake) || 0) > maxStake;

  // Take-profit (limit): Hedge sells above today's price, Short buys back below it. Cleared on a new coin or side.
  const [limit, setLimit] = useState('');
  useEffect(() => setLimit(''), [market.id, side]);
  const limitNum = parseFloat(limit);
  const hasLimit = limit !== '' && Number.isFinite(limitNum);
  const limitMove = hasLimit ? limitNum / market.price - 1 : 0;
  const limitErr = !hasLimit ? null
    : limitNum <= 0 ? 'Enter a price above 0.'
    : short && limitNum >= market.price ? `A Short takes profit below today's price (${price(market.price)}).`
    : !short && limitNum <= market.price ? `A Hedge takes profit above today's price (${price(market.price)}).`
    : null;
  // Worst fill the contract allows: the limit minus limitSlip (sale) or plus it (buy-back).
  const preview = hasLimit && !limitErr ? q.at((limitNum / market.price) * (short ? 1 + LIMIT_SLIP : 1 - LIMIT_SLIP)) : null;

  if (short && max < 1) {
    return (
      <aside className="panel ticket is-short" aria-label="Order ticket">
        <div className="seg" role="tablist" aria-label="Side">
          <button role="tab" aria-selected={false} onClick={() => onSide('hedge')}>▲ Hedge</button>
          <button role="tab" aria-selected className="active short">▼ Short</button>
        </div>
        <p className="note">Shorts are off for {market.symbol}: its pool is too thin for issuers to be safe from sudden pumps.</p>
      </aside>
    );
  }

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
        <span className={tooBig ? 'field-err' : 'hint'}>Max {usd(maxStake, 0)} at {m}× (keeps price impact under 0.5%).</span>
      </div>

      <div className="field">
        <div className="field-head">
          <span className="label">Multiplication</span>
          <span className="num m-value">{m}×</span>
        </div>
        <MultiplierSlider value={Math.min(m, max)} min={1} max={max} onChange={onM} />
        {short && max < market.maxM && <span className="hint">Shorts cap at {max}× on this coin: sudden pumps gap harder than drops.</span>}
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor={id + 'limit'} className="label">{short ? 'Buy back at (limit)' : 'Sell at (limit)'}</label>
          <span className="label">Optional</span>
        </div>
        <div className="input-wrap">
          <span className="prefix">$</span>
          <input id={id + 'limit'} inputMode="decimal" className="num" placeholder={short ? 'Below ' + price(market.price) : 'Above ' + price(market.price)}
            value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ''))} aria-invalid={!!limitErr} aria-describedby={id + 'limit-hint'} />
          {limit && <button className="max-btn" onClick={() => setLimit('')} aria-label="Clear limit">Clear</button>}
        </div>
        <div className="chips" role="group" aria-label="Quick limit">
          {(short ? SHORT_STEPS : HEDGE_STEPS).map((f) => {
            const v = roundPrice(market.price * (short ? 1 - f : 1 + f));
            return (
              <button key={f} type="button" className={'chip-btn' + (hasLimit && limitNum === v ? ' on' : '')} onClick={() => setLimit(String(v))}>
                {short ? '▼ −' : '▲ +'}{f * 100}%
              </button>
            );
          })}
        </div>
        <span id={id + 'limit-hint'} className={limitErr ? 'field-err' : 'hint'}>
          {limitErr ?? (hasLimit
            ? `${pct(limitMove)} from now. Closes automatically when the price reaches it (filled within ${LIMIT_SLIP * 100}% of your price).`
            : 'Closes your position automatically at this price.')}
        </span>
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
        {preview ? (
          <>
            <div className="label">At your limit {price(limitNum)} ({short ? '▼' : '▲'} {pct(limitMove)}), worst fill</div>
            <div className="wf-row"><span>You</span><span className={'num ' + (preview.trader >= 0 ? 'up' : 'down')}>{signed(preview.trader)}</span></div>
            <div className="wf-row"><span>Issuers</span><span className="num gold">+{usd(preview.issuers)}</span></div>
          </>
        ) : (
          <>
            <div className="label">If it {short ? 'falls' : 'rises'} 10%</div>
            <div className="wf-row"><span>You</span><span className={'num ' + (q.ifWin10.trader >= 0 ? 'up' : 'down')}>{signed(q.ifWin10.trader)}</span></div>
            <div className="wf-row"><span>Issuers</span><span className="num gold">+{usd(q.ifWin10.issuers)}</span></div>
          </>
        )}
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
            <div><dt>Reserve Security Fund</dt><dd className="num">{usd(q.fees.rsf)}</dd></div>
            <div><dt>Swap + impact, both ways (est.)</dt><dd className="num">{usd(q.fees.swap)}</dd></div>
          </dl>
        )}
        <p className="hint">No funding fees. One fee at open.</p>
      </div>

      <button className={'btn btn-block ' + (short ? 'btn-short' : 'btn-primary')} disabled>
        {short ? 'Short' : 'Hedge'} {market.symbol} {Math.min(m, max)}×{preview ? ` · limit ${price(limitNum)}` : ''}
      </button>
    </aside>
  );
}
