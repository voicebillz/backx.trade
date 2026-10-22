import { lazy, Suspense } from 'react';
import { useAuth } from './lib/auth';
import { IS_APP } from './lib/host';
import { HomePage } from './pages/HomePage';
import { AppGate } from './components/AppGate';

// backx.trade: public front page (+ /whitepaper). app.backx.trade: the app, admins only for now (owner 2026-10-22).
// The terminal is its own chunk, fetched only once /api/auth/me says admin; the server guards every /api call anyway.
const Terminal = lazy(() => import('./Terminal'));
const Whitepaper = lazy(() => import('./pages/WhitepaperSite'));

export function App() {
  const { me, status } = useAuth();
  if (!IS_APP) {
    return location.pathname.replace(/\/+$/, '') === '/whitepaper'
      ? <Suspense fallback={<div className="app-loading" aria-busy="true" />}><Whitepaper /></Suspense>
      : <HomePage />;
  }
  if (status === 'checking') return <div className="app-loading" aria-busy="true" />;
  if (!me?.isAdmin) return <AppGate />;
  return (
    <Suspense fallback={<div className="app-loading" aria-busy="true" />}>
      <Terminal />
    </Suspense>
  );
}
