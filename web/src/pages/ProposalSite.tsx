import { useEffect } from 'react';
import { Logo } from '../components/Logo';
import { useTheme } from '../lib/theme';
import { APP_URL } from '../lib/host';
import { useProposal, type Proposal } from '../lib/proposals';

// www.backx.trade/proposal (owner 2026-11-04): one BackX Proposal, clean and simple. Yes/No only, a colourful split
// bar in percent and never how many signalled. Signalling needs a login (one signal per account, changeable while open).

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

export default function ProposalSite() {
  const { theme, setTheme } = useTheme();
  const id = Number(new URLSearchParams(location.search).get('bxp')) || null;
  const { proposal: p, signal, busy, err, canSignal } = useProposal(id);
  useEffect(() => { document.title = p ? `${p.code} · ${p.title} · BackX` : 'Proposal · BackX'; }, [p]);
  const open = p?.status === 'open';

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
      <main id="main" className="bxp-page">
        {p === undefined ? (
          <div className="bxp-card" aria-busy="true">
            <span className="sk sk-w30" /><span className="sk bxp-sk-title" /><span className="sk bxp-sk-bar" />
          </div>
        ) : p === null ? (
          <div className="bxp-card"><p className="h-kicker">BackX Proposal</p><h1>No proposal is open right now.</h1><a className="h-btn h-btn-ghost" href="/">Back to BackX</a></div>
        ) : (
          <article className="bxp-card" aria-labelledby="bxp-title">
            <div className="bxp-meta">
              <span className="bxp-code">{p.code}</span>
              <span className={'bxp-status ' + p.status}>{open ? 'Open' : 'Closed'}</span>
            </div>
            <h1 id="bxp-title">{p.title}</h1>
            {p.body && <div className="bxp-body">{p.body.split(/\n{2,}/).map((t, i) => <p key={i}>{t}</p>)}</div>}
            <p className="bxp-question">{p.question}</p>
            <SplitBar p={p} />
            <div className="bxp-choices" role="group" aria-label="Your signal">
              {(['yes', 'no'] as const).map((c) => (
                <button key={c} className={`bxp-choice ${c}` + (p.mine === c ? ' picked' : '')} aria-pressed={p.mine === c}
                  disabled={!open || busy || !canSignal} onClick={() => signal(c)}>
                  {c === 'yes' ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
            <p className="bxp-mine" aria-live="polite">
              {err ? <span role="alert" className="h-err">{err}</span>
                : p.mine ? `Your signal: ${p.mine === 'yes' ? 'Yes' : 'No'}${open ? '. You can change it while the proposal is open.' : ''}`
                : open ? 'One signal per account. Log in to signal.' : 'This proposal is closed.'}
            </p>
          </article>
        )}
      </main>
      <footer className="h-footer">
        <Logo />
        <nav aria-label="Footer"><a href="/whitepaper">Whitepaper</a><a href="/mcp">MCP</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></nav>
        <span className="h-footer-legal">Not financial advice.</span>
      </footer>
    </div>
  );
}
