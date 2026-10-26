import { useEffect, useState } from 'react';
import { Mark } from '../components/Logo';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { SITE_URL } from '../lib/host';

// MCP pages on app.backx.trade (owner 2026-10-26, docs/backx/MCP-PLAN.md). /connect: approve an AI assistant for
// your own account (social-login accounts only). /sign: sign transactions an assistant prepared, after this app's
// own API has checked every step only touches BackX contracts and pays back to your own wallet.

const MCP = (import.meta.env.VITE_MCP_URL as string | undefined) || 'https://mcp.backx.trade';

const SCOPE_TEXT: Record<string, string> = {
  'account:read': 'See your balances, positions, rewards and staking',
  'trade:prepare': 'Prepare trades for you to sign',
  'issue:prepare': 'Prepare issuing and reserve withdrawals for you to sign',
  'stake:prepare': 'Prepare staking and unstaking for you to sign',
  'claim:prepare': 'Prepare "Claim all" for you to sign',
};
const REASON: Record<string, string> = {
  external_wallet_login: 'AI assistants can only be connected to accounts that log in with email, phone, Google, X, Discord, Twitch, Telegram, Farcaster or a passkey. Your account logs in with its own wallet: let your agent use backx.trade/skill.md with that wallet instead.',
  no_embedded_wallet: 'Your BackX wallet is not ready yet. Log out and in again, then retry.',
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main id="main" className="gate">
      <div className="gate-card mcp-card">
        <Mark size={40} />
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function ConnectPage() {
  const request = new URLSearchParams(location.search).get('request') ?? '';
  const [info, setInfo] = useState<{ client: string; redirectHost: string; scopes: string[] } | null>(null);
  const [eligible, setEligible] = useState<{ eligible: boolean; reason: string | null } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{32}$/.test(request)) { setErr('This link is not valid. Start the connection again from your assistant.'); return; }
    fetch(`${MCP}/oauth/request/${request}`, { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('expired'))))
      .then((j) => { setInfo(j); setPicked(j.scopes); })
      .catch(() => setErr('This link has expired. Start the connection again from your assistant.'));
    api<{ eligible: boolean; reason: string | null }>('/api/mcp/me').then(setEligible).catch(() => setErr('Could not check your account. Try again.'));
  }, [request]);

  const approve = async () => {
    setBusy(true);
    try {
      const r = await api<{ redirect: string }>('/api/mcp/consent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request, scopes: picked, client: info?.client }),
      });
      location.assign(r.redirect);
    } catch (e) {
      setErr(e instanceof ApiError && REASON[e.code] ? REASON[e.code] : 'Could not connect. Try again.');
      setBusy(false);
    }
  };
  const deny = () => location.assign(`${MCP}/oauth/callback?request=${encodeURIComponent(request)}&denied=1`);

  if (err) return <Card title="Connect an assistant"><p role="alert">{err}</p><a className="h-signout" href={SITE_URL}>← backx.trade</a></Card>;
  if (!info || !eligible) return <Card title="Connect an assistant"><div className="skel" style={{ width: '100%', height: 160 }} aria-busy="true" /></Card>;
  if (!eligible.eligible) return <Card title="Not available for this account"><p>{REASON[eligible.reason ?? ''] ?? 'This account cannot connect an assistant.'}</p><button className="h-btn big" onClick={deny}>Back to the assistant</button></Card>;

  return (
    <Card title={`Connect ${info.client}?`}>
      <p>It will work on <b>your own BackX account</b> only, and sends you back to <b className="num">{info.redirectHost}</b>. It can never move money by itself: you sign every transaction.</p>
      <ul className="mcp-scopes">
        {info.scopes.map((s) => {
          const fixed = s === 'account:read';
          const on = picked.includes(s);
          return (
            <li key={s}>
              <label>
                <input type="checkbox" checked={on} disabled={fixed} onChange={() => setPicked(on ? picked.filter((x) => x !== s) : [...picked, s])} />
                <span>{SCOPE_TEXT[s] ?? s}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mcp-actions">
        <button className="h-btn big" onClick={deny} disabled={busy}>Cancel</button>
        <button className="h-btn h-btn-gold big" onClick={approve} disabled={busy || !picked.length} aria-busy={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
      </div>
      <p className="mcp-fine">Disconnect any time under Profile. Only connect assistants you trust.</p>
    </Card>
  );
}

interface Step { label: string; to: `0x${string}`; data: `0x${string}`; simulation: string }
interface Bundle { wallet: string; chainId: number; chain: string; label: string; steps: Step[] }

export function SignPage() {
  const { me, actions } = useAuth();
  const id = new URLSearchParams(location.search).get('b') ?? '';
  const [b, setB] = useState<Bundle | null>(null);
  const [problems, setProblems] = useState<{ step: number; why: string }[] | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{24}$/.test(id)) { setErr('This link is not valid.'); return; }
    fetch(`${MCP}/bundle/${id}`, { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('expired'))))
      .then(async (j: Bundle) => {
        setB(j);
        // Independent check by api.backx.trade: only BackX contracts, allowed functions, money back to this wallet.
        const v = await api<{ ok: boolean; problems: { step: number; why: string }[] }>('/api/mcp/verify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chainId: j.chainId, steps: j.steps.map(({ to, data }) => ({ to, data })) }),
        });
        setProblems(v.problems);
      })
      .catch(() => setErr('This link has expired (15 minutes). Ask your assistant to prepare it again.'));
  }, [id]);

  if (err) return <Card title="Sign"><p role="alert">{err}</p></Card>;
  if (!b || !problems || !me) return <Card title="Sign"><div className="skel" style={{ width: '100%', height: 160 }} aria-busy="true" /></Card>;
  if (b.wallet !== me.address.toLowerCase()) return <Card title="Wrong account"><p role="alert">This was prepared for another BackX account. Log in with the account you connected to your assistant.</p></Card>;
  if (problems.length) {
    return (
      <Card title="Blocked">
        <p role="alert">BackX refused to sign this because it is not a normal BackX action. Do not sign it anywhere else.</p>
        <ul className="mcp-scopes">{problems.map((p) => <li key={p.step}>Step {p.step + 1}: {p.why}</li>)}</ul>
      </Card>
    );
  }

  const next = done.length;
  const sign = async () => {
    if (!actions) return;
    setBusy(true);
    try {
      const s = b.steps[next];
      const hash = await actions.sendEvm({ chainId: b.chainId, to: s.to, data: s.data, description: s.label });
      setDone([...done, hash]);
    } catch { setErr('The transaction was not sent.'); }
    setBusy(false);
  };

  return (
    <Card title={b.label}>
      <p>{b.chain} · checked by BackX: only BackX contracts, money back to your own wallet.</p>
      <ol className="mcp-steps">
        {b.steps.map((s, i) => (
          <li key={i} className={i < next ? 'done' : i === next ? 'now' : ''}>
            <span>{s.label}</span>
            {i < next && <small className="num">sent {done[i].slice(0, 10)}…</small>}
          </li>
        ))}
      </ol>
      {next < b.steps.length
        ? <button className="h-btn h-btn-gold big" onClick={sign} disabled={busy || !actions} aria-busy={busy}>{busy ? 'Waiting for your wallet…' : `Sign step ${next + 1} of ${b.steps.length}`}</button>
        : <p className="ok-text">All done. You can go back to your assistant.</p>}
      <p className="mcp-fine">Each step opens your wallet's confirm screen. Wait for one step to finish before the next.</p>
    </Card>
  );
}
