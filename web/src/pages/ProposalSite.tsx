import { useEffect, useState } from 'react';
import { Logo } from '../components/Logo';
import { useTheme } from '../lib/theme';
import { APP_URL } from '../lib/host';
import { useProposal, useProposals, useCountdown, outcomeOf, fmtDate, proposalHref, PROPOSALS_PATH, type Proposal } from '../lib/proposals';

// www.backx.trade/proposals (owner 2026-11-04): BackX Validator Proposals. Front page = the running proposal big on
// top + earlier ones with their outcome; ?bxp=<id> = one proposal. Yes/No only, a colourful split bar in percent,
// never how many signalled. Timer: runs `days` (default 14, Admin → Proposals), then the outcome shows.

const fmt = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} %`;

function SplitBar({ p }: { p: Proposal }) {
  const none = p.yesPct === null;
  const yes = p.yesPct ?? 50;
  const no = p.noPct ?? 50;
  return (
    <div className="bxp-split">
      <div className="bxp-split-labels" aria-hidden={none || undefined}>
        <span className="bxp-yes-label">Yes {none ? '' : fmt(yes)}</span>
        <span className="bxp-no-label">{none ? '' : fmt(no)} No</span>
      </div>
      <div className={'bxp-bar' + (none ? ' empty' : yes > 0 && no > 0 ? ' both' : '')} role="img"
        aria-label={none ? 'No signals yet' : `Yes ${fmt(yes)}, No ${fmt(no)}`}>
        <span className="bxp-bar-yes" style={{ width: `${yes}%` }} />
        <span className="bxp-bar-no" style={{ width: `${no}%` }} />
      </div>
      {none && <p className="bxp-none">No signals yet</p>}
    </div>
  );
}

function CopyBlock({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="bxp-code-block">
      <button className="bxp-copy" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
        aria-label={`Copy ${label}`}>{done ? 'Copied' : 'Copy'}</button>
      <pre><code>{text}</code></pre>
    </div>
  );
}

/** How an AI agent signals: through MCP for its user's account, or with its own wallet (EIP-191). Same as skill.md §7. */
function AgentRecipe({ p }: { p: Proposal | null }) {
  const ask = `Signal Yes on BackX ${p?.code ?? 'Proposal'}`;
  const script = `// Node 18+ with viem: npm i viem
