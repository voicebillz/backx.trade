import { useEffect, useId, useState } from 'react';
import type { Market } from '../lib/markets';
import { price, usd, usdCompact } from '../lib/format';
import { FEES, KEEPER_GAS, LIMIT_SLIP, maxNotional, type Quote } from '../lib/hedge';
import type { usdcOf } from '../lib/useBalances';
import { MultiplierSlider } from './MultiplierSlider';

interface Props {
  market: Market;
  /** The user's USDC (null when signed out). Stakes are paid in USDC. */
  usdc: ReturnType<typeof usdcOf> | null;
  /** Highest multiplication right now: the coin's cap, limited by the issuers' free USDC (contract maxHedgeMFor). */
  maxM: number;
  /** USDC the issuers' reserve can still lend. */
  available: number;
  stake: string;
  onStake: (v: string) => void;
  m: number;
  onM: (m: number) => void;
  q: Quote;
}

/** Where markets live today. Per-market chains come from the listed assets once contracts are live. */
const MARKET_CHAIN = 'Robinhood Chain';
const signed = (n: number) => (n >= 0 ? '+' : '−') + usd(Math.abs(n));
const pct = (f: number) => (f >= 0 ? '+' : '−') + Math.abs(f * 100).toFixed(1) + '%';
/** Quick take-profit targets above today's price. */
const STEPS = [0.1, 0.25, 0.5, 1];
/** Same precision as the price shown, so a chip fills a clean number. */
const roundPrice = (n: number) => parseFloat(n >= 1 ? n.toFixed(n >= 1000 ? 2 : 4) : n.toPrecision(4));

/** Hedge = price up, backed by the coin's USD reserve. Short is off in the product for now (owner 2026-10-19). */
export function OrderTicket({ market, usdc, maxM, available, stake, onStake, m, onM, q }: Props) {
  const id = useId();
  const max = maxM;
  const byReserve = max < market.maxM && Math.floor(available / Math.max(parseFloat(stake) || 0, 1)) + 1 <= max;
  // The amount typed is what the user pays; the position is m × (amount − fees). Max position → max amount.
  const feeRate = FEES.holders + FEES.rsfStake + (Math.max(m, 1) - 1) * (FEES.borrow + FEES.rsfLent);
  const maxStake = Math.floor((maxNotional(market.depth) / Math.max(m, 1)) * (1 + feeRate) + KEEPER_GAS);
  const tooBig = (parseFloat(stake) || 0) > maxStake;
  // The amount is paid in USDC: Max = all of it (rounded down to the cent).
  const maxByUsdc = usdc ? Math.floor(usdc.total * 100) / 100 : 0;
  const lacking = usdc != null && (parseFloat(stake) || 0) > usdc.total + 1e-9;
  const elsewhere = usdc?.parts.filter((p) => p.chainName !== MARKET_CHAIN) ?? [];

  // Take-profit (limit): sells above today's price. Cleared on a new coin.
  const [limit, setLimit] = useState('');
  useEffect(() => setLimit(''), [market.id]);
  const limitNum = parseFloat(limit);
  const hasLimit = limit !== '' && Number.isFinite(limitNum);
  const limitMove = hasLimit ? limitNum / market.price - 1 : 0;
  const limitErr = !hasLimit ? null
    : limitNum <= 0 ? 'Enter a price above 0.'
    : limitNum <= market.price ? `Above ${price(market.price)}`
    : null;
  // Worst fill the contract allows: the limit minus limitSlip (sale) or plus it (buy-back).
  const preview = hasLimit && !limitErr ? q.at((limitNum / market.price) * (1 - LIMIT_SLIP)) : null;

  return (
    <aside className="panel ticket" aria-label="Order ticket">
      <h2 className="ticket-title"><span className="up" aria-hidden="true">▲</span> Hedge {market.symbol}</h2>

      <div className="field">
        <div className="field-head">
          <label htmlFor={id + 'stake'} className="label">Amount (USDC)</label>
          <span className="label">USDC <span className="num">{usdc ? usd(usdc.total) : '—'}</span></span>
        </div>
        <div className="input-wrap">
          <span className="prefix">$</span>
          <input id={id + 'stake'} inputMode="decimal" value={stake} onChange={(e) => onStake(e.target.value.replace(/[^0-9.]/g, ''))} className="num" />
          <button className="max-btn" disabled={!usdc || maxByUsdc <= 0} title={usdc ? 'Largest stake your USDC covers, fees included' : 'Sign in to use your USDC'}
            onClick={() => onStake(String(Math.min(maxByUsdc, maxStake)))}>Max</button>
        </div>
        {tooBig && <span className="field-err">Max {usd(maxStake, 0)} at {m}×</span>}
        {lacking && <span className="field-err">Not enough USDC</span>}
        {!lacking && usdc && elsewhere.length > 0 && (
          <span className="hint">Moves from {elsewhere.map((p) => p.chainName).join(', ')} when you open</span>
        )}
      </div>

      <div className="field">
        <div className="field-head">
          <span className="label">Multiplication</span>
          <span className="num m-value">{m}×</span>
        </div>
        <MultiplierSlider value={Math.min(m, max)} min={1} max={max} onChange={onM} />
        {max < market.maxM && <span className="hint">Up to {max}× {byReserve ? `(${usdCompact(available)} free to lend)` : 'at this amount'}</span>}
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor={id + 'limit'} className="label">Sell at (limit)</label>
          <span className="label">Optional</span>
        </div>
        <div className="input-wrap">
          <span className="prefix">$</span>
          <input id={id + 'limit'} inputMode="decimal" className="num" placeholder={'Above ' + price(market.price)}
            value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ''))} aria-invalid={!!limitErr} aria-describedby={limitErr ? id + 'limit-hint' : undefined} />
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
        {limitErr && <span id={id + 'limit-hint'} className="field-err">{limitErr}</span>}
      </div>

      <dl className="kv">
        {q.noLiquidation ? (
          <div><dt>Liquidation</dt><dd className="num ok">None at 1×</dd></div>
        ) : (
          <div><dt>Liquidation</dt><dd className="num down">{price(q.liqPrice)} <span className="liq-pct">▼ −{(q.liqMove * 100).toFixed(1)}%</span></dd></div>
        )}
        <div><dt>Position size</dt><dd className="num">{usd(q.notional)}</dd></div>
        <div><dt>Gas</dt><dd className="num">{usd(q.fees.gas)}</dd></div>
      </dl>

      <div className="waterfall">
        {preview ? (
          <>
            <div className="label">At {price(limitNum)} (▲ {pct(limitMove)})</div>
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
        {q.noLiquidation ? null : (
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
