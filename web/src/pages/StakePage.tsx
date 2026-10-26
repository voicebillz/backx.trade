import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { usd } from '../lib/format';

// $GAZZ + Gazz Tanks staking, under Profile → Staking (owner 2026-10-26, contracts/src/BackxStaking.sol on Robinhood
// Chain). Stakers share the Treasury's holder share of platform revenue (10 %), in USDC, streamed continuously (each fee over 24 h). A stake is
// locked for 3 months from the latest stake; rewards can be claimed any time. Opens at launch: nothing is sent yet.
// Data: GET /api/stake/assets (server/src/stake.js) reads the user's own $GAZZ and Tanks on-chain (OpenSea later).
//   $GAZZ 0x08a5…85f3 (ERC-20, 18 decimals) · GAZZ TANKS 0x2613…a9f4 (ERC-721, 1,000, art drawn on-chain)
// OPEN (owner): how many $GAZZ one Tank counts as. Keep TANK_POINTS = server STAKING_TANK_POINTS.
export const TANK_POINTS = 10_000;
export const GAZZ_CA = '0x08a5d78a4bc7754e8aff87b4509e007baeb685f3';
export const TANKS_CA = '0x261371a1c467b82d43975cbe526c901b2a5ea9f4';
const LOCK_DAYS = 90;
const clean = (v: string) => v.replace(/[^0-9.]/g, '');
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

interface Tank { id: number; name: string; image: string | null }
interface Assets {
  gazz: { wallet: string; staked: string; decimals: number };
  tanks: { loading: boolean; owned: Tank[]; staked: Tank[] };
  staking: { unlockAt: number; earned: string } | null;
}
/** Base units → whole tokens, rounded down. */
const toTokens = (raw: string, dec: number) => {
  const b = BigInt(raw || '0'), unit = 10n ** BigInt(dec);
  return Number(b / unit) + Number((b % unit) / 10n ** BigInt(Math.max(dec - 4, 0))) / 1e4;
};


