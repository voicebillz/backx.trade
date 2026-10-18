import { useCallback, useEffect, useRef, useState } from 'react';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { api, ApiError } from './api';
import type { AuthState, AuthStatus, Me } from './auth';

// Loaded lazily (Privy is ~2 MB), so the terminal and overlay paint without it.
// PrivyProvider only wraps this bridge: its modal renders in a portal, and the
// rest of the app talks to it through the auth context.
export default function PrivyBridge({ appId, onChange }: { appId: string; onChange: (s: AuthState) => void }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        // Social login only (docs/backx/SECURITY-AUTH.md): no external wallets.
        loginMethods: ['email', 'google', 'apple', 'twitter'],
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        appearance: { theme: '#0A0A0A', accentColor: '#FFD100', logo: '/backx-logo.png', walletChainType: 'ethereum-only' },
      }}
    >
      <Session onChange={onChange} />
    </PrivyProvider>
  );
}

function Session({ onChange }: { onChange: (s: AuthState) => void }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [me, setMe] = useState<Me | null>(null);
  const attempted = useRef<string | null>(null);

  // Existing backx session (cookie) first: a returning user needs no Privy round-trip.
  useEffect(() => {
    api<Me>('/api/auth/me')
      .then((m) => { setMe(m); setStatus('signedIn'); })
      .catch(() => setStatus('signedOut'));
  }, []);

  // Privy confirmed + embedded wallet exists → exchange the Privy token for a backx session.
  // Runs once per Privy user per page load: never loops on 401/409 (that got gazz.fun rate limited).
  useEffect(() => {
    if (!ready || !authenticated || !user || me || status === 'checking') return;
    const wallet = user.wallet?.walletClientType === 'privy' ? user.wallet.address : null;
    if (!wallet) { setStatus('connecting'); return; }
    if (attempted.current === user.id) return;
    attempted.current = user.id;
    setStatus('connecting');
    (async () => {
      for (let i = 0; i < 2; i++) {
        try {
          const token = await getAccessToken();
          if (!token) throw new ApiError(401, 'no_token');
          const m = await api<Me>('/api/auth/session', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
          setMe(m); setStatus('signedIn');
          return;
        } catch (e) {
          // Privy can need a moment before the new wallet shows on its API: one retry, then stop.
          if (e instanceof ApiError && e.status === 409 && i === 0) { await new Promise((r) => setTimeout(r, 2500)); continue; }
          setStatus('error');
          return;
        }
      }
    })();
  }, [ready, authenticated, user, me, status, getAccessToken]);

  const signIn = useCallback(() => {
    if (!ready) return;
    if (authenticated) { attempted.current = null; setStatus('signedOut'); return; } // retry the exchange
    login();
  }, [ready, authenticated, login]);

  const signOut = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* cookie is cleared server-side when reachable */ }
    setMe(null);
    attempted.current = null;
    setStatus('signedOut');
    if (authenticated) await logout();
  }, [authenticated, logout]);

  useEffect(() => { onChange({ status, me, signIn, signOut }); }, [status, me, signIn, signOut, onChange]);
  return null;
}
