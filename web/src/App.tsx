import { lazy, Suspense } from 'react';
import { ComingSoon } from './components/ComingSoon';
import { Venture } from './components/Venture';
import { useAuth } from './lib/auth';

const COMING_SOON = import.meta.env.VITE_COMING_SOON !== 'false';
// Separate chunk: while the overlay is up the terminal is never downloaded or
// rendered, so removing the overlay in devtools reveals only a static backdrop.
const Terminal = lazy(() => import('./Terminal'));

export function App() {
  const { me } = useAuth();
  // Admin wallets (ADMIN_WALLETS on the server, checked server-side via the session cookie).
  if (COMING_SOON && !me?.isAdmin) {
    return (
      <>
        <div className="soon-backdrop" aria-hidden="true" />
        {/* Signed in: the coming-soon overlay closes and "Join the venture!" takes its place (no way past it yet). */}
        {me ? <Venture /> : <ComingSoon />}
      </>
    );
  }
  return (
    <Suspense fallback={<div className="app-loading" aria-busy="true" />}>
      <Terminal />
    </Suspense>
  );
}
