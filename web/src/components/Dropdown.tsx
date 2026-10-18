import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface Option<T extends string> { value: T; label: string; icon?: ReactNode; hint?: string }

interface Props<T extends string> {
  label: string;               // accessible name
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  compact?: boolean;
}

/** Listbox dropdown: keyboard (↑↓ Home End Enter Esc), click outside closes, themed in both modes. */
export function Dropdown<T extends string>({ label, value, options, onChange, compact }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(options.findIndex((o) => o.value === value), 0));
    list.current?.focus();
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('pointerdown', away);
    return () => removeEventListener('pointerdown', away);
  }, [open, options, value]);

  const pick = (i: number) => { onChange(options[i].value); setOpen(false); };
  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowDown') setActive((a) => Math.min(a + 1, options.length - 1));
    else if (k === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
    else if (k === 'Home') setActive(0);
    else if (k === 'End') setActive(options.length - 1);
    else if (k === 'Enter' || k === ' ') pick(active);
    else if (k === 'Escape' || k === 'Tab') { setOpen(false); return; }
    else return;
    e.preventDefault();
  };

  return (
    <div className={'dd' + (open ? ' open' : '') + (compact ? ' compact' : '')} ref={root}>
      <button
        type="button" className="dd-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); } }}
      >
        {current.icon}<span className="dd-label">{current.label}</span>
        <svg className="dd-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <ul className="dd-list" role="listbox" id={id} tabIndex={-1} ref={list} aria-label={label} aria-activedescendant={`${id}-${active}`} onKeyDown={onKey}>
          {options.map((o, i) => (
            <li
              key={o.value} id={`${id}-${i}`} role="option" aria-selected={o.value === value}
              className={(i === active ? 'active ' : '') + (o.value === value ? 'selected' : '')}
              onPointerEnter={() => setActive(i)} onClick={() => pick(i)}
            >
              {o.icon}<span className="dd-opt-label">{o.label}</span>
              {o.hint && <span className="dd-hint">{o.hint}</span>}
              {o.value === value && <svg className="dd-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
