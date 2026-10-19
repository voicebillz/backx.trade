import { useEffect, useId, useState } from 'react';
import type { Market } from '../lib/markets';
import { price, usd } from '../lib/format';
import { LIMIT_SLIP, maxNotional, type Quote } from '../lib/hedge';
import { MultiplierSlider } from './MultiplierSlider';
import { CoinIcon } from './CoinIcon';

interface Props {
  market: Market;
  stake: string;
  onStake: (v: string) => void;
  m: number;
  onM: (m: number) => void;
  q: Quote;
}

const signed = (n: number) => (n >= 0 ? '+' : '−') + usd(Math.abs(n));
const pct = (f: number) => (f >= 0 ? '+' : '−') + Math.abs(f * 100).toFixed(1) + '%';
/** Quick take-profit targets above today's price. */
const STEPS = [0.1, 0.25, 0.5, 1];
/** Same precision as the price shown, so a chip fills a clean number. */
const roundPrice = (n: number) => parseFloat(n >= 1 ? n.toFixed(n >= 1000 ? 2 : 4) : n.toPrecision(4));

/** Hedge = price up, backed by the coin's USD reserve. Short is off in the product for now (owner 2026-10-19). */
export function OrderTicket({ market, stake, onStake, m, onM, q }: Props) {
  const id = useId();
  const max = market.maxM;
  const maxStake = Math.floor(maxNotional(market.depth) / Math.max(m, 1));
  const tooBig = (parseFloat(stake) || 0) > maxStake;

  // Take-profit (limit): sells above today's price. Cleared on a new coin.
  const [limit, setLimit] = useState('');
  useEffect(() => setLimit(''), [market.id]);
  const limitNum = parseFloat(limit);
  const hasLimit = limit !== '' && Number.isFinite(limitNum);
  const limitMove = hasLimit ? limitNum / market.price - 1 : 0;
  const limitErr = !hasLimit ? null
    : limitNum <= 0 ? 'Enter a price above 0.'
    : limitNum <= market.price ? `Set a price above today's price (${price(market.price)}).`
    : null;
  // Worst fill the contract allows: the limit minus limitSlip (sale) or plus it (buy-back).
  const preview = hasLimit && !limitErr ? q.at((limitNum / market.price) * (1 - LIMIT_SLIP)) : null;

  return (
    <aside className="panel ticket" aria-label="Order ticket">
      <h2 className="ticket-title"><span className="up" aria-hidden="true">▲</span> Hedge {market.symbol}</h2>

      <p className="ticket-sub">Profit when {market.symbol} rises. Backed by issuers' <CoinIcon symbol="USDC" size={14} /> USDC.</p>

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
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor={id + 'limit'} className="label">Sell at (limit)</label>
          <span className="label">Optional</span>
        </div>
        <div className="input-wrap">
          <span className="prefix">$</span>
          <input id={id + 'limit'} inputMode="decimal" className="num" placeholder={'Above ' + price(market.price)}
            value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ''))} aria-invalid={!!limitErr} aria-describedby={id + 'limit-hint'} />
          {limit && <button className="max-btn" onClick={() => setLimit('')} aria-label="Clear limit">Clear</button>}
        </div>
        <div className="chips" role="group" aria-label="Quick limit">
          {STEPS.map((f) => {
            const v = roundPrice(market.price * (1 + f));
            return (
              <button key={f} type="button" className={'chip-btn' + (hasLimit && limitNum === v ? ' on' : '')} onClick={() => setLimit(String(v))}>
                ▲ +{f * 100}%
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
            <div><dt>Liquidation at</dt><dd className="num down">{`▼ −${(q.liqMove * 100).toFixed(1)}%`}</dd></div>
          </>
        )}
        <div><dt>Position size</dt><dd className="num">{usd(q.notional)}</dd></div>
        <div><dt>Gas</dt><dd className="num">{usd(q.fees.gas)}</dd></div>
        <div><dt>You pay</dt><dd className="num">{usd(q.paid)}</dd></div>
      </dl>

      <div className="waterfall">
        {preview ? (
          <>
            <div className="label">At your limit {price(limitNum)} (▲ {pct(limitMove)}), worst fill</div>
            <div className="wf-row"><span>You</span><span className={'num ' + (preview.trader >= 0 ? 'up' : 'down')}>{signed(preview.trader)}</span></div>
            <div className="wf-row"><span>Issuers</span><span className="num gold">+{usd(preview.issuers)}</span></div>
          </>
        ) : (
          <>
            <div className="label">If it rises 10%</div>
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


      <button className="btn btn-block btn-primary" disabled>
        Hedge {market.symbol} {Math.min(m, max)}×{preview ? ` · limit ${price(limitNum)}` : ''}
      </button>
    </aside>
  );
}
