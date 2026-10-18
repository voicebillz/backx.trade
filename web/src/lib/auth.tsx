import { createContext, lazy, Suspense, useContext, useState, type ReactNode } from 'react';

export interface Me { address: string; isAdmin: boolean }
export type AuthStatus = 'checking' | 'signedOut' | 'connecting' | 'signedIn' | 'error' | 'unavailable';

export interface AuthState {
  status: AuthStatus;
  me: Me | null;
  signIn: () => void;
  signOut: () => Promise<void>;
}

const noop = () => {};
const Ctx = createContext<AuthState>({ status: 'unavailable', me: null, signIn: noop, signOut: async () => {} });
export const useAuth = () => useContext(Ctx);

const APP_ID = import.meta.env.VITE_PRIVY_APP_ID?.trim();
const PrivyBridge = lazy(() => import('./privyBridge'));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: APP_ID ? 'checking' : 'unavailable', me: null, signIn: noop, signOut: async () => {},
  });
  return (
    <Ctx.Provider value={state}>
      {children}
      {APP_ID && <Suspense fallback={null}><PrivyBridge appId={APP_ID} onChange={setState} /></Suspense>}
    </Ctx.Provider>
  );
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
