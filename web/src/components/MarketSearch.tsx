import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { searchMarkets, type Market } from '../lib/markets';
import { pct, price } from '../lib/format';
import { CoinIcon } from './CoinIcon';

/** Topbar search: opens a panel with suggestions, narrows as you type. ⌘K / Ctrl+K focuses it. */
export function MarketSearch({ onSelect }: { onSelect: (m: Market) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Market[] | null>(null);
  const [suggested, setSuggested] = useState(true);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); setOpen(true); }
    };
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('keydown', onKey);
    addEventListener('pointerdown', away);
    return () => { removeEventListener('keydown', onKey); removeEventListener('pointerdown', away); };
  }, []);

  // Debounced lookup; suggestions when empty.
  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      searchMarkets(q, ctl.signal).then((r) => { setItems(r.items); setSuggested(r.suggested); setActive(0); }).catch(() => {});
    }, q ? 160 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open]);

  const pick = (m: Market) => { onSelect(m); setOpen(false); setQ(''); input.current?.blur(); };
  const onKey = (e: KeyboardEvent) => {
    if (!items?.length) return;
    if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, items.length - 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
    else if (e.key === 'Enter') pick(items[active]);
    else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
    else return;
    e.preventDefault();
  };

  return (
    <div className={'msearch' + (open ? ' open' : '')} ref={root}>
      <svg className="msearch-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input
        ref={input} value={q} placeholder="Search" aria-label="Search markets" autoComplete="off" spellCheck={false}
        role="combobox" aria-expanded={open} aria-controls={id} aria-activedescendant={items?.length ? `${id}-${active}` : undefined}
        onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={onKey}
      />
      {!open && <kbd>⌘K</kbd>}
      {open && (
        <div className="msearch-panel">
          <div className="label msearch-head">{suggested ? 'Trending and majors' : `Results for “${q}”`}</div>
          <ul role="listbox" id={id} aria-label="Markets">
            {items === null && Array.from({ length: 6 }, (_, i) => <li key={i} className="msearch-row skeleton-row" aria-hidden="true"><span className="sk sk-w60" /><span className="sk sk-w30" /></li>)}
            {items?.map((m, i) => (
              <li key={m.id} id={`${id}-${i}`} role="option" aria-selected={i === active}
                className={'msearch-row' + (i === active ? ' active' : '')} onPointerEnter={() => setActive(i)} onClick={() => pick(m)}>
                <CoinIcon symbol={m.symbol} src={m.image} size={22} />
                <span className="msearch-name"><b>{m.symbol}</b><small>{m.name}</small></span>
                <span className="num">{price(m.price)}</span>
                <span className={'chg num ' + (m.change24h >= 0 ? 'up' : 'down')}>{pct(m.change24h)}</span>
              </li>
            ))}
            {items?.length === 0 && <li className="empty">No market matches “{q}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
