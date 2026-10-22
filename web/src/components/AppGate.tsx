import { Mark } from './Logo';
import { useAuth } from '../lib/auth';
import { SITE_URL } from '../lib/host';

/** app.backx.trade for everyone but ADMIN_WALLETS (owner 2026-10-22): the app is not open yet. */
export function AppGate() {
  const { me, status, canSignIn, signIn, signOut } = useAuth();
  const connecting = status === 'connecting';
  return (
    <main id="main" className="gate">
      <div className="gate-card">
        <Mark size={48} />
        <h1>The BackX app is not open yet</h1>
        <p>Participate on the front page to be first in line when it opens.</p>
        <a className="h-btn h-btn-gold big" href={SITE_URL}>Go to backx.trade</a>
        {me ? (
          <p className="gate-small">Signed in without app access. <button className="h-signout" onClick={signOut}>Sign out</button></p>
        ) : (
          <button className="h-signout" onClick={signIn} disabled={connecting || !canSignIn}>{connecting ? 'Signing in…' : 'Team login'}</button>
        )}
      </div>
    </main>
  );
}
