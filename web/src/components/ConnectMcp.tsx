import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CLIENTS, MCP_URL } from '../lib/mcpGuide';
import { McpAddress } from './McpSteps';

// "Connect with MCP" (owner 2026-10-26): ChatGPT, Claude and Copilot one tap away, "Custom" for everything else.
// Every button copies the server address and opens the assistant's own connector settings; the user finishes there
// and approves on app.backx.trade/connect. The address is the same for everyone: who you are comes from that login,
// never from the link, so a shared or leaked link gives nobody access.

interface Quick { id: string; name: string; logo: string; open: string; openLabel: string; steps: string[] }

const QUICK: Quick[] = [
  {
    id: 'chatgpt', name: 'ChatGPT', logo: '/ai/openai.svg', open: 'https://chatgpt.com/#settings/Connectors', openLabel: 'Open ChatGPT settings',
    steps: ['Settings → Apps & Connectors (turn on developer mode under Advanced if asked) → Create.', 'Name it BackX, paste the address (already copied), choose OAuth, save.', 'Connect, log in on the BackX window and approve.', 'It works on your account only; you sign every transaction yourself.'],
  },
  {
    id: 'claude', name: 'Claude', logo: '/ai/claude.svg', open: 'https://claude.ai/settings/connectors', openLabel: 'Open Claude connectors',
    steps: ['Choose "Add custom connector".', 'Name it BackX and paste the address (already copied).', 'Click Connect, log in on the BackX window and approve.', 'It works on your account only; you sign every transaction yourself.'],
  },
  {
    id: 'copilot', name: 'Copilot', logo: '/ai/copilot.svg',
    // VS Code's MCP install link: GitHub Copilot in VS Code picks the server up from here.
    open: `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: 'backx', type: 'http', url: MCP_URL }))}`, openLabel: 'Install in VS Code',
    steps: ['Click "Install in VS Code" and confirm in VS Code.', 'In Copilot Chat (Agent mode), start the backx server and log in on the BackX window.', 'Approve, then ask Copilot about your BackX account. You sign every transaction yourself.'],
  },
];

// The assistants' own app icons: their real marks in their own colours on their own tile colour.
const Logo = ({ id, src }: { id: string; src: string }) => <span className={`ai-logo ai-${id}`} aria-hidden="true"><img src={src} alt="" width="22" height="22" /></span>;

export function ConnectMcp({ onClose }: { onClose: () => void }) {
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);
  const q = QUICK.find((x) => x.id === pick);
  const choose = (id: string) => { navigator.clipboard?.writeText(MCP_URL).catch(() => {}); setPick(id); };

  return createPortal(
    <div className="sheet-scrim center" onClick={onClose}>
      <div className="modal mcpc" role="dialog" aria-modal="true" aria-label="Connect with MCP" onClick={(e) => e.stopPropagation()}>
        <div className="mcpc-head">
          {pick && <button className="icon-btn" onClick={() => setPick(null)} aria-label="Back">←</button>}
          <h2>{q ? `Connect ${q.name}` : pick === 'custom' ? 'Custom MCP client' : 'Connect with MCP'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {!pick && (
          <>
            <div className="mcpc-grid">
              {QUICK.map((x) => (
                <button key={x.id} className="mcpc-btn" onClick={() => choose(x.id)}><Logo id={x.id} src={x.logo} /><span>{x.name}</span></button>
              ))}
              <button className="mcpc-btn" onClick={() => setPick('custom')}><span className="ai-logo custom" aria-hidden="true">{'{ }'}</span><span>Custom</span></button>
            </div>
          </>
        )}

        {q && (
          <>
            <p className="ok small" role="status">Server address copied.</p>
            <McpAddress />
            <ol className="mcp-steplist">{q.steps.map((s, i) => <li key={i}><span className="n num">{i + 1}</span><span>{s}</span></li>)}</ol>
            <a className="btn btn-primary btn-block" href={q.open} target={q.open.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{q.openLabel}</a>
          </>
        )}

        {pick === 'custom' && (
          <>
            <McpAddress />
            <ol className="mcp-steplist">
              {['Add this address to any MCP client with remote servers (Streamable HTTP) and OAuth.', 'Log in and approve on the BackX window that opens.', 'It works on your account only; you sign every transaction yourself.']
                .map((s, i) => <li key={i}><span className="n num">{i + 1}</span><span>{s}</span></li>)}
            </ol>
            {CLIENTS.filter((c) => c.code).map((c) => (
              <div key={c.id} className="mcpc-custom">
                <span className="lab">{c.name}</span>
                <pre className="num"><code>{c.code}</code></pre>
              </div>
            ))}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
