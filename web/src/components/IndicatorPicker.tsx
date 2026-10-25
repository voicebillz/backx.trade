import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { INDICATORS } from '../lib/indicators';

/** "fx Indicators": a searchable list, grouped; tap to add or remove. */
export function IndicatorPicker({ active, onToggle }: { active: string[]; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);
  const list = INDICATORS.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = ['Trend', 'Volatility', 'Momentum', 'Volume'] as const;

  return (
    <>
      <button type="button" className="chart-tool" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="fx" aria-hidden="true">f<sub>x</sub></span> Indicators
        {active.length > 0 && <span className="chart-tool-count num">{active.length}</span>}
      </button>
      {open && createPortal(
        <div className="sheet-scrim center" onClick={() => setOpen(false)}>
          <div className="modal ind-modal" role="dialog" aria-modal="true" aria-label="Indicators" onClick={(e) => e.stopPropagation()}>
            <div className="ind-head">
              <h2>Indicators</h2>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
            <label className="ind-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search indicators" />
            </label>
            <div className="ind-list">
              {groups.map((g) => {
                const rows = list.filter((i) => i.group === g);
                if (!rows.length) return null;
                return (
                  <div key={g}>
                    <p className="ind-group">{g}</p>
                    {rows.map((i) => {
                      const on = active.includes(i.id);
                      return (
                        <button key={i.id} type="button" className={'ind-row' + (on ? ' on' : '')} aria-pressed={on} onClick={() => onToggle(i.id)}>
                          <span>{i.name}</span>
                          <span className="ind-where">{i.overlay ? 'On chart' : 'Own pane'}</span>
                          <span className="ind-check" aria-hidden="true">{on ? '✓' : '+'}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {list.length === 0 && <p className="muted ind-empty">No indicator matches “{q}”.</p>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
