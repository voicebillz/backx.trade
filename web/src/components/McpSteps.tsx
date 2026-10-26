import { useState } from 'react';
import { CLIENTS, MCP_URL } from '../lib/mcpGuide';

function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn-mini" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
      aria-label={`${label}: ${text}`}>
      {done ? 'Copied' : label}
    </button>
  );
}

/** The server address with a copy button. */
export function McpAddress() {
  return (
    <div className="mcp-addr">
      <span className="lab">Server address</span>
      <code className="num">{MCP_URL}</code>
      <CopyBtn text={MCP_URL} />
    </div>
  );
}

/** Step-by-step per assistant, one tab each. */
export function McpSteps() {
  const [id, setId] = useState(CLIENTS[0].id);
  const c = CLIENTS.find((x) => x.id === id)!;
  return (
    <div className="mcp-guide">
      <div className="mcp-tabs" role="tablist" aria-label="Your assistant">
        {CLIENTS.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === id} className={x.id === id ? 'on' : ''} onClick={() => setId(x.id)}>{x.name}</button>
        ))}
      </div>
      <ol className="mcp-steplist" role="tabpanel">
        {c.steps.map((s, i) => <li key={i}><span className="n num">{i + 1}</span><span>{s}</span></li>)}
      </ol>
      {c.code && (
        <div className="mcp-code">
          <pre><code>{c.code}</code></pre>
          <CopyBtn text={c.code} />
        </div>
      )}
    </div>
  );
}
