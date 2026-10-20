import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Mark } from './Logo';

interface VentureMe { joined: boolean; joinedAt: string | null }

/** The vault: shakes on a loop, its bar fills halfway, then "crashes" back to zero. Static at 50 % with reduced motion. */
function Vault() {
  return (
    <div className="vx" aria-hidden="true">
      <svg className="vx-box" viewBox="0 0 220 200" width="220" height="200">
        <defs>
          <linearGradient id="vb-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2A2A2A" /><stop offset="1" stopColor="#121212" />
          </linearGradient>
          <linearGradient id="vb-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5A5A5A" /><stop offset=".5" stopColor="#262626" /><stop offset="1" stopColor="#3C3C3C" />
          </linearGradient>
          <radialGradient id="vb-door" cx=".4" cy=".35" r=".8">
            <stop offset="0" stopColor="#3A3A3A" /><stop offset="1" stopColor="#161616" />
          </radialGradient>
        </defs>
        {/* feet */}
        <rect x="34" y="182" width="26" height="10" rx="3" fill="#1C1C1C" />
        <rect x="160" y="182" width="26" height="10" rx="3" fill="#1C1C1C" />
        {/* body */}
        <rect x="14" y="8" width="192" height="178" rx="18" fill="url(#vb-edge)" />
        <rect x="20" y="14" width="180" height="166" rx="14" fill="url(#vb-body)" />
        <rect x="20" y="14" width="180" height="4" rx="2" fill="#FFD100" opacity=".85" />
        {/* hinges */}
        <rect x="24" y="44" width="8" height="26" rx="3" fill="#3A3A3A" />
        <rect x="24" y="122" width="8" height="26" rx="3" fill="#3A3A3A" />
        {/* door */}
        <circle cx="110" cy="88" r="56" fill="#0E0E0E" />
        <circle cx="110" cy="88" r="50" fill="url(#vb-door)" stroke="#4A4A4A" strokeWidth="2" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return <circle key={i} cx={110 + Math.cos(a) * 43} cy={88 + Math.sin(a) * 43} r="2.4" fill="#5C5C5C" />;
        })}
        <g className="vx-wheel">
          {[0, 60, 120].map((d) => (
            <rect key={d} x="80" y="85" width="60" height="6" rx="3" fill="#FFD100" transform={`rotate(${d} 110 88)`} />
          ))}
          <circle cx="110" cy="88" r="13" fill="#0A0A0A" stroke="#FFD100" strokeWidth="3" />
          <circle cx="110" cy="88" r="4" fill="#FFD100" />
        </g>
        {/* keypad light */}
        <circle className="vx-led" cx="178" cy="34" r="4" fill="#FFD100" />
      </svg>
      <div className="vx-bar"><i /></div>
      <div className="vx-scale num"><span>0%</span><span className="vx-pct">50%</span><span>100%</span></div>
    </div>
  );
}

/**
 * Shown to signed-in users while the product is not open yet (normal users cannot pass it).
 * "Participate" records one participation per account on the server.
 */
export function Venture() {
  const { me, signOut } = useAuth();
  const [state, setState] = useState<VentureMe | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    api<VentureMe>('/api/venture/me').then(setState).catch(() => setState({ joined: false, joinedAt: null }));
  }, []);

  const participate = async () => {
    setBusy(true); setErr(false);
    try {
      setState(await api<VentureMe>('/api/venture/participate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
    } catch { setErr(true); } finally { setBusy(false); }
  };

  return (
    <div className="soon" role="dialog" aria-modal="true" aria-labelledby="venture-title" tabIndex={-1} ref={ref}>
      <div className="soon-card venture-card">
        <div className="soon-mark"><Mark size={40} /></div>
        <Vault />
        <h1 id="venture-title">Join the venture!</h1>
        <div className="soon-account" aria-live="polite">
          {state === null ? (
            <span className="sk sk-w60 venture-sk" />
          ) : state.joined ? (
            <>
              <p className="venture-done">▲ You are in</p>
              <p className="soon-account-note">
                Participating since {new Date(state.joinedAt!).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}. We will let you in soon.
              </p>
            </>
          ) : (
            <button className="soon-signin" onClick={participate} disabled={busy} aria-busy={busy}>
              {busy ? 'Joining…' : 'Participate'}
            </button>
          )}
          {err && <p className="soon-account-note err">That did not go through. Try again.</p>}
          {me && <button className="soon-link" onClick={signOut}>Sign out</button>}
        </div>
        <p className="soon-legal"><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></p>
      </div>
    </div>
  );
}
