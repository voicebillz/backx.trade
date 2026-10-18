import { useCallback, useEffect, useRef, useState } from 'react';
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { api, ApiError } from './api';
import type { Me, PrivyState } from './auth';

interface Props {
  appId: string;
  checked: boolean;          // backx session check finished
  me: Me | null;
  onSession: (m: Me) => void;
  onState: (s: PrivyState) => void;
}

// Loaded lazily (Privy is ~2 MB), so the page paints without it. PrivyProvider
// only wraps this bridge: its modal renders in a portal of its own.
export default function PrivyBridge(props: Props) {
  return (
    <PrivyProvider
      appId={props.appId}
      config={{
        // No external wallets (docs/backx/SECURITY-AUTH.md): every method ends in the user's own embedded wallet.
        // Each method must also be switched on in the Privy dashboard. Apple returns once our own
        // Apple OAuth credentials are set up there.
        loginMethods: ['email', 'sms', 'google', 'twitter', 'discord', 'twitch', 'telegram', 'farcaster', 'passkey'],
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        appearance: { theme: '#0A0A0A', accentColor: '#FFD100', logo: '/backx-logo.png', walletChainType: 'ethereum-only' },
      }}
    >
      <Session {...props} />
    </PrivyProvider>
  );
}

function Session({ checked, me, onSession, onState }: Props) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(false);
  const attempted = useRef<string | null>(null);

  // Privy confirmed + embedded wallet exists → exchange the Privy token for a backx session.
  // Once per Privy user per page load: never loops on 401/409 (that got gazz.fun rate limited).
  useEffect(() => {
    if (!ready || !authenticated || !user || !checked || me) return;
    const wallet = user.wallet?.walletClientType === 'privy' ? user.wallet.address : null;
    if (!wallet) { setConnecting(true); return; } // Privy is still creating it
    if (attempted.current === user.id) return;
    attempted.current = user.id;
    setConnecting(true);
    setError(false);
    (async () => {
      for (let i = 0; i < 2; i++) {
        try {
          const token = await getAccessToken();
          if (!token) throw new ApiError(401, 'no_token');
          onSession(await api<Me>('/api/auth/session', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }));
          setConnecting(false);
          return;
        } catch (e) {
          // Privy can need a moment before the new wallet shows on its API: one retry, then stop.
          if (e instanceof ApiError && e.status === 409 && i === 0) { await new Promise((r) => setTimeout(r, 2500)); continue; }
          setConnecting(false);
          setError(true);
          return;
        }
      }
    })();
  }, [ready, authenticated, user, checked, me, getAccessToken, onSession]);

  const signIn = useCallback(() => {
    if (!ready) return;
    if (authenticated) { attempted.current = null; setError(false); setConnecting(false); return; } // retry the exchange
    login();
  }, [ready, authenticated, login]);

  const signOut = useCallback(async () => {
    attempted.current = null;
    setError(false);
    setConnecting(false);
    if (authenticated) await logout();
  }, [authenticated, logout]);

  useEffect(() => {
    onState({ ready, connecting, error, login: signIn, logout: signOut });
  }, [ready, connecting, error, signIn, signOut, onState]);

  return null;
}
