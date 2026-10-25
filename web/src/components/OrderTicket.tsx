import { useEffect, useId, useState } from 'react';
import type { Market } from '../lib/markets';
import { price, usd, usdCompact } from '../lib/format';
import { FEES, KEEPER_GAS, LIMIT_SLIP, maxNotional, shortTier, type Quote, type Side } from '../lib/hedge';
import type { usdcOf } from '../lib/useBalances';
import { MultiplierSlider } from './MultiplierSlider';

interface Props {
  market: Market;
  /** The user's USDC (null when signed out). Every position is paid in USDC. */
  usdc: ReturnType<typeof usdcOf> | null;
  /** Buy = Hedge (price up, USDC lent), Sell = Short (price down, the coin itself lent). */
  side: Side;
  onSide: (s: Side) => void;
  /** Highest multiplication right now: the coin's cap, limited by what issuers can lend (contract maxMFor). */
  maxM: number;
  /** Short only: no coins issued yet, so it can only be placed as an order that fills once they are. */
  noCoins: boolean;
  /** USD value the reserve can still lend (USDC for Buy, the coin for Sell). */
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
/** Quick take-profit targets in the trade's direction. */
const STEPS = [0.1, 0.25, 0.5, 1];
/** Same precision as the price shown, so a chip fills a clean number. */
const roundPrice = (n: number) => parseFloat(n >= 1 ? n.toFixed(n >= 1000 ? 2 : 4) : n.toPrecision(4));
const clean = (v: string) => v.replace(/[^0-9.]/g, '');

/** Buy (Hedge) and Sell (Short) in one ticket, now or as an order at a price (owner 2026-10-25). */
export function OrderTicket({ market, usdc, side, onSide, maxM, noCoins, available, stake, onStake, m, onM, q }: Props) {
  const id = useId();
  const buy = side === 'hedge';
  const max = maxM;
  const lentMult = buy ? Math.max(m, 1) - 1 : Math.max(m, 1);
  const byReserve = max < (buy ? market.maxM : market.shortMaxM);
  // The amount typed is what the user pays; the position is m × (amount − fees). Max position → max amount.
  const feeRate = FEES.holders + FEES.rsfStake + lentMult * (FEES.borrow + FEES.rsfLent);
  const maxStake = Math.floor((maxNotional(market.depth) / Math.max(m, 1)) * (1 + feeRate) + KEEPER_GAS);
  const tooBig = (parseFloat(stake) || 0) > maxStake;
  const maxByUsdc = usdc ? Math.floor(usdc.total * 100) / 100 : 0;
  const lacking = usdc != null && (parseFloat(stake) || 0) > usdc.total + 1e-9;
  const elsewhere = usdc?.parts.filter((p) => p.chainName !== MARKET_CHAIN) ?? [];
  const roof = buy ? 0 : shortTier(market.maxM).roof;

  // Entry price (order) and take-profit (limit). Cleared on a new coin or side.
  const [entry, setEntry] = useState('');
  const [limit, setLimit] = useState('');
  useEffect(() => { setEntry(''); setLimit(''); }, [market.id, side]);
  const entryNum = parseFloat(entry);
  const hasEntry = entry !== '' && Number.isFinite(entryNum) && entryNum > 0;
  const isOrder = hasEntry || noCoins;
  const base = hasEntry ? entryNum : market.price; // limits are measured from where the position opens
  const limitNum = parseFloat(limit);
  const hasLimit = limit !== '' && Number.isFinite(limitNum);
  const limitErr = !hasLimit ? null
    : limitNum <= 0 ? 'Enter a price above 0.'
    : buy && limitNum <= base ? `Above ${price(base)}`
    : !buy && limitNum >= base ? `Below ${price(base)}`
    : null;
  const ratio = hasLimit && !limitErr ? limitNum / base : null;
  // Worst fill the contract allows: the limit minus limitSlip (sale) or plus it (buy-back).
  const preview = ratio ? q.at(ratio * (buy ? 1 - LIMIT_SLIP : 1 + LIMIT_SLIP)) : null;
  const win = q.ifWin10;
  const verb = buy ? 'Buy' : 'Sell';

  return (
    <aside className="panel ticket" aria-label="Order ticket">
      <div className="seg side-tabs" role="tablist" aria-label="Side">
        <button role="tab" aria-selected={buy} className={buy ? 'active buy' : ''} onClick={() => onSide('hedge')}><span aria-hidden="true">▲</span> Buy</button>
        <button role="tab" aria-selected={!buy} className={!buy ? 'active sell' : ''} onClick={() => onSide('short')}><span aria-hidden="true">▼</span> Sell</button>
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor={id + 'stake'} className="label">Amount (USDC)</label>
          <span className="label">USDC <span className="num">{usdc ? usd(usdc.total) : '—'}</span></span>
        </div>
        <div className="input-wrap">
          <span className="prefix">$</span>
          <input id={id + 'stake'} inputMode="decimal" value={stake} onChange={(e) => onStake(clean(e.target.value))} className="num" />
          <button className="max-btn" disabled={!usdc || maxByUsdc <= 0} title={usdc ? 'Largest amount your USDC covers, fees included' : 'Sign in to use your USDC'}
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
        {noCoins
          ? <span className="hint">No {market.symbol} issued yet: your order fills when it is</span>
          : byReserve && <span className="hint">Up to {max}× ({usdCompact(available)} free to lend)</span>}
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor={id + 'entry'} className="label">{verb} at</label>
          <span className="label">{hasEntry ? 'Order' : 'Optional · now'}</span>
        </div>
        <div className="input-wrap">
          <span className="prefix">$</span>
          <input id={id + 'entry'} inputMode="decimal" className="num" placeholder={price(market.price)}
            value={entry} onChange={(e) => setEntry(clean(e.target.value))} />
          {entry && <button className="max-btn" onClick={() => setEntry('')} aria-label="Clear order price">Clear</button>}
        </div>
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor={id + 'limit'} className="label">{buy ? 'Sell at (take profit)' : 'Buy back at (take profit)'}</label>
          <span className="label">Optional</span>
        </div>
        <div className="input-wrap">
          <span className="prefix">$</span>
          <input id={id + 'limit'} inputMode="decimal" className="num" placeholder={(buy ? 'Above ' : 'Below ') + price(base)}
            value={limit} onChange={(e) => setLimit(clean(e.target.value))} aria-invalid={!!limitErr} aria-describedby={limitErr ? id + 'limit-hint' : undefined} />
          {limit && <button className="max-btn" onClick={() => setLimit('')} aria-label="Clear take profit">Clear</button>}
        </div>
        <div className="chips" role="group" aria-label="Quick take profit">
          {STEPS.filter((f) => buy || f < roof).map((f) => {
            const v = roundPrice(base * (buy ? 1 + f : 1 - f));
            return (
              <button key={f} type="button" className={'chip-btn' + (hasLimit && limitNum === v ? ' on' : '')} onClick={() => setLimit(String(v))}>
                {buy ? '▲ +' : '▼ −'}{f * 100}%
              </button>
            );
          })}
        </div>
        {limitErr && <span id={id + 'limit-hint'} className="field-err">{limitErr}</span>}
      </div>

      <dl className="kv">
        {q.noLiquidation ? (
          <div><dt>Liquidation</dt><dd className="num ok">None at 1×</dd></div>
        ) : buy ? (
          <div><dt>Liquidation</dt><dd className="num down">{price(base * (1 - q.liqMove))} <span className="liq-pct">▼ −{(q.liqMove * 100).toFixed(1)}%</span></dd></div>
        ) : (
          <div><dt>Liquidation</dt><dd className="num down">{price(base * (1 + q.liqMove))} <span className="liq-pct">▲ +{(q.liqMove * 100).toFixed(1)}%</span></dd></div>
        )}
        {!buy && <div><dt>Profit roof</dt><dd className="num up">{price(base * (1 - roof))} <span className="liq-pct">▼ −{roof * 100}%</span></dd></div>}
        <div><dt>Position size</dt><dd className="num">{usd(q.notional)}</dd></div>
        <div><dt>Gas</dt><dd className="num">{usd(q.fees.gas * (isOrder ? 2 : 1))}</dd></div>
      </dl>

      <div className="waterfall">
        {preview ? (
          <>
            <div className="label">At {price(limitNum)} ({buy ? '▲' : '▼'} {pct(limitNum / base - 1)})</div>
            <div className="wf-row"><span>You</span><span className={'num ' + (preview.trader >= 0 ? 'up' : 'down')}>{signed(preview.trader)}</span></div>
            <div className="wf-row"><span>Issuers</span><span className="num gold">+{usd(preview.issuers)}</span></div>
          </>
        ) : (
          <>
            <div className="label">{buy ? 'If it rises 10%' : 'If it falls 10%'}</div>
            <div className="wf-row"><span>You</span><span className={'num ' + (win.trader >= 0 ? 'up' : 'down')}>{signed(win.trader)}</span></div>
            <div className="wf-row"><span>Issuers</span><span className="num gold">+{usd(win.issuers)}</span></div>
          </>
        )}
        {q.noLiquidation ? null : (
          <>
            <div className="label" style={{ marginTop: 8 }}>If liquidated</div>
            <div className="wf-row"><span>You keep</span><span className="num">{usd(q.ifLiquidated.traderKeeps)}</span></div>
          </>
        )}
      </div>

      <button className={'btn btn-block ' + (buy ? 'btn-primary' : 'btn-sell')} disabled>
        {isOrder ? 'Place order · ' : ''}{verb} {market.symbol} {Math.min(m, max)}×{hasEntry ? ` at ${price(entryNum)}` : ''}
      </button>
    </aside>
  );
}
