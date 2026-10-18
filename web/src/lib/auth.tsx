import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface Me {
  address: string;
  solanaAddress: string | null;
  isAdmin: boolean;
  avatarSeed: number;
  memberSince: string;
  signupMethod: string | null;
  avatarUrl: string | null;   // uploaded picture (data URL), null = generated avatar
}

/** A login linked to the Privy account (email, google, passkey, ...), for the Security page. */
export interface LinkedLogin { type: string; label: string }

export interface EvmTx { chainId: number; to: `0x${string}`; value?: bigint; data?: `0x${string}`; description: string }

/** Account actions that need Privy; available once the Privy bridge has loaded. */
export interface PrivyActions {
  linked: LinkedLogin[];
  passkeys: number;
  mfaMethods: string[];
  linkPasskey: () => void;
  link: (type: 'email' | 'phone' | 'google' | 'twitter' | 'discord' | 'twitch' | 'telegram' | 'farcaster') => void;
  showMfa: () => void;
  exportWallet: (address: string) => Promise<void>;
  sendEvm: (tx: EvmTx) => Promise<string>;
}
export type AuthStatus = 'checking' | 'signedOut' | 'connecting' | 'signedIn' | 'error' | 'unavailable';

export interface AuthState {
  status: AuthStatus;
  me: Me | null;
  /** Privy has loaded and the login modal can open. */
  canSignIn: boolean;
  signIn: () => void;
  signOut: () => Promise<void>;
  /** Revokes every backx session for this account, then signs out here. */
  signOutEverywhere: () => Promise<void>;
  actions: PrivyActions | null;
  /** Replace the profile after a change (e.g. new picture). */
  updateMe: (m: Me) => void;
}

/** What the lazily loaded Privy bridge reports back. */
export interface PrivyState {
  ready: boolean;
  connecting: boolean;
  error: boolean;
  login: () => void;
  logout: () => Promise<void>;
  actions: PrivyActions | null;
}

const noop = () => {};
const Ctx = createContext<AuthState>({
  status: 'unavailable', me: null, canSignIn: false, signIn: noop, signOut: async () => {}, signOutEverywhere: async () => {}, actions: null, updateMe: noop,
});
export const useAuth = () => useContext(Ctx);

const APP_ID = import.meta.env.VITE_PRIVY_APP_ID?.trim();
const PrivyBridge = lazy(() => import('./privyBridge'));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const [privy, setPrivy] = useState<PrivyState | null>(null);

  // The backx session (HttpOnly cookie) is checked here, independent of Privy:
  // a returning user is recognised even if Privy is slow or down.
  useEffect(() => {
    if (!APP_ID) return;
    api<Me>('/api/auth/me').then(setMe).catch(() => setMe(null)).finally(() => setChecked(true));
  }, []);

  const signOut = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* server clears it when reachable */ }
    setMe(null);
    await privy?.logout();
  }, [privy]);

  const signOutEverywhere = useCallback(async () => {
    try { await api('/api/auth/logout-all', { method: 'POST' }); } catch { /* ignore */ }
    setMe(null);
    await privy?.logout();
  }, [privy]);

  const status: AuthStatus = !APP_ID ? 'unavailable'
    : me ? 'signedIn'
    : !checked ? 'checking'
    : privy?.connecting ? 'connecting'
    : privy?.error ? 'error'
    : 'signedOut';

  const value: AuthState = {
    status, me,
    // Not gated on the session check: the token exchange itself waits for it.
    canSignIn: !!privy?.ready && !me,
    signIn: privy?.login ?? noop,
    signOut,
    signOutEverywhere,
    actions: me ? privy?.actions ?? null : null,
    updateMe: setMe,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {APP_ID && (
        <Suspense fallback={null}>
          <PrivyBridge appId={APP_ID} checked={checked} me={me} onSession={setMe} onState={setPrivy} />
        </Suspense>
      )}
    </Ctx.Provider>
  );
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
