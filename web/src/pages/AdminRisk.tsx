import { useState } from 'react';
import { PERSONAL_DATA, SYSTEMS, type Group, type Risk, type System } from '../lib/systems';

// Admin → Data risk (owner 2026-11-05): every outside system BackX uses, with what it holds, its risk, the
// safeguards in place, what is still open and links to its dashboard and status page. Data in lib/systems.ts.

const RISK_TEXT: Record<Risk, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const ORDER: Risk[] = ['critical', 'high', 'medium', 'low'];
const GROUPS: Group[] = ['Hosting and code', 'Login and wallets', 'Email and identity', 'Money and chain', 'Market data', 'AI and marketing', 'Validator servers'];

function Row({ s }: { s: System }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={'inv-row' + (open ? ' open' : '')}>
      <button className="inv-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="inv-name"><b>{s.name}{s.planned ? ' (planned)' : ''}</b><small>{s.use}</small></span>
        <span className="inv-stage">
          {s.personal && <span className="dr-tag">Personal data</span>}
          {s.actions.length > 0 && <span className="dr-tag open">{s.actions.length} open</span>}
          <b className={'dr-risk ' + s.risk}>{RISK_TEXT[s.risk]}</b>
        </span>
        <span className="inv-chev" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="inv-body">
          <dl className="inv-facts">
            <div><dt>Holds / sees</dt><dd>{s.data}</dd></div>
            {s.safeguards.length > 0 && <div><dt>In place</dt><dd><ul className="dr-list">{s.safeguards.map((x) => <li key={x}><span className="ok-text" aria-hidden="true">+</span>{x}</li>)}</ul></dd></div>}
            {s.actions.length > 0 && <div><dt>To do</dt><dd><ul className="dr-list">{s.actions.map((x) => <li key={x}><span className="warn" aria-hidden="true">!</span>{x}</li>)}</ul></dd></div>}
            <div><dt>Links</dt><dd className="inv-reach">{s.links.map(([l, u]) => <a key={u} href={u} target="_blank" rel="noopener noreferrer">{l}</a>)}</dd></div>
          </dl>
        </div>
      )}
    </li>
  );
}

export function AdminRisk() {
  const count = (r: Risk) => SYSTEMS.filter((s) => s.risk === r).length;
  const open = SYSTEMS.flatMap((s) => s.actions.map((a) => ({ s, a })))
    .sort((x, y) => ORDER.indexOf(x.s.risk) - ORDER.indexOf(y.s.risk));
  return (
    <>
      <section className="admin-tiles">
        {([['Systems', SYSTEMS.length], ['Critical', count('critical')], ['High', count('high')], ['Open actions', open.length]] as const).map(([l, v]) => (
          <div className="card tile" key={l}><span className="label">{l}</span><span className="num tile-value">{v}</span></div>
        ))}
      </section>

      <section className="card">
        <h2>Open actions <span className="muted num">{open.length}</span></h2>
        <ol className="dr-actions">
          {open.map(({ s, a }) => <li key={s.name + a}><b className={'dr-risk ' + s.risk}>{RISK_TEXT[s.risk]}</b> <b>{s.name}:</b> {a}</li>)}
        </ol>
      </section>

      {GROUPS.map((g) => {
        const rows = SYSTEMS.filter((s) => s.group === g).sort((a, b) => ORDER.indexOf(a.risk) - ORDER.indexOf(b.risk));
        return rows.length > 0 && (
          <section className="card" key={g}>
            <h2>{g} <span className="muted num">{rows.length}</span></h2>
            <ul className="inv-list">{rows.map((s) => <Row key={s.name} s={s} />)}</ul>
          </section>
        );
      })}

      <section className="card">
        <h2>Where personal data lives</h2>
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Data</th><th>Stored in</th><th>Why</th></tr></thead>
            <tbody>{PERSONAL_DATA.map(([d, w, y]) => <tr key={d}><td>{d}</td><td>{w}</td><td>{y}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="muted small">BackX is run from Norway, so GDPR applies. The Terms and Privacy pages still name GAZZFUN LLC until the new company exists: update them, list these processors in the privacy policy and sign each vendor's data processing agreement (DPA).</p>
      </section>
    </>
  );
}
