import { useId, useState } from 'react';
import { CoinIcon } from '../components/CoinIcon';
import { usd } from '../lib/format';

// $GAZZ + Gazz Tanks staking (owner 2026-10-26, contracts/src/BackxStaking.sol). Stakers share the Treasury's holder
// share of platform revenue (10 %), paid in USDC and streamed over 7 days. Opens at launch: until then the page shows the
// rules and the forms, nothing is sent.
// OPEN (owner): the Gazz Tanks contract and how many $GAZZ one Tank counts as. Keep TANK_POINTS = server STAKING_TANK_POINTS.
export const TANK_POINTS = 10_000;
const GAZZ_CA = '0x08a5d78a4bc7754e8aff87b4509e007baeb685f3';
const clean = (v: string) => v.replace(/[^0-9.]/g, '');

export function StakePage() {
  const id = useId();
  const [mode, setMode] = useState<'stake' | 'unstake'>('stake');
  const [amount, setAmount] = useState('');
  const [tankIds, setTankIds] = useState('');
  const ids = tankIds.split(/[\s,]+/).filter(Boolean);
  const badIds = ids.some((x) => !/^\d{1,10}$/.test(x));
  const points = (parseFloat(amount) || 0) + (badIds ? 0 : ids.length) * TANK_POINTS;

  return (
    <main id="main" className="page stake-page">
      <header className="page-head">
        <div>
          <p className="eyebrow gold">Stake <span className="soon-badge">Coming soon</span></p>
          <h1>Stake $GAZZ and Gazz Tanks</h1>
        </div>
        <dl className="page-stats">
          <div><dt className="label">$GAZZ staked</dt><dd className="num">—</dd></div>
          <div><dt className="label">Tanks staked</dt><dd className="num">—</dd></div>
          <div><dt className="label">Paid to stakers</dt><dd className="num">—</dd></div>
          <div><dt className="label">Revenue share</dt><dd className="num">10 %</dd></div>
        </dl>
      </header>

      <section className="card rewards-card">
        <div>
          <p className="label">Your rewards</p>
          <p className="num rewards-amt">{usd(0)} <small className="muted">USDC</small></p>
        </div>
        <button className="btn btn-gold btn-sm" disabled>Claim</button>
      </section>

      <div className="stake-grid">
        <section className="card stake-card">
          <div className="stake-card-head"><span className="stake-ico gazz" aria-hidden="true">G</span><h2>$GAZZ</h2>
            <span className="num muted small">1 point per $GAZZ</span></div>
          <div className="act-tabs" role="tablist" aria-label="Stake or unstake">
            <button role="tab" aria-selected={mode === 'stake'} className={mode === 'stake' ? 'on' : ''} onClick={() => setMode('stake')}>Stake</button>
            <button role="tab" aria-selected={mode === 'unstake'} className={mode === 'unstake' ? 'on' : ''} onClick={() => setMode('unstake')}>Unstake</button>
          </div>
          <div className="field">
            <div className="field-head"><label htmlFor={id + 'amt'} className="label">Amount</label><span className="label num">{mode === 'stake' ? 'Wallet' : 'Staked'} —</span></div>
            <div className="input-wrap">
              <input id={id + 'amt'} inputMode="decimal" className="num" placeholder="0" value={amount} onChange={(e) => setAmount(clean(e.target.value))} />
              <span className="prefix unit">$GAZZ</span>
              <button className="max-btn" disabled>Max</button>
            </div>
          </div>
          <button className="btn btn-block btn-primary" disabled>Opens at launch</button>
        </section>

        <section className="card stake-card">
          <div className="stake-card-head"><span className="stake-ico tank" aria-hidden="true">T</span><h2>Gazz Tanks</h2>
            <span className="num muted small">1 Tank = {TANK_POINTS.toLocaleString('en-US')} points</span></div>
          <div className="act-tabs" role="tablist" aria-label="Stake or unstake Tanks">
            <button role="tab" aria-selected={mode === 'stake'} className={mode === 'stake' ? 'on' : ''} onClick={() => setMode('stake')}>Stake</button>
            <button role="tab" aria-selected={mode === 'unstake'} className={mode === 'unstake' ? 'on' : ''} onClick={() => setMode('unstake')}>Unstake</button>
          </div>
          <div className="field">
            <div className="field-head"><label htmlFor={id + 'ids'} className="label">Tank IDs</label><span className="label num">{mode === 'stake' ? 'Owned' : 'Staked'} —</span></div>
            <div className="input-wrap">
              <input id={id + 'ids'} inputMode="numeric" className="num" placeholder="e.g. 12, 345" value={tankIds} onChange={(e) => setTankIds(e.target.value.replace(/[^0-9,\s]/g, ''))} aria-invalid={badIds} />
            </div>
            {badIds && <span className="field-err">Whole numbers, separated by commas</span>}
          </div>
          <button className="btn btn-block btn-primary" disabled>Opens at launch</button>
        </section>
      </div>

      <section className="card stake-sum">
        <dl className="kv">
          <div><dt>Your points</dt><dd className="num">{points.toLocaleString('en-US', { maximumFractionDigits: 2 })}</dd></div>
          <div><dt>Rewards</dt><dd>USDC, streamed over 7 days</dd></div>
          <div><dt>Lock-up</dt><dd>None, unstake any time</dd></div>
          <div><dt>$GAZZ contract</dt><dd className="num stake-ca"><CoinIcon symbol="GAZZ" size={14} /> {GAZZ_CA.slice(0, 6)}…{GAZZ_CA.slice(-4)}</dd></div>
        </dl>
      </section>
    </main>
  );
}
