import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Market } from '../lib/markets';
import { price, usd, usdCompact } from '../lib/format';
import { FEES, KEEPER_GAS, LIMIT_SLIP, maxNotional, shortTier, type Quote, type Side } from '../lib/hedge';
import type { usdcOf } from '../lib/useBalances';
import { MultiplierSlider } from './MultiplierSlider';
import { CoinIcon } from './CoinIcon';
import { DEMO_POSITIONS, pnlOf, type DemoPosition } from '../lib/demoPositions';

export type Action = 'buy' | 'sell';

interface Props {
  market: Market;
  /** The user's USDC (null when signed out). Every position is paid in USDC. */
  usdc: ReturnType<typeof usdcOf> | null;
  /** Hedge (price up, USDC lent) or Short (price down, the coin itself lent): the flip at the top. */
  side: Side;
  onSide: (s: Side) => void;
  /** Buy opens a position on that side (you also buy into a short), Sell closes one you hold. */
  action: Action;
  onAction: (a: Action) => void;
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
  /** Open the swap overlay to get a coin (USDC when the wallet has too little). */
  onSwap: (symbol: string) => void;
}

const MARKET_CHAIN = 'Robinhood Chain';
const signed = (n: number) => (n >= 0 ? '+' : '−') + usd(Math.abs(n));
const pct = (f: number) => (f >= 0 ? '+' : '−') + Math.abs(f * 100).toFixed(1) + '%';
const STEPS = [0.1, 0.25, 0.5, 1];
const roundPrice = (n: number) => parseFloat(n >= 1 ? n.toFixed(n >= 1000 ? 2 : 4) : n.toPrecision(4));
const clean = (v: string) => v.replace(/[^0-9.]/g, '');

/** A clean on/off switch: the knob carries a check when on. The whole row is the hit area. */
function Toggle({ on, onChange, label, aside, children }: { on: boolean; onChange: (v: boolean) => void; label: string; aside?: string; children?: ReactNode }) {
  return (
    <div className={'opt-tile' + (on ? ' on' : '')}>
      <button type="button" role="switch" aria-checked={on} className="opt-head" onClick={() => onChange(!on)}>
        <span className="opt-label">{label}</span>
        {aside && !on && <span className="opt-aside num">{aside}</span>}
        <span className="tgl" aria-hidden="true"><span className="tgl-knob"><svg viewBox="0 0 12 12" width="10" height="10"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span></span>
      </button>
      {on && <div className="opt-body">{children}</div>}
    </div>
  );
}

