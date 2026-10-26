import { lazy, Suspense } from 'react';
import { useAuth } from './lib/auth';
import { IS_APP } from './lib/host';
import { HomePage } from './pages/HomePage';
import { AppGate } from './components/AppGate';

// backx.trade: public front page (+ /whitepaper). app.backx.trade: the app, admins only for now (owner 2026-10-22).
// The terminal is its own chunk, fetched only once /api/auth/me says admin; the server guards every /api call anyway.
const Terminal = lazy(() => import('./Terminal'));
const Whitepaper = lazy(() => import('./pages/WhitepaperSite'));
const McpSite = lazy(() => import('./pages/McpSite'));
// MCP consent and signing (docs/backx/MCP-PLAN.md): any signed-in account, not only admins; the API decides who may connect.
const McpConnect = lazy(() => import('./pages/McpPages').then((m) => ({ default: m.ConnectPage })));
const McpSign = lazy(() => import('./pages/McpPages').then((m) => ({ default: m.SignPage })));

export function App() {
  const { me, status } = useAuth();
  if (!IS_APP) {
    const p = location.pathname.replace(/\/+$/, '');
    if (p === '/whitepaper' || p === '/mcp') return <Suspense fallback={<div className="app-loading" aria-busy="true" />}>{p === '/mcp' ? <McpSite /> : <Whitepaper />}</Suspense>;
    return <HomePage />;
  }
  if (status === 'checking') return <div className="app-loading" aria-busy="true" />;
  const path = location.pathname.replace(/\/+$/, '');
  if (me && (path === '/connect' || path === '/sign')) {
    return <Suspense fallback={<div className="app-loading" aria-busy="true" />}>{path === '/connect' ? <McpConnect /> : <McpSign />}</Suspense>;
  }
  if (!me?.isAdmin) return <AppGate />;
  return (
    <Suspense fallback={<div className="app-loading" aria-busy="true" />}>
      <Terminal />
    </Suspense>
  );
}
