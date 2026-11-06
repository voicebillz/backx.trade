import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { CONTACT, INVESTORS, type Investor } from '../lib/investors';
import { savedSignature, signatureHtml } from '../components/EmailSignature';
import { email } from './AdminInvestors';

// Admin → Outreach (owner 2026-11-05, docs/backx/OUTREACH-AGENT-PLAN.md). Controls the backx-outreach worker:
// settings and daily maximum, the company profile and deck for forms, the queue (approve / cancel), the owner's own
// queue for what the agent could not do, and the full history with screenshots. The agent only sends first outreach
// emails and fills pitch / apply forms; it never answers email.

type Status = 'queued' | 'approved' | 'sending' | 'review' | 'submit' | 'sent' | 'submitted' | 'replied' | 'bounced' | 'manual' | 'failed' | 'skipped' | 'cancelled' | 'done';
interface Job {
  id: number; firm: string; channel: 'email' | 'form' | 'manual'; target: string; subject: string | null; text: string | null;
  status: Status; note: string | null; lastError: string | null; attempts: number; createdAt: string; approvedAt: string | null;
  sentAt: string | null; repliedAt: string | null; shots: number; tokens: number;
}
interface Settings { dailyMax: number; mode: 'approve' | 'auto'; formsReview: boolean; paused: boolean; ignoreWindow: boolean; hardMax: number }
interface Data {
  settings: Settings; today: { emails: number; forms: number; tokens: number }; heartbeat: string | null; jobs: Job[];
  profile: Record<string, string>; deck: { filename: string; size: number; at: string } | null;
}
interface Ev { at: string; kind: string; detail: string | null; image: string | null }

const LABEL: Record<Status, string> = {
  queued: 'Waiting for you', approved: 'Approved', sending: 'Working', review: 'Check before submit', submit: 'Submitting',
  sent: 'Sent', submitted: 'Submitted', replied: 'Replied', bounced: 'Bounced', manual: 'For you', failed: 'Failed',
  skipped: 'Skipped', cancelled: 'Cancelled', done: 'Done by you',
};
const TONE: Partial<Record<Status, string>> = { sent: 'ok', submitted: 'ok', replied: 'ok', done: 'ok', review: 'warn', queued: 'warn', manual: 'warn', bounced: 'bad', failed: 'bad' };

// Facts forms may use. The agent never invents anything outside these.
const PROFILE_KEYS: [string, string, number?][] = [
  ['company', 'Company name'], ['website', 'Website'], ['one_liner', 'One-line pitch (≤ 140 chars)'],
  ['pitch_short', 'Short pitch (2–3 sentences)', 4], ['pitch_long', 'Longer description (one paragraph)', 6],
  ['founder_name', 'Founder name'], ['founder_title', 'Founder title'], ['founder_email', 'Contact email'],
  ['founder_x', 'X / Twitter'], ['founder_linkedin', 'LinkedIn'], ['telegram', 'Telegram'], ['location', 'Location / country'], ['address', 'Postal address (type it here; never in code)'],
  ['founded', 'Founded (year)'], ['team', 'Team (size, roles)', 3], ['stage', 'Stage (e.g. pre-seed)'],
  ['raising', 'Raising (amount, round)'], ['use_of_funds', 'Use of funds', 3], ['traction', 'Traction / status (only true facts)', 4],
  ['chains', 'Chains'], ['product_links', 'Links: app, pitch deck, whitepaper', 3], ['category', 'Category (e.g. DeFi, derivatives, AI agents)'],
  ['other', 'Anything else forms often ask', 4],
];

