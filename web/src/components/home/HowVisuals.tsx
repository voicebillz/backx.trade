import { useEffect, useState } from 'react';
import { TOKEN_LOGO } from '../../lib/assets';

// Moving pictures for the front page "How it works" steps (owner 2026-10-22). CSS animations driven by a small
// phase counter; prefers-reduced-motion shows the finished state. Flat colours only, tokens from .home.

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function usePhase(n: number, ms: number) {
  const [i, setI] = useState(n - 1);
  useEffect(() => {
    if (reduced()) return;
    setI(0);
    const id = setInterval(() => setI((x) => (x + 1) % n), ms);
    return () => clearInterval(id);
  }, [n, ms]);
  return i;
}

const METHODS = ['Email', 'Google', 'X', 'Passkey'];
const ADDRS = ['0x7a3f…c91e', '0x19be…04d2', '0xc4d0…7f3a', '0x5e81…a6b9'];

/** Step 1: a login method lights up, then the wallet is created and its address appears. */
export function WalletVisual() {
  const phase = usePhase(METHODS.length * 3, 900);      // 3 beats per method: pick, creating, ready
  const m = Math.floor(phase / 3), beat = phase % 3;
  return (
    <div className="hv hv-wallet" aria-hidden="true">
      <div className="hv-methods">
        {METHODS.map((x, k) => <span key={x} className={'hv-chip' + (k === m ? ' on' : '')}>{x}</span>)}
      </div>
      <div className="hv-arrow"><i /></div>
      <div className={'hv-walletcard' + (beat === 2 ? ' ready' : beat === 1 ? ' busy' : '')}>
        <span className="hv-wicon">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 7a2 2 0 0 1 2-2h12v3H5v9h14v-3h2v5H5a2 2 0 0 1-2-2V7Zm13 4h6v4h-6a2 2 0 0 1 0-4Z" fill="currentColor" /></svg>
        </span>
        <span className="hv-wtext">
          <b className="num">{beat === 0 ? '—' : beat === 1 ? 'Creating…' : ADDRS[m]}</b>
          <small>Self-custody · Privy</small>
        </span>
        <span className="hv-check">✓</span>
      </div>
    </div>
  );
}

/** Step 2: USDC flows into the Hedge Pool and out to traders. */
export function IssueVisual() {
  return (
    <div className="hv hv-issue" aria-hidden="true">
      <div className="hv-node"><img className="hv-coin" src={TOKEN_LOGO.USDC} alt="" width="34" height="34" /><small>USDC</small></div>
      <div className="hv-pipe"><i /><i /><i /></div>
      <div className="hv-pool"><span className="hv-level" /><b>Hedge Pool</b></div>
      <div className="hv-pipe"><i /><i /><i /></div>
      <div className="hv-node"><span className="hv-traders"><i /><i /><i /></span><small>Traders</small></div>
    </div>
  );
}
