import { Mark } from './Logo';
import { useAuth } from '../lib/auth';
import { SITE_URL } from '../lib/host';

/**
 * app.backx.trade before the app opens to everyone (owner 2026-10-22). "Launch App" on the front page lands here:
 * signed out → log in (Privy); signed in as ADMIN_WALLETS → App.tsx shows the terminal; anyone else → not open yet.
 * The backx session cookie belongs to api.backx.trade, so a login on backx.trade carries over.
 */
export function AppGate() {
  const { me, status, canSignIn, signIn, signOut } = useAuth();
  const connecting = status === 'connecting';
  if (!me) {
    return (
      <main id="main" className="gate">
        <div className="gate-card">
          <Mark size={48} />
          <h1>Log in to BackX</h1>
          <p>Email, Google, X, passkey and more. No wallet to connect.</p>
          <button className="h-btn h-btn-gold big" onClick={signIn} disabled={connecting || !canSignIn} aria-busy={connecting}>
            {connecting ? 'Setting up your wallet…' : 'Log in'}
          </button>
          {status === 'error' && <p className="gate-err" role="alert">Login did not complete. Try again.</p>}
          <a className="h-signout" href={SITE_URL}>← Back to backx.trade</a>
        </div>
      </main>
    );
  }
  return (
    <main id="main" className="gate">
      <div className="gate-card">
        <Mark size={48} />
        <h1>The BackX app is not open yet</h1>
        <p>You are logged in. Participate on the front page to be first in line when it opens.</p>
        <a className="h-btn h-btn-gold big" href={SITE_URL}>Participate on backx.trade</a>
        <button className="h-signout" onClick={signOut}>Sign out</button>
      </div>
    </main>
  );
}