// Starting values for the profile (owner 2026-11-05): facts from the pitch whitepaper and the founder. They only
// fill empty fields and are saved when you press Save profile. Keep them true: forms quote them word for word.
const DEFAULTS: Record<string, string> = {
  company: 'BackX Trade (company not registered yet)',
  website: 'https://www.backx.trade',
  one_liner: 'Open onchain leverage for every listed coin, backed by issuers and built for AI agents.',
  pitch_short: 'BackX is an onchain leverage protocol: traders go Long or Short with up to 20x leverage, and issuers lend the capital (USDC for Longs, the coin itself for Shorts) and earn from every position. Issuers are lenders who are repaid first, not AMM liquidity providers who lose to arbitrage, and any AI assistant can trade through our MCP server while the user signs.',
  pitch_long: 'BackX is a leverage market for every listed coin. Traders go Long or Short with up to 20x leverage; issuers supply the capital (USDC for Longs, the coin itself for Shorts) and earn from every position; validators settle positions and are paid from each position\'s own escrow, so execution is open to anyone. Issuers are lenders with a protected principal, not AMM liquidity providers who bleed to arbitrage, which makes the model stronger as bots and AI agents take over trading. BackX launches on Robinhood Chain, BNB Chain, Base and Arbitrum with identical contract addresses on every chain, and any AI assistant can trade, issue and claim through our MCP server or plain contract calls while the user always signs.',
  founder_name: 'Roem Malik',
  founder_title: 'Founder',
  founder_email: 'partner@backx.trade',
  founder_x: '@cryptopodaz (company: @BACKXTRADE)',
  founder_linkedin: 'https://www.linkedin.com/in/roem-malik-55399719b/',
  telegram: '@cryptopodaz',
  location: 'Norway',
  founded: '2026',
  stage: 'Pre-seed, pre-launch',
  raising: 'Seed round with one lead investor, who is invited to lead or anchor the Series A. Amount and terms are shared directly.',
  use_of_funds: 'Proposed: engineering 35 %, audit and security 25 %, issuer liquidity at launch 15 %, validators and infrastructure 10 %, legal and company 10 %, go to market 5 %.',
  traction: 'Smart contracts written and tested (96 tests passing), not yet audited or deployed. Trading app with a demo mode and an MCP server for AI agents are live. Pre-revenue; launch follows a fast oracle integration and an external audit.',
  chains: 'Robinhood Chain, BNB Chain, Base, Arbitrum (same contract addresses on every chain)',
  product_links: 'Website: https://www.backx.trade\nPitch deck: https://www.backx.trade/pitch\nPitch whitepaper: https://www.backx.trade/pitch?view=whitepaper\nAI agents (MCP): https://www.backx.trade/mcp',
  category: 'DeFi, onchain derivatives / leverage, AI agents',
  other: 'The company is not registered yet; a new company will operate BackX. Contracts are not audited yet. Company X: @BACKXTRADE.',
};

const when = (d: string | null) => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** What the agent would do for one firm: email if a published address exists, else its form, else your queue. */
function planFor(i: Investor, sig: string | null) {
  const c = CONTACT[i.name];
  if (!c || i.tier === 'dropped') return null;
  const mail = email(i);
  if (c.email && mail) return sig ? { firm: i.name, channel: 'email' as const, target: c.email, subject: mail.subject, text: mail.body, signatureHtml: sig } : null;
  const formUrl = c.apply && !/^https:\/\/(t\.me|x\.com|twitter\.com)\//.test(c.apply) ? c.apply : null;
  if (formUrl) return { firm: i.name, channel: 'form' as const, target: formUrl, note: c.how ?? '' };
  const x = c.x ? `https://x.com/${c.x.replace(/^@/, '')}` : c.apply ?? '';
  return { firm: i.name, channel: 'manual' as const, target: x, note: c.x ? 'DM on X (the agent never sends DMs)' : c.how ?? 'Contact by hand' };
}

function Events({ id }: { id: number }) {
  const [items, setItems] = useState<Ev[] | null>(null);
  useEffect(() => { api<{ items: Ev[] }>(`/api/admin/outreach/jobs/${id}/events`).then((r) => setItems(r.items)).catch(() => setItems([])); }, [id]);
  if (!items) return <span className="sk sk-w60" />;
  return (
    <ol className="or-events">
      {items.map((e, k) => (
        <li key={k}>
          <span className="num muted">{when(e.at)}</span> <b>{e.kind}</b>{e.detail ? ` · ${e.detail}` : ''}
          {e.image && <a href={`data:image/jpeg;base64,${e.image}`} target="_blank" rel="noreferrer"><img className="or-shot" src={`data:image/jpeg;base64,${e.image}`} alt={`Screenshot: ${e.kind}`} /></a>}
        </li>
      ))}
      {!items.length && <li className="muted">No events yet.</li>}
    </ol>
  );
}

