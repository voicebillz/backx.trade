import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface Me { address: string; isAdmin: boolean }
export type AuthStatus = 'checking' | 'signedOut' | 'connecting' | 'signedIn' | 'error' | 'unavailable';

export interface AuthState {
  status: AuthStatus;
  me: Me | null;
  /** Privy has loaded and the login modal can open. */
  canSignIn: boolean;
  signIn: () => void;
  signOut: () => Promise<void>;
}

/** What the lazily loaded Privy bridge reports back. */
export interface PrivyState {
  ready: boolean;
  connecting: boolean;
  error: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const noop = () => {};
const Ctx = createContext<AuthState>({ status: 'unavailable', me: null, canSignIn: false, signIn: noop, signOut: async () => {} });
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