import { privateKeyToAccount } from 'viem/accounts';
const account = privateKeyToAccount(process.env.AGENT_KEY); // your agent's own wallet, never shared
const api = 'https://api.backx.trade/agent/proposals';
const { proposal } = await (await fetch(api + '/latest')).json();
const choice = 'yes'; // or 'no'
const wallet = account.address.toLowerCase();
const issued = new Date().toISOString();
const signature = await account.signMessage({
  message: \`BackX Proposal \${proposal.code}\\nSignal: \${choice}\\nWallet: \${wallet}\\nIssued: \${issued}\`,
});
const r = await fetch(api + '/' + proposal.id + '/signal', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ wallet, choice, issued, signature }),
});
console.log(r.status, await r.json());`;
  return (
    <section className="bxp-agents" aria-labelledby="bxp-agents-title">
      <h2 id="bxp-agents-title">Signal as an AI agent</h2>
      <div className="bxp-agent-grid">
        <div className="bxp-agent-card">
          <h3>Your assistant (MCP)</h3>
          <ol>
            <li>Connect Claude, ChatGPT or Copilot to your BackX account: <a href="/mcp">backx.trade/mcp</a>. Tick <b>Signal on Validator Proposals</b>.</li>
            <li>Ask it:</li>
          </ol>
          <CopyBlock text={ask} label="the prompt" />
        </div>
        <div className="bxp-agent-card">
          <h3>Your agent's own wallet</h3>
          <ol>
            <li>Any EOA wallet with one transaction on Robinhood Chain, BNB Chain, Base or Arbitrum.</li>
            <li>Sign the message (no gas, no money moves) and post it:</li>
          </ol>
          <CopyBlock text={script} label="the script" />
          <p className="bxp-agent-more">Full recipe for agents: <a href="/skill.md">backx.trade/skill.md</a></p>
        </div>
      </div>
    </section>
  );
}

function Timer({ p }: { p: Proposal }) {
  const left = useCountdown(p.status === 'open' ? p.endsAt : null);
  if (p.status === 'open') return left ? <span className="bxp-timer num">{left} left</span> : null;
  return <span className="bxp-timer ended">Ended {fmtDate(p.closedAt)}</span>;
}

const WORD = { yes: 'Yes', no: 'No', tie: 'Tie' } as const;

function Outcome({ p }: { p: Proposal }) {
  const o = outcomeOf(p);
  return (
    <div className={'bxp-outcome ' + (o ?? 'none')}>
      <span className="bxp-outcome-label">Outcome</span>
      <b>{o ? WORD[o] : 'No signals'}</b>
    </div>
  );
}

function Meta({ p }: { p: Proposal }) {
  return (
    <div className="bxp-meta">
      <span className="bxp-code">{p.code}</span>
      <span className="bxp-kind">Validator Proposal</span>
      <Timer p={p} />
    </div>
  );
}

/** Yes / No while open, the outcome once closed. */
function Decide({ id, initial }: { id: number; initial: Proposal }) {
  const { proposal, signal, busy, err, canSignal } = useProposal(id);
  const p = proposal ?? initial;
  const open = p.status === 'open';
  return (
    <>
      <SplitBar p={p} />
      {open ? (
        <>
          <div className="bxp-choices" role="group" aria-label="Your signal">
            {(['yes', 'no'] as const).map((c) => (
              <button key={c} className={`bxp-choice ${c}` + (p.mine === c ? ' picked' : '')} aria-pressed={p.mine === c}
                disabled={busy || !canSignal || !!p.mine} onClick={() => signal(c)}>{c === 'yes' ? 'Yes' : 'No'}</button>
            ))}
          </div>
          <p className="bxp-mine" aria-live="polite">{err ? <span role="alert" className="h-err">{err}</span> : p.mine ? `Your signal: ${WORD[p.mine]}` : ''}</p>
        </>
      ) : <Outcome p={p} />}
    </>
  );
}

function Detail({ id }: { id: number }) {
  const { proposal: p } = useProposal(id);
  useEffect(() => { document.title = p ? `${p.code} · ${p.title} · BackX` : 'Validator Proposal · BackX'; }, [p]);
  if (p === undefined) return <div className="bxp-card" aria-busy="true"><span className="sk sk-w30" /><span className="sk bxp-sk-title" /><span className="sk bxp-sk-bar" /></div>;
  if (p === null) return <div className="bxp-card"><h1>Proposal not found.</h1><a className="h-btn h-btn-ghost" href={PROPOSALS_PATH}>All proposals</a></div>;
  return (
    <>
      <article className="bxp-card" aria-labelledby="bxp-title">
        <a className="bxp-back" href={PROPOSALS_PATH}>← All proposals</a>
        <Meta p={p} />
        <h1 id="bxp-title">{p.title}</h1>
        {p.body && <div className="bxp-body">{p.body.split(/\n{2,}/).map((t, i) => <p key={i}>{t}</p>)}</div>}
        <p className="bxp-question">{p.question}</p>
        <Decide id={p.id} initial={p} />
      </article>
      {p.status === 'open' && <AgentRecipe p={p} />}
    </>
  );
}

function Index() {
  const items = useProposals();
  useEffect(() => { document.title = 'Validator Proposals · BackX'; }, []);
  const current = items?.find((x) => x.status === 'open') ?? null;
  const earlier = items?.filter((x) => x !== current) ?? [];
  return (
    <>
      <header className="bxp-index-head">
        <h1>Validator Proposals</h1>
        <p className="bxp-anyone">Anyone can be a validator.</p>
      </header>
      {items === null ? (
        <div className="bxp-feature" aria-busy="true"><span className="sk sk-w30" /><span className="sk bxp-sk-title" /><span className="sk bxp-sk-bar" /></div>
      ) : current ? (
        <article className="bxp-feature" aria-labelledby="bxp-current">
          <Meta p={current} />
          <h2 id="bxp-current"><a href={proposalHref(current.id)}>{current.title}</a></h2>
          <p className="bxp-question">{current.question}</p>
          <Decide id={current.id} initial={current} />
          <a className="bxp-more" href={proposalHref(current.id)}>Read the proposal →</a>
        </article>
      ) : (
        <div className="bxp-feature"><h2>No proposal is running.</h2></div>
      )}
      {earlier.length > 0 && (
        <section className="bxp-history" aria-labelledby="bxp-earlier">
          <h2 id="bxp-earlier">Earlier</h2>
          <ul>
            {earlier.map((x) => {
              const o = outcomeOf(x);
              return (
                <li key={x.id}>
                  <a href={proposalHref(x.id)}>
                    <span className="bxp-h-top"><span className="bxp-code sm">{x.code}</span><span className="bxp-h-title">{x.title}</span>
                      <span className={'bxp-h-out ' + (o ?? 'none')}>{o ? WORD[o] : 'No signals'}</span></span>
                    <span className="bxp-mini" aria-hidden="true"><i className="y" style={{ width: `${x.yesPct ?? 0}%` }} /><i className="n" style={{ width: `${x.noPct ?? 0}%` }} /></span>
                    <span className="bxp-h-date">{x.yesPct !== null ? `Yes ${x.yesPct} % · No ${x.noPct} % · ` : ''}Ended {fmtDate(x.closedAt)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <AgentRecipe p={current} />
    </>
  );
}

export default function ProposalSite() {
  const { theme, setTheme } = useTheme();
  const id = Number(new URLSearchParams(location.search).get('bxp')) || null;
  return (
    <div className="home home-doc">
      <a className="skip" href="#main">Skip to content</a>
      <header className="h-header">
        <span className="h-logo"><a href="/" aria-label="BackX home"><Logo /></a></span>
        <div className="h-header-cta">
          <button className="h-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>{theme === 'dark' ? '☀' : '☾'}</button>
          <a className="h-btn h-btn-gold" href={APP_URL}>Launch App</a>
        </div>
      </header>
      <main id="main" className="bxp-page">{id ? <Detail id={id} /> : <Index />}</main>
      <footer className="h-footer">
        <Logo />
        <nav aria-label="Footer"><a href="/whitepaper">Whitepaper</a><a href={PROPOSALS_PATH} aria-current="page">Proposals</a><a href="/mcp">MCP</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></nav>
        <span className="h-footer-legal">Not financial advice.</span>
      </footer>
    </div>
  );
}
