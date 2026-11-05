import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { CONTACT, INVESTORS, TIER_TITLE, WHY, type Investor, type Tier } from '../lib/investors';
import { copySignature, savedSignature } from '../components/EmailSignature';

// Admin "Investors" (owner 2026-10-28, list layout 2026-11-02): who to ask for the seed round. One firm leads the
// seed and follows into the Series A; strategic funds and co-investors fill the round; grants pay toward the audit.
// Each firm is one row; tap it to open the details, a ready outreach email for that fund ("Hi <fund> team", no
// sign-off: the signature closes the email) and a button that copies your signature (saved in Admin → Branding).
// Data and sources: lib/investors.ts (checked 2026-10-28, re-verify each row before outreach).

// Outreach status per firm (owner 2026-11-05), stored on the server (Admin only, audited) so it follows you across devices.
type Status = 'emailed' | 'applied' | 'done';
interface StatusRow { status: Status; at: string }
const STATUS_TEXT: Record<Status, string> = { emailed: 'Emailed', applied: 'Applied', done: 'Done' };

const ORDER: Tier[] = ['lead', 'strategic', 'co', 'program', 'dropped'];
const DECK = 'https://www.backx.trade/pitch';
const PAPER = 'https://www.backx.trade/pitch?view=whitepaper';
// Shorter share link without the owner's account id; the file must be shared as "Anyone with the link".
const DRIVE = 'https://docs.google.com/presentation/d/1_5iG-DL-NCCtm77tAoC6OOCDbFWADBUx/edit?usp=sharing';

/** The outreach email for one firm. Ends before the sign-off: the email signature does that. */
export function email(i: Investor): { subject: string; body: string } | null {
  if (i.tier === 'dropped' || i.tier === 'program') return null;
  const team = i.name.split(' / ')[0].replace(/ \(.*\)$/, '');
  const why = WHY[i.name] ?? 'We follow your work in onchain finance and think BackX is a strong fit for your portfolio.';
  const ask = i.tier === 'lead'
    ? 'We are raising our seed round and are looking for one lead investor who will stay with us into the Series A. We would love that to be you.'
    : i.tier === 'strategic'
      ? 'We are raising our seed round and would value you as a strategic investor and partner, alongside our lead.'
      : 'We are raising our seed round and would love to have you in the round alongside our lead.';
  return {
    subject: 'BackX: seed round for open onchain leverage, built for AI agents',
    body: `Hi ${team} team,

${why}

BackX (backx.trade) is an onchain leverage protocol. Traders go Long or Short with up to 20x leverage, issuers lend the capital (USDC for Longs, the coin itself for Shorts) and earn from every position, and anyone can settle positions and get paid for it. Issuers are lenders who are repaid first, not AMM liquidity providers who lose to arbitrage. We launch on Robinhood Chain, BNB Chain, Base and Arbitrum with the same contracts on every chain, and any AI assistant can trade through our MCP server while the user signs.

The contracts are written and tested, the trading app and our MCP server are live, and the next steps are a fast oracle, an external audit and launch.

${ask}

Pitch deck: ${DECK}
Pitch whitepaper: ${PAPER}
Deck on Google Slides: ${DRIVE}

Would you be open to a 30-minute call in the coming weeks?
`,
  };
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}>{done ? 'Copied' : label}</button>;
}

