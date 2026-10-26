import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { SCOPE_TEXT } from '../lib/mcpGuide';
import { SITE_URL } from '../lib/host';
import { ConnectMcp } from '../components/ConnectMcp';

// Profile → AI agents (owner 2026-10-26): the assistants this account connected over MCP, how to add one, and
// "Disconnect all". A new connection always starts in the assistant itself and is approved on /connect.

interface Conn { client: string; scopes: string[]; created_at: string; active: boolean }
interface McpMe { eligible: boolean; reason: string | null; disconnectedAt: string | null; connections: Conn[] }

const day = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function AgentsTab() {
  const [d, setD] = useState<McpMe | null>(null);
  const [err, setErr] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const load = () => api<McpMe>('/api/mcp/me').then(setD).catch(() => setErr(true));
  useEffect(() => { load(); }, []);

  const disconnect = async () => {
    setBusy(true);
    try { await api('/api/mcp/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); await load(); } catch { setErr(true); }
    setBusy(false); setConfirm(false);
  };

  if (err) return <section className="card"><p className="warn" role="alert">Could not load your AI agents. Try again.</p></section>;
  if (!d) return <section className="card"><div className="skel" style={{ height: 140 }} aria-busy="true" /></section>;
  const active = d.connections.filter((c) => c.active);

  return (
    <>
      <section className="card">
        <div className="row-between">
          <h2>AI agents</h2>
          <span className={active.length ? 'ok' : 'muted'}>{active.length ? `${active.length} connected` : 'None connected'}</span>
        </div>
        {!d.eligible ? (
          <p className="warn">Your account logs in with its own wallet, so it cannot connect an assistant over MCP. Let your agent use <a href={`${SITE_URL}/skill.md`}>backx.trade/skill.md</a> with that wallet instead.</p>
        ) : active.length ? (
          <ul className="agent-list">
            {active.map((c, i) => (
              <li key={i}>
                <span className="agent-name">{c.client || 'Assistant'}</span>
                <span className="agent-scopes">{c.scopes.map((s) => <span key={s} className="chip">{SCOPE_TEXT[s] ?? s}</span>)}</span>
                <span className="muted num">{day(c.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          null
        )}
        {active.length > 0 && (
          <div className="row-between agent-off">
            <span />
            {confirm
              ? <span className="agent-confirm"><button className="btn btn-sm" onClick={() => setConfirm(false)} disabled={busy}>Cancel</button><button className="btn btn-danger btn-sm" onClick={disconnect} disabled={busy} aria-busy={busy}>Disconnect all</button></span>
              : <button className="btn btn-sm" onClick={() => setConfirm(true)}>Disconnect all</button>}
          </div>
        )}
      </section>

      {d.eligible && (
        <section className="card">
          <div className="row-between">
            <h2>Add an assistant</h2>
            <button className="btn btn-primary" onClick={() => setOpen(true)}>Connect with MCP</button>
          </div>
        </section>
      )}
      {open && <ConnectMcp onClose={() => setOpen(false)} />}
    </>
  );
}