function Row({ j, act }: { j: Job; act: (id: number, action: string) => void }) {
  const [open, setOpen] = useState(false);
  const can = {
    approve: j.status === 'queued' || j.status === 'review',
    cancel: ['queued', 'approved', 'review', 'manual', 'failed'].includes(j.status),
    retry: ['failed', 'manual', 'cancelled'].includes(j.status) && j.channel !== 'manual',
    done: ['manual', 'failed', 'review', 'queued'].includes(j.status),
  };
  return (
    <li className={'inv-row' + (open ? ' open' : '')}>
      <button className="inv-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="inv-name"><b>{j.firm}</b><small>{j.channel === 'email' ? `Email · ${j.target}` : j.channel === 'form' ? `Form · ${new URL(j.target).host}` : 'By hand'}{j.note ? ` · ${j.note}` : ''}</small></span>
        <span className="inv-stage"><b className={'or-pill ' + (TONE[j.status] ?? '')}>{LABEL[j.status]}</b> <span className="num muted small">{when(j.sentAt ?? j.approvedAt ?? j.createdAt)}</span></span>
        <span className="inv-chev" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="inv-body">
          <div className="link-buttons or-actions">
            {can.approve && <button className="btn btn-sm btn-primary" onClick={() => act(j.id, 'approve')}>{j.status === 'review' ? 'Approve and submit' : 'Approve'}</button>}
            {can.retry && <button className="btn btn-sm" onClick={() => act(j.id, 'retry')}>Retry</button>}
            {can.done && <button className="btn btn-sm" onClick={() => act(j.id, 'done')}>I did it myself</button>}
            {can.cancel && <button className="btn btn-sm btn-ghost" onClick={() => act(j.id, 'cancel')}>Cancel</button>}
            {j.target.startsWith('https://') && <a className="btn btn-sm btn-ghost" href={j.target} target="_blank" rel="noopener noreferrer">Open {j.channel === 'form' ? 'form' : 'link'}</a>}
          </div>
          {j.lastError && <p className="field-err">{j.lastError}</p>}
          {j.channel === 'email' && <><p className="inv-subject"><span className="muted">Subject</span> {j.subject}</p><pre className="inv-letter">{j.text}</pre></>}
          {j.tokens > 0 && <p className="muted small num">Model tokens: {j.tokens.toLocaleString('en-US')}</p>}
          <Events id={j.id} />
        </div>
      )}
    </li>
  );
}

