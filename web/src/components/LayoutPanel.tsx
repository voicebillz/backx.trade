import { useEffect, useState } from 'react';
import { PRESETS, thumbOf, useLayout, type Layout, type PanelKind } from '../lib/layout';

const KIND_LABEL: Record<PanelKind, string> = { markets: 'Moving markets', positions: 'Positions', none: 'Off' };
const same = (a: Layout, b: Layout) => (Object.keys(a) as (keyof Layout)[]).every((k) => a[k] === b[k]);

function Thumb({ l }: { l: Layout }) {
  return (
    <div className="lay-thumb" style={thumbOf(l)} aria-hidden="true">
      {l.side !== 'none' && <i className={'a-markets k-' + l.side} />}
      <i className="a-center">{l.header && <b />}</i>
      <i className="a-ticket" />
      {l.bottom !== 'none' && <i className={'a-bottom k-' + l.bottom} />}
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="lay-row">
      <span className="label">{label}</span>
      <div className="lay-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, t]) => <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{t}</button>)}
      </div>
    </div>
  );
}

/** Header gear: pick one of ten terminal layouts, swap or remove panels. Chart and ticket always stay. */
export function LayoutButton() {
  const [open, setOpen] = useState(false);
  const { layout, set } = useLayout();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [open]);
  const kinds: [PanelKind, string][] = (['markets', 'positions', 'none'] as PanelKind[]).map((k) => [k, KIND_LABEL[k]]);
  return (
    <>
      <button className="icon-btn gear-btn" onClick={() => setOpen(true)} aria-label="Terminal layout" title="Terminal layout">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div className="sheet-scrim center" onClick={() => setOpen(false)}>
          <div className="modal lay-modal" role="dialog" aria-modal="true" aria-label="Terminal layout" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn modal-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            <h2>Terminal layout</h2>
            <div className="lay-grid">
              {PRESETS.map((p) => (
                <button key={p.name} className={'lay-card' + (same(p.layout, layout) ? ' on' : '')} aria-pressed={same(p.layout, layout)} onClick={() => set(p.layout)}>
                  <Thumb l={p.layout} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
            <Seg label="Side panel" value={layout.side} options={kinds} onChange={(v) => set({ side: v })} />
            <Seg label="Bottom panel" value={layout.bottom} options={kinds} onChange={(v) => set({ bottom: v })} />
            <Seg label="Ticket" value={layout.ticketSide} options={[['left', 'Left'], ['right', 'Right']]} onChange={(v) => set({ ticketSide: v })} />
            <Seg label="Coin header" value={layout.header ? 'on' : 'off'} options={[['on', 'On'], ['off', 'Off']]} onChange={(v) => set({ header: v === 'on' })} />
            <button className="btn btn-ghost btn-sm" onClick={() => set(PRESETS[0].layout)}>Reset to standard</button>
          </div>
        </div>
      )}
    </>
  );
}