/** Round check that draws itself in when ticked. */
function Check({ on }: { on: boolean }) {
  return (
    <span className={'chk' + (on ? ' on' : '')} aria-hidden="true">
      <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.5 8.4 6.6 11.4 12.5 4.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}
type Mode = 'stake' | 'unstake';

function TankPicker({ tanks, loading, mode, picked, onDone, onClose }: {
  tanks: Tank[]; loading: boolean; mode: Mode; picked: number[]; onDone: (ids: number[]) => void; onClose: () => void;
}) {
  const [sel, setSel] = useState<Set<number>>(() => new Set(picked));
  const all = tanks.length > 0 && sel.size === tanks.length;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const verb = mode === 'stake' ? 'Stake' : 'Unstake';

  return createPortal(
    <div className="sheet-scrim center" onClick={onClose}>
      <div className="modal tank-modal" role="dialog" aria-modal="true" aria-label={`${verb} Gazz Tanks`} onClick={(e) => e.stopPropagation()}>
        <div className="tank-head">
          <img src="/gazz-tank.svg" alt="" width="36" height="36" />
          <div><h2>{verb} Gazz Tanks</h2><span className="muted small num">{tanks.length} {mode === 'stake' ? 'in your wallet' : 'staked'} · {sel.size} selected</span></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="tank-bar">
          <button type="button" className="tank-all" role="checkbox" aria-checked={all} disabled={!tanks.length}
            onClick={() => setSel(all ? new Set() : new Set(tanks.map((t) => t.id)))}>
            <Check on={all} /><span>Select all</span>
          </button>
          <span className="num muted small">{fmt(sel.size * TANK_POINTS)} points</span>
        </div>
        <div className="tank-grid" role="group" aria-label="Your Tanks">
          {loading && Array.from({ length: 6 }, (_, i) => <div key={i} className="tank-card sk" aria-hidden="true" />)}
          {!loading && tanks.map((t) => {
            const on = sel.has(t.id);
            return (
              <button key={t.id} type="button" className={'tank-card' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggle(t.id)}>
                {t.image ? <img src={t.image} alt="" loading="lazy" /> : <span className="tank-noimg" aria-hidden="true">#{t.id}</span>}
                <span className="tank-name">{t.name}</span>
                <span className="tank-check"><Check on={on} /></span>
              </button>
            );
          })}
          {!loading && tanks.length === 0 && (
            <div className="tank-empty">
              <img src="/gazz-tank.svg" alt="" width="64" height="64" />
              <p>{mode === 'stake' ? 'No Gazz Tanks in this wallet.' : 'No Tanks staked yet.'}</p>
              {mode === 'stake' && <a className="btn btn-ghost btn-sm" href="https://opensea.io/collection/gazztanks" target="_blank" rel="noopener noreferrer">View on OpenSea</a>}
            </div>
          )}
        </div>
        <div className="tank-foot">
          <button className="btn btn-ghost" onClick={() => { onDone(tanks.map((t) => t.id)); }} disabled={!tanks.length}>{verb} all</button>
          <button className="btn btn-primary" onClick={() => onDone([...sel])} disabled={!sel.size}>{verb} {sel.size || ''} {sel.size === 1 ? 'Tank' : 'Tanks'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function StakeTab() {
  const id = useId();
  const [mode, setMode] = useState<Mode>('stake');
  const [amount, setAmount] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [picker, setPicker] = useState(false);
  const [data, setData] = useState<Assets | null>(null);
  const [failed, setFailed] = useState(false);

  // Read the wallet; while the first Tanks scan is still running on the server, ask again every 10 s.
  useEffect(() => {
    let stop = false, timer = 0;
    const load = () => api<Assets>('/api/stake/assets').then((d) => {
      if (stop) return;
      setData(d); setFailed(false);
      if (d.tanks.loading) timer = window.setTimeout(load, 10_000);
    }).catch(() => { if (!stop) setFailed(true); });
    load();
    return () => { stop = true; clearTimeout(timer); };
  }, []);
  useEffect(() => { setPicked([]); setAmount(''); }, [mode]);

  const gazzWallet = data ? toTokens(data.gazz.wallet, data.gazz.decimals) : null;
  const gazzStaked = data ? toTokens(data.gazz.staked, data.gazz.decimals) : null;
  const tanks = data ? (mode === 'stake' ? data.tanks.owned : data.tanks.staked) : [];
  const stakedPts = (gazzStaked ?? 0) + (data?.tanks.staked.length ?? 0) * TANK_POINTS;
  const delta = Math.min(parseFloat(amount) || 0, (mode === 'stake' ? gazzWallet : gazzStaked) ?? Infinity) + picked.length * TANK_POINTS;
  const after = Math.max(0, stakedPts + (mode === 'stake' ? delta : -delta));
  const max = mode === 'stake' ? gazzWallet : gazzStaked;
  const unlockAt = data?.staking?.unlockAt ? new Date(data.staking.unlockAt * 1000) : null;
  const locked = !!unlockAt && unlockAt.getTime() > Date.now();
  const claimable = data?.staking ? toTokens(data.staking.earned, 6) : 0;
  const pickedTanks = tanks.filter((t) => picked.includes(t.id));

  return (
    <div className="stk">
      <section className="stk-hero">
        <div className="stk-hero-top">
          <div>
            <p className="eyebrow gold">Staking <span className="soon-badge">Coming soon</span></p>
            <h2>Earn from every trade on BackX</h2>
          </div>
          <div className="stk-hero-art" aria-hidden="true">
            <img src="/gazz-logo.svg" alt="" width="44" height="44" />
            <img src="/gazz-tank.svg" alt="" width="44" height="44" />
          </div>
        </div>
        <div className="stk-stats">
          <div><span className="label">Your points</span><b className="num">{fmt(stakedPts)}</b></div>
          <div><span className="label">Unlocks</span><b className="num stk-unlock">{locked ? day(unlockAt!) : stakedPts > 0 ? 'Now' : '—'}</b></div>
          <div className="stk-claim">
            <span className="label">Claimable</span><b className="num">{usd(claimable)} <small>USDC</small></b>
            <button className="btn btn-gold btn-sm" disabled title="One signature claims everything">Claim all</button>
          </div>
        </div>
      </section>

      <div className="stk-assets" aria-label="Your $GAZZ and Tanks">
        <div className="stk-asset">
          <img src="/gazz-logo.svg" alt="" width="40" height="40" />
          <span className="stk-asset-name">$GAZZ<small>1 point per token</small></span>
          <span className="stk-asset-num num"><small>Wallet · Staked</small>{gazzWallet == null ? (failed ? '—' : <span className="sk sk-w40" />) : `${fmt(gazzWallet)} · ${fmt(gazzStaked ?? 0)}`}</span>
        </div>
        <div className="stk-asset">
          <img src="/gazz-tank.svg" alt="" width="40" height="40" className="stk-tank-img" />
          <span className="stk-asset-name">Gazz Tanks<small>{fmt(TANK_POINTS)} points each</small></span>
          <span className="stk-asset-num num"><small>Wallet · Staked</small>{!data ? (failed ? '—' : <span className="sk sk-w40" />) : data.tanks.loading ? <span className="sk sk-w40" /> : `${data.tanks.owned.length} · ${data.tanks.staked.length}`}</span>
        </div>
      </div>

      <section className="card stk-form">
        <div className={'stk-mode' + (mode === 'unstake' ? ' right' : '')} role="radiogroup" aria-label="Stake or unstake">
          <span className="stk-mode-thumb" aria-hidden="true" />
          <button type="button" role="radio" aria-checked={mode === 'stake'} className={mode === 'stake' ? 'on' : ''} onClick={() => setMode('stake')}>Stake</button>
          <button type="button" role="radio" aria-checked={mode === 'unstake'} className={mode === 'unstake' ? 'on' : ''} onClick={() => setMode('unstake')}>Unstake</button>
        </div>

        <div className="field">
          <div className="field-head">
            <label htmlFor={id + 'amt'} className="label">$GAZZ</label>
            <span className="label num">{mode === 'stake' ? 'Wallet' : 'Staked'} {max == null ? '—' : fmt(max)}</span>
          </div>
          <div className="input-wrap stk-input">
            <input id={id + 'amt'} inputMode="decimal" className="num" placeholder="0" value={amount} onChange={(e) => setAmount(clean(e.target.value))} />
            <span className="prefix unit"><img src="/gazz-logo.svg" alt="" width="16" height="16" /> GAZZ</span>
            <button className="max-btn" disabled={!max} onClick={() => max && setAmount(String(Math.floor(max * 100) / 100))}>Max</button>
          </div>
          {max != null && (parseFloat(amount) || 0) > max && <span className="field-err">More than you have {mode === 'stake' ? 'in your wallet' : 'staked'}</span>}
        </div>

        <div className="field">
          <div className="field-head">
            <span className="label">Gazz Tanks</span>
            <span className="label num">{mode === 'stake' ? 'Wallet' : 'Staked'} {data && !data.tanks.loading ? tanks.length : '—'}</span>
          </div>
          <button type="button" className="stk-pick" onClick={() => setPicker(true)}>
            {pickedTanks.length ? (
              <span className="stk-pick-thumbs">
                {pickedTanks.slice(0, 6).map((t) => t.image ? <img key={t.id} src={t.image} alt="" /> : <span key={t.id} className="tank-noimg">#{t.id}</span>)}
                {pickedTanks.length > 6 && <span className="stk-pick-more num">+{pickedTanks.length - 6}</span>}
              </span>
            ) : <span className="muted">Choose Tanks</span>}
            <span className="stk-pick-count num">{picked.length ? `${picked.length} selected` : ''}</span>
          </button>
        </div>

        <div className="stk-after">
          <span>Points after</span>
          <b className="num">{fmt(after)}</b>
        </div>
        {mode === 'stake' && <p className="stk-lock">Locked until <b className="num">{day(new Date(Date.now() + LOCK_DAYS * 86_400_000))}</b> · rewards claimable any time</p>}
        {mode === 'unstake' && locked && <p className="stk-lock">Your stake unlocks on <b className="num">{day(unlockAt!)}</b></p>}
        <button className="btn btn-block btn-primary" disabled>Opens at launch</button>
        <p className="stk-lock">$GAZZ and Tanks go in one transaction, one signature. The very first time, the wallet also approves BackX staking once.</p>
      </section>

      <section className="stk-how" aria-label="How staking works">
        <div><span className="stk-step num">1</span><b>Stake</b><small>$GAZZ, Gazz Tanks or both</small></div>
        <div><span className="stk-step num">2</span><b>Earn</b><small>10 % of platform revenue, in USDC</small></div>
        <div><span className="stk-step num">3</span><b>Claim</b><small>Any time · stake locked 3 months</small></div>
      </section>

      <dl className="card kv stk-pool">
        <div><dt>Lock</dt><dd>3 months from your latest stake</dd></div>
        <div><dt>Payouts</dt><dd>USDC, continuously (24 h stream)</dd></div>
        <div><dt>$GAZZ</dt><dd className="num">{short(GAZZ_CA)} · Robinhood Chain</dd></div>
        <div><dt>Gazz Tanks</dt><dd className="num"><a href="https://opensea.io/collection/gazztanks" target="_blank" rel="noopener noreferrer">{short(TANKS_CA)}</a> · 1,000 on-chain</dd></div>
      </dl>

      {picker && (
        <TankPicker tanks={tanks} loading={!data || data.tanks.loading} mode={mode} picked={picked}
          onDone={(ids) => { setPicked(ids); setPicker(false); }} onClose={() => setPicker(false)} />
      )}
    </div>
  );
}
