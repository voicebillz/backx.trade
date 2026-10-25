import { useState } from 'react';
import { marketPath } from '../lib/router';

/** Share this coin's own page (owner 2026-10-25): the phone's share sheet when there is one, else copy the link. */
export function ShareButton({ symbol, name }: { symbol: string; name: string }) {
  const [note, setNote] = useState<string | null>(null);
  const url = `${location.origin}${marketPath(symbol)}`;
  const share = async () => {
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: `${symbol} · BackX`, text: `${name} on BackX`, url }); return; }
      await navigator.clipboard.writeText(url);
      setNote('Link copied');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return; // closed the share sheet
      setNote(url);
    }
    setTimeout(() => setNote(null), 2200);
  };
  return (
    <div className="snap">
      <button type="button" className="chart-tool icon" onClick={share} aria-label={`Share the ${symbol} page`} title="Share">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" /></svg>
      </button>
      {note && <span className="snap-note left" role="status">{note}</span>}
    </div>
  );
}
