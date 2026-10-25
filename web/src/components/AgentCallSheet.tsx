import { useState } from 'react';
import { AGENT_CALLS, CALL_GROUPS, agentCallsCsv, type CallGroup } from '../lib/agentCalls';

/** Spreadsheet-style call list for AI agents: row numbers, gridlines, a group filter and a CSV download. */
export function AgentCallSheet() {
  const [group, setGroup] = useState<CallGroup | 'All'>('All');
  const rows = AGENT_CALLS.map((c, i) => ({ ...c, n: i + 1 })).filter((c) => group === 'All' || c.group === group);

  const download = () => {
    const url = URL.createObjectURL(new Blob([agentCallsCsv()], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backx-agent-calls.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="wp-fig sheet-fig">
      <div className="sheet-bar">
        <div className="sheet-tabs" role="tablist" aria-label="Call group">
          {(['All', ...CALL_GROUPS] as const).map((g) => (
            <button key={g} role="tab" aria-selected={group === g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>{g}</button>
          ))}
        </div>
        <button className="btn-mini" onClick={download}>Download CSV</button>
      </div>
      <div className="sheet-scroll" tabIndex={0} aria-label="Agent call list, scrolls sideways">
        <table className="callsheet">
          <thead>
            <tr><th className="sheet-n" scope="col">#</th><th scope="col">Step</th><th scope="col">Contract</th><th scope="col">Call</th><th scope="col">Returns</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.n}>
                <td className="sheet-n num">{c.n}</td>
                <td><span className={'sheet-tag g-' + c.group.toLowerCase()}>{c.group}</span>{c.step}</td>
                <td className="muted">{c.contract}</td>
                <td><code>{c.call}</code></td>
                <td className="muted">{c.returns}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
