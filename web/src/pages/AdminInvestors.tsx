import { INVESTORS, TIER_TITLE, type Tier } from '../lib/investors';

// Admin "Investors" (owner 2026-10-28): who to ask for the seed round. One firm leads the seed and follows into the
// Series A; strategic funds and co-investors fill the round; grants pay toward the audit without equity.
// Data and sources: lib/investors.ts (checked 2026-10-28, re-verify each row before outreach).

const ORDER: Tier[] = ['lead', 'strategic', 'co', 'program', 'dropped'];

function csv() {
  const head = ['Tier', 'Firm', 'Website', 'Type', 'Stage / check', 'Leads?', 'Recent activity', 'Why BackX', 'Note', 'Contacted', 'Status'];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = INVESTORS.map((i) => [TIER_TITLE[i.tier], i.name, i.url, i.type, i.stage, i.leads, i.recent, i.fit, i.note ?? '', '', ''].map(esc).join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([[head.map(esc).join(','), ...rows].join('\n')], { type: 'text/csv' }));
  a.download = 'backx-investors.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function AdminInvestors() {
  return (
    <>
      <section className="card">
        <div className="row-between">
          <h2>Seed round: one lead</h2>
          <button className="btn btn-primary" onClick={csv}>Download CSV</button>
        </div>
        <ol className="inv-plan">
          <li><b>Lead:</b> Variant, Dragonfly, Haun, Archetype or Lightspeed Faction. One leads the seed and follows into the Series A.</li>
          <li><b>Anchor co-investor:</b> Coinbase Ventures (Base, agents, signal). It rarely leads alone.</li>
          <li><b>Before the meetings:</b> apply to the Arbitrum Security Program for the audit; an audit date answers the first diligence question.</li>
        </ol>
      </section>
      {ORDER.map((t) => {
        const rows = INVESTORS.filter((i) => i.tier === t);
        return (
          <section className="card" key={t}>
            <h2>{TIER_TITLE[t]} <span className="muted num">{rows.length}</span></h2>
            <div className="table-wrap">
              <table className="admin-table inv-table">
                <thead><tr><th>Firm</th><th>Stage / check</th><th>Leads?</th><th>Recent</th><th>Why BackX</th></tr></thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.name}>
                      <td>{i.url ? <a href={i.url} target="_blank" rel="noopener noreferrer"><b>{i.name}</b></a> : <b>{i.name}</b>}<small className="muted block">{i.type}</small>{i.note && <small className="warn block">{i.note}</small>}</td>
                      <td>{i.stage}</td>
                      <td>{i.leads}</td>
                      <td>{i.recent}</td>
                      <td>{i.fit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