function Firm({ i, st, setStatus }: { i: Investor; st?: StatusRow; setStatus: (firm: string, s: Status | null) => void }) {
  const [open, setOpen] = useState(false);
  const [sigDone, setSigDone] = useState<string | null>(null);
  const c = CONTACT[i.name];
  const mail = email(i);
  const sig = savedSignature();
  const signature = async () => {
    if (!sig) { setSigDone('Fill it in under Branding first'); return; }
    await copySignature(sig);
    setSigDone('Signature copied'); setTimeout(() => setSigDone(null), 1500);
  };
  return (
    <li className={'inv-row' + (open ? ' open' : '')}>
      <button className="inv-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="inv-name"><b>{i.name}</b><small>{i.type}</small></span>
        <span className="inv-stage">{st ? <b className={'inv-status ' + st.status}>✓ {STATUS_TEXT[st.status]}</b> : i.stage}</span>
        <span className="inv-chev" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="inv-body">
          <div className="inv-mark" role="group" aria-label={`Status for ${i.name}`}>
            {(['emailed', 'applied', 'done'] as const).map((k) => (
              <button key={k} className={'btn btn-sm inv-mark-btn' + (st?.status === k ? ' on ' + k : '')} aria-pressed={st?.status === k}
                onClick={() => setStatus(i.name, st?.status === k ? null : k)}>{st?.status === k ? '✓ ' : ''}{STATUS_TEXT[k]}</button>
            ))}
            {st && <span className="muted small">{new Date(st.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
          </div>
          <dl className="inv-facts">
            <div><dt>Leads?</dt><dd>{i.leads}</dd></div>
            <div><dt>Recent</dt><dd>{i.recent}</dd></div>
            <div><dt>Why BackX</dt><dd>{i.fit}</dd></div>
            {i.note && <div><dt>Note</dt><dd className="warn">{i.note}</dd></div>}
            <div><dt>Reach</dt><dd className="inv-reach">
              {c?.apply && <a className="btn btn-sm btn-primary" href={c.apply} target="_blank" rel="noopener noreferrer">Apply</a>}
              {c?.email && <a className="num" href={`mailto:${c.email}`}>{c.email}</a>}
              {c?.x && <a href={`https://x.com/${c.x.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer">@{c.x.replace(/^@/, '')}</a>}
              {i.url && <a href={i.url} target="_blank" rel="noopener noreferrer">Website</a>}
              {c?.how && <span className="muted">{c.how}</span>}
            </dd></div>
          </dl>
          {mail && (
            <div className="inv-mail">
              <div className="row-between">
                <h3>Email</h3>
                <span className="link-buttons">
                  <Copy text={mail.subject} label="Copy subject" />
                  <Copy text={mail.body} label="Copy email" />
                  <button className="btn btn-sm btn-primary" onClick={signature}>{sigDone ?? 'Copy signature'}</button>
                  {c?.email && <a className="btn btn-sm" href={`mailto:${c.email}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`}>Open in mail</a>}
                </span>
              </div>
              <p className="inv-subject"><span className="muted">Subject</span> {mail.subject}</p>
              <pre className="inv-letter">{mail.body}</pre>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function csv(stat: Record<string, StatusRow>) {
  const head = ['Tier', 'Firm', 'Website', 'Apply', 'Email', 'X', 'How', 'Type', 'Stage / check', 'Leads?', 'Recent activity', 'Why BackX', 'Note', 'Contacted', 'Status'];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = INVESTORS.map((i) => [TIER_TITLE[i.tier], i.name, i.url, CONTACT[i.name]?.apply ?? '', CONTACT[i.name]?.email ?? '', CONTACT[i.name]?.x ?? '', CONTACT[i.name]?.how ?? '', i.type, i.stage, i.leads, i.recent, i.fit, i.note ?? '', stat[i.name] ? new Date(stat[i.name].at).toISOString().slice(0, 10) : '', stat[i.name] ? STATUS_TEXT[stat[i.name].status] : ''].map(esc).join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([[head.map(esc).join(','), ...rows].join('\n')], { type: 'text/csv' }));
  a.download = 'backx-investors.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function AdminInvestors() {
  const [stat, setStat] = useState<Record<string, StatusRow>>({});
  const [err, setErr] = useState(false);
  useEffect(() => {
    api<{ items: { firm: string; status: Status; at: string }[] }>('/api/admin/investors/status')
      .then((r) => setStat(Object.fromEntries(r.items.map((x) => [x.firm, { status: x.status, at: x.at }]))))
      .catch(() => setErr(true));
  }, []);
  const setStatus = (firm: string, status: Status | null) => {
    const before = stat;
    setStat((cur) => { const n = { ...cur }; if (status) n[firm] = { status, at: new Date().toISOString() }; else delete n[firm]; return n; });
    api('/api/admin/investors/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firm, status }) })
      .catch(() => { setStat(before); setErr(true); });
  };
  const count = (k: Status) => Object.values(stat).filter((x) => x.status === k).length;
  return (
    <>
      <section className="card">
        <div className="row-between">
          <h2>Seed round: one lead</h2>
          <button className="btn btn-primary" onClick={() => csv(stat)}>Download CSV</button>
        </div>
        <p className="inv-tally num">✓ Emailed {count('emailed')} · Applied {count('applied')} · Done {count('done')}</p>
        {err && <p className="field-err" role="alert">Could not save or load the status. Try again.</p>}
        <ol className="inv-plan">
          <li><b>Lead:</b> Variant, Dragonfly, Haun, Archetype or Lightspeed Faction. One leads the seed and follows into the Series A.</li>
          <li><b>Anchor co-investor:</b> Coinbase Ventures (Base, agents, signal). It rarely leads alone.</li>
          <li><b>Before the meetings:</b> apply to the Arbitrum Security Program for the audit; an audit date answers the first diligence question.</li>
          <li><b>Deadlines:</b> Y Combinator Winter 2027 on 2 Nov (8 pm PT, the only route to Robinhood's fund); Alliance DAO ALL19 on 18 Nov.</li>
          <li><b>No form?</b> Ask for a warm intro (Privy for Archetype, Arbitrum/Offchain Labs for Robinhood Chain) or DM on X.</li>
        </ol>
      </section>
      {ORDER.map((t) => {
        const rows = INVESTORS.filter((i) => i.tier === t);
        return (
          <section className="card" key={t}>
            <h2>{TIER_TITLE[t]} <span className="muted num">{rows.filter((i) => stat[i.name]).length}/{rows.length}</span></h2>
            <ul className="inv-list">{rows.map((i) => <Firm key={i.name} i={i} st={stat[i.name]} setStatus={setStatus} />)}</ul>
          </section>
        );
      })}
    </>
  );
}