/** Hedge | Short flip on top, Buy | Sell below: open a position now or as a limit order, or sell one you hold (owner 2026-10-25). */
export function OrderTicket({ market, usdc, side, onSide, action, onAction, maxM, noCoins, available, stake, onStake, m, onM, q, onSwap }: Props) {
  const id = useId();
  const buy = side === 'hedge';
  const max = maxM;
  const amount = parseFloat(stake) || 0;
  const lentMult = buy ? Math.max(m, 1) - 1 : Math.max(m, 1);
  const byReserve = max < (buy ? market.maxM : market.shortMaxM);
  const feeRate = FEES.holders + FEES.rsfStake + lentMult * (FEES.borrow + FEES.rsfLent);
  const maxStake = Math.floor((maxNotional(market.depth) / Math.max(m, 1)) * (1 + feeRate) + KEEPER_GAS);
  const tooBig = amount > maxStake;
  const maxByUsdc = usdc ? Math.floor(usdc.total * 100) / 100 : 0;
  const lacking = usdc != null && amount > usdc.total + 1e-9;
  const elsewhere = usdc?.parts.filter((p) => p.chainName !== MARKET_CHAIN) ?? [];
  const roof = buy ? 0 : shortTier(market.maxM).roof;

  // Limit order (switch) and take-profit. Cleared on a new coin or side.
  const [limitOn, setLimitOn] = useState(false);
  const [entry, setEntry] = useState('');
  const [tpOn, setTpOn] = useState(false);
  const [tp, setTp] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [selling, setSelling] = useState<DemoPosition | null>(null);
  useEffect(() => { setEntry(''); setTp(''); }, [market.id, side]);
  const cap = buy ? market.maxM : market.shortMaxM; // what the coin supports at all
  const multOn = m >= 2;
  const held = DEMO_POSITIONS.filter((p) => p.sym === market.symbol && p.side === side).map((p) => ({ ...p, mark: market.price }));
  const sideName = buy ? 'Hedge' : 'Short';
  const entryNum = parseFloat(entry);
  const isOrder = limitOn || noCoins;
  const entryOk = limitOn && Number.isFinite(entryNum) && entryNum > 0;
  const entryMove = entryOk ? entryNum / market.price - 1 : 0;
  // Limit checks: a value is required; which side of the price it is on decides when it fills.
  const entryErr = !limitOn ? null : entry === '' ? 'Enter a limit price' : !entryOk ? 'Enter a price above 0' : null;
  const entryNote = !entryOk ? null
    : Math.abs(entryMove) < 0.0005 ? { warn: true, text: 'At today\'s price: fills right away' }
    : buy && entryMove > 0 ? { warn: true, text: `Above today's price (▲ ${pct(entryMove)}): fills when it rises to it` }
    : !buy && entryMove < 0 ? { warn: true, text: `Below today's price (▼ ${pct(entryMove)}): fills when it falls to it` }
    : Math.abs(entryMove) > 0.5 ? { warn: true, text: `Far from today's price (${pct(entryMove)})` }
    : { warn: false, text: `Fills at ${price(entryNum)} (${buy ? '▼' : '▲'} ${pct(entryMove)})` };
  const base = entryOk ? entryNum : market.price; // take-profit is measured from where the position opens
  const tpNum = parseFloat(tp);
  const hasTp = tpOn && tp !== '' && Number.isFinite(tpNum);
  const tpErr = !hasTp ? null
    : tpNum <= 0 ? 'Enter a price above 0'
    : buy && tpNum <= base ? `Above ${price(base)}`
    : !buy && tpNum >= base ? `Below ${price(base)}`
    : !buy && tpNum < base * (1 - roof) ? `The roof closes it at ${price(base * (1 - roof))}`
    : null;
  const ratio = hasTp && !tpErr ? tpNum / base : null;
  const preview = ratio ? q.at(ratio * (buy ? 1 - LIMIT_SLIP : 1 + LIMIT_SLIP)) : null;
  const liqPrice = buy ? base * (1 - q.liqMove) : base * (1 + q.liqMove);
  const invalid = !(amount > 0) || tooBig || !!entryErr || !!tpErr;

  return (
    <aside className={'panel ticket' + (buy ? '' : ' is-short')} aria-label="Order ticket">
      <button type="button" role="switch" aria-checked={!buy} aria-label={buy ? 'Hedge. Switch to Short' : 'Short. Switch to Hedge'}
        className={'side-switch' + (buy ? '' : ' short')} onClick={() => onSide(buy ? 'short' : 'hedge')}>
        <span className="side-thumb" aria-hidden="true" />
        <span className={'side-opt' + (buy ? ' on' : '')}>▲ Hedge</span>
        <span className={'side-opt' + (!buy ? ' on' : '')}>▼ Short</span>
      </button>

      <div className="act-tabs" role="tablist" aria-label="Buy or sell">
        <button role="tab" aria-selected={action === 'buy'} className={action === 'buy' ? 'on' : ''} onClick={() => onAction('buy')}>Buy</button>
        <button role="tab" aria-selected={action === 'sell'} className={action === 'sell' ? 'on' : ''} onClick={() => onAction('sell')}>
          Sell{held.length > 0 && <span className="act-count num">{held.length}</span>}</button>
      </div>

      {action === 'sell' ? (
        <div className="sell-list">
          {held.length === 0 ? (
            <div className="sell-empty">
              <p>No open {sideName} in {market.symbol}</p>
              <button className="btn-mini" onClick={() => onAction('buy')}>Buy {sideName}</button>
            </div>
          ) : held.map((p) => {
            const pnl = pnlOf(p);
            return (
              <div className="sell-row" key={p.sym + p.side + p.m + p.entry}>
                <div className="sell-main">
                  <span className="cell-market"><CoinIcon symbol={p.sym} src={market.image} size={18} /><b>{p.sym}</b><span className="m-chip num">{p.m}×</span></span>
                  <span className={'num ' + (pnl >= 0 ? 'up' : 'down')}>{pnl >= 0 ? '▲' : '▼'} {signed(pnl)}</span>
                </div>
                <div className="sell-meta num"><span>{usd(p.size)}</span><span>Entry {price(p.entry)}</span></div>
                <button className={'btn btn-block ' + (buy ? 'btn-sell' : 'btn-primary')} onClick={() => setSelling(p)}>Sell {sideName}</button>
              </div>
            );
          })}
          {held.length > 0 && <span className="demo-tag sell-demo">Demo data</span>}
        </div>
      ) : (<>

      <div className="field">
        <div className="field-head">
          <label htmlFor={id + 'stake'} className="label">Amount</label>
          <span className="label"><CoinIcon symbol="USDC" size={12} /> <span className="num">{usdc ? usd(usdc.total) : '—'}</span></span>
        </div>
        <div className="input-wrap">
          <span className="prefix">$</span>
          <input id={id + 'stake'} inputMode="decimal" value={stake} onChange={(e) => onStake(clean(e.target.value))} className="num" />
          <span className="prefix unit"><CoinIcon symbol="USDC" size={16} /> USDC</span>
          <button className="max-btn" disabled={!usdc || maxByUsdc <= 0} onClick={() => onStake(String(Math.min(maxByUsdc, maxStake)))}>Max</button>
        </div>
        {tooBig && <span className="field-err">Max {usd(maxStake, 0)} at {m}×</span>}
        {lacking && (
          <span className="field-err row-between">Not enough USDC
            <button type="button" className="btn-mini" onClick={() => onSwap('USDC')}>Swap to USDC</button></span>
        )}
        {!lacking && usdc && elsewhere.length > 0 && <span className="hint">Moves from {elsewhere.map((p) => p.chainName).join(', ')}</span>}
      </div>

      {cap > 1 && (multOn ? (
        <div className="field mult-open">
          <div className="field-head">
            <span className="label">Multiplication</span>
            <span className="num m-value">{m}×</span>
          </div>
          <MultiplierSlider value={Math.min(m, max)} min={1} max={max} onChange={onM} />
          {noCoins ? <span className="hint">No {market.symbol} issued yet: fills as an order</span>
            : byReserve && <span className="hint">Up to {max}× · {usdCompact(available)} free</span>}
        </div>
      ) : (
        <button type="button" className="mult-activate" disabled={max < 2} onClick={() => onM(2)}>
          <span className="mult-x num" aria-hidden="true">×</span>
          <span className="mult-txt">Activate multiplication</span>
          <span className="num mult-max">{max < 2 ? 'Nothing free' : `up to ${max}×`}</span>
        </button>
      ))}

      <Toggle label="Limit order" aside={price(market.price)} on={limitOn} onChange={(v) => { setLimitOn(v); if (!v) setEntry(''); }}>
        <div className="input-wrap">
          <span className="prefix">$</span>
          <input id={id + 'entry'} inputMode="decimal" className="num" placeholder={price(market.price)} aria-label="Buy at price" autoFocus
            value={entry} onChange={(e) => setEntry(clean(e.target.value))} aria-invalid={!!entryErr} />
          <span className="prefix unit">Buy at</span>
        </div>
        {entryErr ? <span className="field-err">{entryErr}</span>
          : entryNote && <span className={entryNote.warn ? 'field-warn' : 'hint'}>{entryNote.text}</span>}
      </Toggle>

      <Toggle label="Take profit" on={tpOn} onChange={(v) => { setTpOn(v); if (!v) setTp(''); }}>
        <div className="input-wrap">
          <span className="prefix">$</span>
          <input id={id + 'tp'} inputMode="decimal" className="num" placeholder={(buy ? 'Above ' : 'Below ') + price(base)} aria-label="Take profit price"
            value={tp} onChange={(e) => setTp(clean(e.target.value))} aria-invalid={!!tpErr} />
        </div>
        <div className="chips" role="group" aria-label="Quick take profit">
          {STEPS.filter((f) => buy || f < roof).map((f) => {
            const v = roundPrice(base * (buy ? 1 + f : 1 - f));
            return (
              <button key={f} type="button" className={'chip-btn' + (hasTp && tpNum === v ? ' on' : '')} onClick={() => setTp(String(v))}>
                {buy ? '▲ +' : '▼ −'}{f * 100}%
              </button>
            );
          })}
        </div>
        {tpErr && <span className="field-err">{tpErr}</span>}
      </Toggle>

      <dl className="kv">
        {!q.noLiquidation && (
          <div><dt>Liquidation</dt><dd className="num down">{price(liqPrice)} <span className="liq-pct">{buy ? '▼ −' : '▲ +'}{(q.liqMove * 100).toFixed(1)}%</span></dd></div>
        )}
        {!buy && <div><dt>Profit roof</dt><dd className="num up">{price(base * (1 - roof))} <span className="liq-pct">▼ −{roof * 100}%</span></dd></div>}
        <div><dt>Position size</dt><dd className="num">{usd(q.notional)}</dd></div>
        <div><dt>Gas</dt><dd className="num">{usd(q.fees.gas * (isOrder ? 2 : 1))}</dd></div>
      </dl>

      <div className="waterfall">
        <div className="label">{preview ? `At ${price(tpNum)}` : buy ? 'If it rises 10%' : 'If it falls 10%'}</div>
        <div className="wf-row"><span>You</span><span className={'num ' + ((preview ?? q.ifWin10).trader >= 0 ? 'up' : 'down')}>{signed((preview ?? q.ifWin10).trader)}</span></div>
        {!q.noLiquidation && <div className="wf-row"><span>Issuers</span><span className="num gold">+{usd((preview ?? q.ifWin10).issuers)}</span></div>}
      </div>

      <button className={'btn btn-block ' + (buy ? 'btn-primary' : 'btn-sell')} disabled={invalid} onClick={() => setConfirm(true)}>
        {isOrder ? 'Place order · ' : ''}Buy {sideName} {market.symbol}{multOn ? ` ${Math.min(m, max)}×` : ''}
      </button>
      </>)}

      {confirm && createPortal(
        <div className="sheet-scrim center confirm-overlay" onClick={() => setConfirm(false)}>
          <div className="modal confirm-modal" role="dialog" aria-modal="true" aria-label="Confirm order" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn modal-close" onClick={() => setConfirm(false)} aria-label="Close">✕</button>
            <div className="modal-title"><CoinIcon symbol={market.symbol} src={market.image} size={32} />
              <div><p className={'eyebrow ' + (buy ? 'up' : 'down')}>{buy ? '▲ Buy Hedge' : '▼ Buy Short'}{isOrder ? ' · Limit order' : ''}</p><h2>{market.symbol} {Math.min(m, max)}×</h2></div></div>
            <dl className="kv confirm-kv">
              <div><dt>You pay</dt><dd className="num"><CoinIcon symbol="USDC" size={14} /> {usd(amount)}</dd></div>
              <div><dt>{isOrder ? 'Buy at' : 'Price now'}</dt><dd className="num">{entryOk ? price(entryNum) : price(market.price)}</dd></div>
              <div><dt>Position size</dt><dd className="num">{usd(q.notional)}</dd></div>
              {!q.noLiquidation && <div><dt>Liquidation</dt><dd className="num down">{`${price(liqPrice)} ${buy ? '▼ −' : '▲ +'}${(q.liqMove * 100).toFixed(1)}%`}</dd></div>}
              {!buy && <div><dt>Profit roof</dt><dd className="num up">{price(base * (1 - roof))} ▼ −{roof * 100}%</dd></div>}
              {hasTp && !tpErr && <div><dt>Take profit</dt><dd className="num">{price(tpNum)}</dd></div>}
              <div><dt>Gas</dt><dd className="num">{usd(q.fees.gas * (isOrder ? 2 : 1))}</dd></div>
            </dl>
            {lacking
              ? <button className="btn btn-block btn-gold" onClick={() => { setConfirm(false); onSwap('USDC'); }}><CoinIcon symbol="USDC" size={16} /> Get USDC · Swap</button>
              : <button className={'btn btn-block ' + (buy ? 'btn-primary' : 'btn-sell')} disabled>Opens at launch</button>}
          </div>
        </div>,
        document.body,
      )}

      {selling && createPortal(
        <div className="sheet-scrim center confirm-overlay" onClick={() => setSelling(null)}>
          <div className="modal confirm-modal" role="dialog" aria-modal="true" aria-label="Confirm sell" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn modal-close" onClick={() => setSelling(null)} aria-label="Close">✕</button>
            <div className="modal-title"><CoinIcon symbol={selling.sym} src={market.image} size={32} />
              <div><p className={'eyebrow ' + (buy ? 'up' : 'down')}>{buy ? '▲ Sell Hedge' : '▼ Sell Short'}</p><h2>{selling.sym} {selling.m}×</h2></div></div>
            <dl className="kv confirm-kv">
              <div><dt>Position</dt><dd className="num">{usd(selling.size)}</dd></div>
              <div><dt>Entry</dt><dd className="num">{price(selling.entry)}</dd></div>
              <div><dt>Price now</dt><dd className="num">{price(market.price)}</dd></div>
              <div><dt>Result</dt><dd className={'num ' + (pnlOf(selling) >= 0 ? 'up' : 'down')}>{pnlOf(selling) >= 0 ? '▲' : '▼'} {signed(pnlOf(selling))}</dd></div>
              <div><dt>Gas</dt><dd className="num ok">Refunded</dd></div>
            </dl>
            <button className={'btn btn-block ' + (buy ? 'btn-sell' : 'btn-primary')} disabled>Opens at launch</button>
          </div>
        </div>,
        document.body,
      )}
    </aside>
  );
}
