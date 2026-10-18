import { useState } from 'react';
import { short, useAuth } from '../lib/auth';

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="addr"
      onClick={() => navigator.clipboard?.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      title={address}
      aria-label={`Copy wallet address ${address}`}
    >
      <span className="num">{short(address)}</span>
      <span className="addr-copy">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

/** Sign-in block inside the coming-soon overlay. */
export function OverlayAccount() {
  const { status, me, canSignIn, signIn, signOut } = useAuth();

  if (status === 'unavailable') return null;
  if (status === 'signedIn' && me) {
    return (
      <div className="soon-account" aria-live="polite">
        <div className="soon-account-row"><span>Signed in</span><CopyAddress address={me.address} /></div>
        <p className="soon-account-note">You are on the list. Full access opens at launch.</p>
        <button className="soon-link" onClick={signOut}>Sign out</button>
      </div>
    );
  }
  const connecting = status === 'connecting';
  return (
    <div className="soon-account" aria-live="polite">
      <button className="soon-signin" onClick={signIn} disabled={connecting || !canSignIn} aria-busy={connecting}>
        {connecting ? 'Setting up your wallet…' : 'Sign in'}
      </button>
      {status === 'error' && <p className="soon-account-note err">Sign-in did not complete. Try again.</p>}
      {status === 'signedOut' && <p className="soon-account-note">Email, Google or X. Your own wallet is created for you.</p>}
    </div>
  );
}

/** Topbar account (visible to admins before launch, everyone after). */
export function TopbarAccount() {
  const { status, me, canSignIn, signIn, signOut } = useAuth();
  if (status === 'signedIn' && me) {
    return (
      <div className="top-account">
        {me.isAdmin && <span className="chip chip-admin">Admin</span>}
        <CopyAddress address={me.address} />
        <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
      </div>
    );
  }
  return (
    <button className="btn btn-primary" onClick={signIn} disabled={!canSignIn || status === 'connecting'}>
      Sign in
    </button>
  );
}
