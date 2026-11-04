import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';

// BackX Proposals (owner 2026-11-04, server/src/proposals.js): a Yes/No question the community signals on.
// The public read returns only percentages, never how many signalled.

export type Choice = 'yes' | 'no';
export interface Proposal {
  id: number; code: string; title: string; question: string; body: string; banner: string;
  status: 'open' | 'closed'; openedAt: string | null; closedAt: string | null;
  yesPct: number | null; noPct: number | null; mine: Choice | null;
}

export const PROPOSAL_PATH = '/proposal';

/** The latest proposal (or ?bxp=<id>), plus signal(), which opens login first when signed out. */
export function useProposal(id?: number | null) {
  const { me, signIn, canSignIn, status } = useAuth();
  const [p, setP] = useState<Proposal | null | undefined>(undefined); // undefined = loading, null = none
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const intent = useRef<Choice | null>(null);

  useEffect(() => {
    let live = true;
    api<{ proposal: Proposal | null }>(id ? `/api/proposals/${id}` : '/api/proposals/latest')
      .then((r) => live && setP(r.proposal))
      .catch(() => live && setP(null));
    return () => { live = false; };
  }, [id, me]);

  const send = useCallback(async (choice: Choice, target: Proposal) => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ proposal: Proposal }>(`/api/proposals/${target.id}/signal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice }),
      });
      setP(r.proposal);
    } catch { setErr('That did not go through. Try again.'); }
    finally { setBusy(false); intent.current = null; }
  }, []);

  // Back from the login modal with a pending choice.
  useEffect(() => { if (me && p && intent.current) void send(intent.current, p); }, [me, p, send]);

  const signal = (choice: Choice) => {
    if (!p || p.status !== 'open') return;
    if (me) { void send(choice, p); return; }
    intent.current = choice;
    signIn();
  };
  return { proposal: p, signal, busy: busy || status === 'connecting', err, canSignal: !!me || canSignIn };
}
