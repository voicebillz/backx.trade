import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';

interface VentureMe { joined: boolean; joinedAt: string | null }

/**
 * "Participate" on the front page: one participation per account, stored by the server (session required).
 * Signed out: opens login and remembers the intent, then participates once the session exists.
 */
export function useParticipate() {
  const { me, status, signIn, canSignIn } = useAuth();
  const [state, setState] = useState<VentureMe | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const intent = useRef(false);

  useEffect(() => {
    if (!me) { setState(null); return; }
    api<VentureMe>('/api/venture/me').then(setState).catch(() => setState({ joined: false, joinedAt: null }));
  }, [me]);

  const join = useCallback(async () => {
    setBusy(true); setErr(false);
    try { setState(await api<VentureMe>('/api/venture/participate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })); }
    catch { setErr(true); }
    finally { setBusy(false); intent.current = false; }
  }, []);

  // Came back from the login modal with the intent to participate.
  useEffect(() => { if (me && intent.current && state && !state.joined) void join(); }, [me, state, join]);

  const participate = () => {
    if (me) { void join(); return; }
    intent.current = true;
    signIn();
  };
  return { me, joined: !!state?.joined, joinedAt: state?.joinedAt ?? null, busy: busy || status === 'connecting', err, canSignIn, participate };
}
