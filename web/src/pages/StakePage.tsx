import { useId, useState } from 'react';
import { usd } from '../lib/format';
import type { Balances } from '../lib/useBalances';

// $GAZZ + Gazz Tanks staking, under Profile → Staking (owner 2026-10-26, contracts/src/BackxStaking.sol on Robinhood
// Chain). Stakers share the Treasury's holder share of platform revenue (10 %), in USDC, streamed over 7 days.
// Opens at launch: until then the tab shows the rules and the forms, nothing is sent.
// $GAZZ: 0x08a5…85f3 on Robinhood Chain (checked on-chain 2026-10-26: "Gazz" / GAZZ, 18 decimals, 100M supply).
// OPEN (owner): the Gazz Tanks contract and how many $GAZZ one Tank counts as. Keep TANK_POINTS = server STAKING_TANK_POINTS.
export const TANK_POINTS = 10_000;
export const GAZZ_CA = '0x08a5d78a4bc7754e8aff87b4509e007baeb685f3';
const clean = (v: string) => v.replace(/[^0-9.]/g, '');
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

type Asset = 'gazz' | 'tanks';

function TankIcon() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 20h20a3 3 0 0 1 0 6H6a3 3 0 0 1 0-6Z" /><path d="M9 20v-4h12l2 4" /><path d="M14 16v-3h5" /><path d="M19 14.5h8" />
      <circle cx="9" cy="23" r="1" /><circle cx="16" cy="23" r="1" /><circle cx="23" cy="23" r="1" />
    </svg>
  );
}

