import { useEffect, useState } from 'react';
import { api } from './api';

/** Is MCP paused (Admin → Users switch)? Public read, no login: null while loading or if the API can't be reached. */
export function useMcpPaused() {
  const [paused, setPaused] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => api<{ paused: boolean }>('/api/mcp-status').then((r) => live && setPaused(r.paused)).catch(() => {});
    void load();
    const t = setInterval(load, 60_000);
    return () => { live = false; clearInterval(t); };
  }, []);
  return paused;
}

/** "Live" / "Paused" pill; nothing until the status is known. */
export function mcpPill(paused: boolean | null) {
  return paused === null ? null : { cls: paused ? 'mcp-pill paused' : 'mcp-pill live', text: paused ? 'Paused' : 'Live' };
}