export function AdminOutreach() {
  const [d, setD] = useState<Data | null>(null);
  const [inv, setInv] = useState<Record<string, unknown>>({});
  const [s, setS] = useState<Settings | null>(null);
  const [prof, setProf] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => Promise.all([
    api<Data>('/api/admin/outreach').then((r) => { setD(r); setS(r.settings); setProf((cur) => (Object.keys(cur).length ? cur : Object.keys(r.profile).length ? r.profile : { ...DEFAULTS })); }),
    api<{ items: { firm: string }[] }>('/api/admin/investors/status').then((r) => setInv(Object.fromEntries(r.items.map((x) => [x.firm, x])))),
  ]).catch(() => setErr('Could not load outreach.'));
  useEffect(() => { void load(); const t = setInterval(() => void load(), 30_000); return () => clearInterval(t); }, []);
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2500); };

  const sig = useMemo(() => { const f = savedSignature(); return f ? signatureHtml(f) : null; }, []);
  const active = new Set((d?.jobs ?? []).filter((j) => !['cancelled', 'failed', 'skipped'].includes(j.status)).map((j) => j.firm));
  const candidates = INVESTORS.filter((i) => !inv[i.name] && !active.has(i.name)).map((i) => planFor(i, sig)).filter(Boolean);
  const emailsWithoutSig = !sig && INVESTORS.some((i) => CONTACT[i.name]?.email && email(i));

  const saveSettings = (next: Settings) => api('/api/admin/outreach/settings', json(next)).then(() => { setS(next); flash('Saved'); void load(); }).catch(() => setErr('Could not save settings.'));
  // Small batches: each email job carries its text and signature, and the API takes at most 64 KB per request.
  const queue = async () => {
    if (!candidates.length) return;
    setErr(null);
    let added = 0, skipped = 0;
    const list = candidates.slice(0, 100);
    for (let k = 0; k < list.length; k += 6) {
      try {
        const r = await api<{ added: number; skipped: number }>('/api/admin/outreach/jobs', json({ jobs: list.slice(k, k + 6) }));
        added += r.added; skipped += r.skipped;
      } catch (e) {
        setErr(e instanceof ApiError
          ? e.body.firm ? `Could not queue ${String(e.body.firm)}: check its contact details.` : `Could not queue (${e.status} ${e.code}). ${added} were queued before this.`
          : `Could not queue (no answer from the API). ${added} were queued before this.`);
        break;
      }
    }
    flash(`${added} queued${skipped ? `, ${skipped} skipped` : ''}`);
    void load();
  };
  const act = (id: number, action: string) => api(`/api/admin/outreach/jobs/${id}`, json({ action })).then(() => void load()).catch(() => setErr('That did not work. Reload and try again.'));
  const saveProfile = () => api('/api/admin/outreach/profile', json({ entries: prof })).then(() => flash('Profile saved')).catch(() => setErr('Could not save the profile.'));
  const uploadDeck = async (file: File) => {
    if (file.type !== 'application/pdf' || file.size > 15 * 1024 * 1024) { setErr('The deck must be a PDF under 15 MB.'); return; }
    await api('/api/admin/outreach/deck', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'x-filename': file.name }, body: file, signal: AbortSignal.timeout(60_000) })
      .then(() => { flash('Deck uploaded'); void load(); }).catch(() => setErr('Upload failed.'));
  };

  if (!d || !s) return <section className="card"><span className="sk sk-w60" /></section>;
  const jobs = d.jobs;
  const by = (...st: Status[]) => jobs.filter((j) => st.includes(j.status));
  const online = d.heartbeat && Date.now() - new Date(d.heartbeat).getTime() < 3 * 60_000;
  const approveAll = async (rows: Job[]) => { for (const j of rows) await api(`/api/admin/outreach/jobs/${j.id}`, json({ action: 'approve' })).catch(() => {}); void load(); };
  const list = (title: string, rows: Job[], empty?: string, all?: boolean) => (
    <section className="card">
      <div className="row-between">
        <h2>{title} <span className="muted num">{rows.length}</span></h2>
        {all && rows.some((j) => j.status === 'queued') && <button className="btn btn-sm btn-primary" onClick={() => void approveAll(rows.filter((j) => j.status === 'queued'))}>Approve all {rows.filter((j) => j.status === 'queued').length}</button>}
      </div>
      {rows.length ? <ul className="inv-list">{rows.map((j) => <Row key={j.id} j={j} act={act} />)}</ul> : <p className="muted">{empty ?? 'Nothing here.'}</p>}
    </section>
  );

  return (
    <>
      <section className="card">
        <div className="row-between">
          <h2>Outreach agent</h2>
          <span className={'or-pill ' + (online ? 'ok' : 'bad')}>{online ? 'Worker online' : 'Worker offline'}</span>
        </div>
        <p className="num or-today">Today: <b>{d.today.emails + d.today.forms}</b> of <b>{s.dailyMax}</b> sent · {d.today.emails} emails · {d.today.forms} forms · {d.today.tokens.toLocaleString('en-US')} model tokens</p>
        {err && <p className="field-err" role="alert">{err}</p>}
        {msg && <p className="muted small" aria-live="polite">{msg}</p>}
        <div className="or-settings">
          <div className="or-run">
            <span className={'or-pill ' + (s.paused ? 'warn' : 'ok')}>{s.paused ? 'Stopped' : 'Running'}</span>
            <button className={'btn ' + (s.paused ? 'btn-primary' : 'or-stop')} onClick={() => saveSettings({ ...s, paused: !s.paused })}>{s.paused ? 'Start agent' : 'Stop agent'}</button>
          </div>
          <label className="field"><span className="label">Max per day (emails + forms, ≤ {s.hardMax})</span>
            <div className="input-wrap"><input type="number" inputMode="numeric" min={0} max={s.hardMax} value={s.dailyMax}
              onChange={(e) => setS({ ...s, dailyMax: Math.max(0, Math.min(s.hardMax, Math.floor(Number(e.target.value) || 0))) })} onBlur={() => saveSettings(s)} /></div></label>
          <label className="field"><span className="label">Mode</span>
            <select value={s.mode} onChange={(e) => saveSettings({ ...s, mode: e.target.value as Settings['mode'] })}>
              <option value="approve">Approve each one first</option><option value="auto">Send by itself (within the max)</option>
            </select></label>
          <label className="or-check"><input type="checkbox" checked={s.formsReview} onChange={(e) => saveSettings({ ...s, formsReview: e.target.checked })} /> Show me each filled form before it is submitted</label>
          <label className="or-check"><input type="checkbox" checked={s.ignoreWindow} onChange={(e) => saveSettings({ ...s, ignoreWindow: e.target.checked })} /> Send outside weekdays 09–18 New York time</label>
        </div>
      </section>

      <section className="card">
        <div className="row-between">
          <h2>Queue open firms <span className="muted num">{candidates.length}</span></h2>
          <button className="btn btn-primary" disabled={!candidates.length} onClick={() => void queue()}>Queue {candidates.length}</button>
        </div>
        <p className="muted small">Every firm in Investors that is not checked off and has no job yet: email where the firm publishes an address, its form otherwise, and your own queue for X-only firms.</p>
        {emailsWithoutSig && <p className="field-err">Fill in your email signature under Branding first: without it, firms with an email address are not queued.</p>}
      </section>

      {list('Needs your approval', by('queued', 'review'), 'Nothing waiting for you.', true)}
      {list('For you to do', by('manual'), 'Nothing for you right now.')}
      {list('In progress', by('approved', 'submit', 'sending'))}
      {list('History', by('sent', 'submitted', 'replied', 'bounced', 'done', 'skipped', 'cancelled', 'failed'))}

      <section className="card">
        <div className="row-between"><h2>Company profile for forms</h2>
          <span className="link-buttons">
            <button className="btn btn-sm" onClick={() => setProf({ ...DEFAULTS, ...Object.fromEntries(Object.entries(prof).filter(([, v]) => v.trim())) })}>Fill empty with BackX defaults</button>
            <button className="btn btn-sm btn-primary" onClick={saveProfile}>Save profile</button>
          </span></div>
        <p className="muted small">The agent answers forms only from these facts. A required question it cannot answer from here goes to your queue.</p>
        <div className="or-profile">
          {PROFILE_KEYS.map(([k, label, rows]) => (
            <label className="field" key={k}><span className="label">{label}</span>
              {rows ? <textarea rows={rows} maxLength={3000} value={prof[k] ?? ''} onChange={(e) => setProf({ ...prof, [k]: e.target.value })} />
                : <div className="input-wrap"><input maxLength={3000} value={prof[k] ?? ''} onChange={(e) => setProf({ ...prof, [k]: e.target.value })} /></div>}
            </label>
          ))}
        </div>
        <label className="field"><span className="label">Pitch deck PDF for upload fields{d.deck ? ` · now: ${d.deck.filename} (${Math.round(d.deck.size / 1024)} KB)` : ''}</span>
          <input type="file" accept="application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadDeck(f); }} /></label>
      </section>
    </>
  );
}