export function StakeTab({ balances }: { balances: { data: Balances | null } }) {
  const id = useId();
  const [asset, setAsset] = useState<Asset>('gazz');
  const [mode, setMode] = useState<'stake' | 'unstake'>('stake');
  const [amount, setAmount] = useState('');
  const [tankIds, setTankIds] = useState('');
  const gazzBal = balances.data?.assets.filter((a) => a.symbol.toUpperCase() === 'GAZZ').reduce((s, a) => s + Number(a.amount), 0) ?? null;
  const ids = [...new Set(tankIds.split(/[\s,]+/).filter(Boolean))];
  const badIds = ids.some((x) => !/^\d{1,10}$/.test(x));
  const addPts = asset === 'gazz' ? parseFloat(amount) || 0 : badIds ? 0 : ids.length * TANK_POINTS;
  const sign = mode === 'stake' ? 1 : -1;

  return (
    <div className="stk">
      <section className="stk-hero">
        <div className="stk-hero-top">
          <div>
            <p className="eyebrow gold">Staking <span className="soon-badge">Coming soon</span></p>
            <h2>Earn from every trade on BackX</h2>
          </div>
          <img src="/gazz-logo.svg" alt="" width="48" height="48" className="stk-hero-logo" />
        </div>
        <div className="stk-stats">
          <div><span className="label">Your points</span><b className="num">0</b></div>
          <div><span className="label">Pool share</span><b className="num">0 %</b></div>
          <div className="stk-claim">
            <span className="label">Claimable</span><b className="num">{usd(0)} <small>USDC</small></b>
            <button className="btn btn-gold btn-sm" disabled>Claim</button>
          </div>
        </div>
      </section>

      <div className="stk-assets" role="tablist" aria-label="What to stake">
        <button role="tab" aria-selected={asset === 'gazz'} className={'stk-asset' + (asset === 'gazz' ? ' on' : '')} onClick={() => setAsset('gazz')}>
          <img src="/gazz-logo.svg" alt="" width="36" height="36" />
          <span className="stk-asset-name">$GAZZ<small>1 point per token</small></span>
          <span className="stk-asset-num num"><small>Staked</small>0</span>
        </button>
        <button role="tab" aria-selected={asset === 'tanks'} className={'stk-asset' + (asset === 'tanks' ? ' on' : '')} onClick={() => setAsset('tanks')}>
          <span className="stk-tank"><TankIcon /></span>
          <span className="stk-asset-name">Gazz Tanks<small>{fmt(TANK_POINTS)} points each</small></span>
          <span className="stk-asset-num num"><small>Staked</small>0</span>
        </button>
      </div>

      <section className="card stk-form" role="tabpanel">
        <div className={'stk-mode' + (mode === 'unstake' ? ' right' : '')} role="radiogroup" aria-label="Stake or unstake">
          <span className="stk-mode-thumb" aria-hidden="true" />
          <button type="button" role="radio" aria-checked={mode === 'stake'} className={mode === 'stake' ? 'on' : ''} onClick={() => setMode('stake')}>Stake</button>
          <button type="button" role="radio" aria-checked={mode === 'unstake'} className={mode === 'unstake' ? 'on' : ''} onClick={() => setMode('unstake')}>Unstake</button>
        </div>

        {asset === 'gazz' ? (
          <div className="field">
            <div className="field-head">
              <label htmlFor={id + 'amt'} className="label">Amount</label>
              <span className="label num">{mode === 'stake' ? 'Wallet' : 'Staked'} {mode === 'stake' && gazzBal != null ? fmt(gazzBal) : '—'}</span>
            </div>
            <div className="input-wrap stk-input">
              <input id={id + 'amt'} inputMode="decimal" className="num" placeholder="0" value={amount} onChange={(e) => setAmount(clean(e.target.value))} />
              <span className="prefix unit"><img src="/gazz-logo.svg" alt="" width="16" height="16" /> GAZZ</span>
              <button className="max-btn" disabled={!(mode === 'stake' && gazzBal)} onClick={() => gazzBal && setAmount(String(Math.floor(gazzBal * 100) / 100))}>Max</button>
            </div>
            <div className="chips stk-quick" role="group" aria-label="Quick amounts">
              {[5_000, 25_000, 100_000].map((v) => <button key={v} type="button" className="chip-btn" onClick={() => setAmount(String(v))}>{fmt(v)}</button>)}
            </div>
          </div>
        ) : (
          <div className="field">
            <div className="field-head">
              <label htmlFor={id + 'ids'} className="label">Tank IDs</label>
              <span className="label num">{mode === 'stake' ? 'Owned' : 'Staked'} —</span>
            </div>
            <div className="input-wrap stk-input">
              <input id={id + 'ids'} inputMode="numeric" className="num" placeholder="12, 345" value={tankIds} aria-invalid={badIds}
                onChange={(e) => setTankIds(e.target.value.replace(/[^0-9,\s]/g, ''))} />
            </div>
            {badIds ? <span className="field-err">Whole numbers, separated by commas</span> : ids.length > 0 && (
              <div className="stk-ids">{ids.map((x) => <span key={x} className="stk-id num">#{x}</span>)}</div>
            )}
          </div>
        )}

        <div className="stk-after">
          <span>Points after</span>
          <b className="num">{fmt(Math.max(0, sign * addPts))}</b>
        </div>
        <button className="btn btn-block btn-primary" disabled>Opens at launch</button>
      </section>

      <section className="stk-how" aria-label="How staking works">
        <div><span className="stk-step num">1</span><b>Stake</b><small>$GAZZ, Gazz Tanks or both</small></div>
        <div><span className="stk-step num">2</span><b>Earn</b><small>10 % of platform revenue, in USDC</small></div>
        <div><span className="stk-step num">3</span><b>Claim</b><small>Any time, no lock-up</small></div>
      </section>

      <dl className="card kv stk-pool">
        <div><dt>$GAZZ staked</dt><dd className="num">—</dd></div>
        <div><dt>Tanks staked</dt><dd className="num">—</dd></div>
        <div><dt>Paid to stakers</dt><dd className="num">—</dd></div>
        <div><dt>Payouts</dt><dd>Streamed over 7 days</dd></div>
        <div><dt>$GAZZ contract</dt><dd className="num">{GAZZ_CA.slice(0, 6)}…{GAZZ_CA.slice(-4)} · Robinhood Chain</dd></div>
      </dl>
    </div>
  );
}
