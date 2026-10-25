import { useEffect, useRef, useState, type RefObject } from 'react';
import type { IChartApi } from 'lightweight-charts';

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/** The chart as a PNG with a small header (coin, timeframe, time, backx.trade). */
function render(chart: IChartApi, title: string): Promise<Blob | null> {
  const shot = chart.takeScreenshot();
  const head = 40 * (window.devicePixelRatio || 1), dpr = window.devicePixelRatio || 1;
  const out = document.createElement('canvas');
  out.width = shot.width; out.height = shot.height + head;
  const g = out.getContext('2d')!;
  g.fillStyle = css('--panel'); g.fillRect(0, 0, out.width, out.height);
  g.drawImage(shot, 0, head);
  g.textBaseline = 'middle';
  g.font = `600 ${14 * dpr}px ${css('--sans') || 'system-ui, sans-serif'}`;
  g.fillStyle = css('--ink'); g.fillText(title, 14 * dpr, head / 2);
  g.font = `500 ${12 * dpr}px ${css('--mono') || 'monospace'}`;
  const right = `backx.trade · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  g.fillStyle = css('--ink-3'); g.fillText(right, out.width - g.measureText(right).width - 14 * dpr, head / 2);
  return new Promise((ok) => out.toBlob(ok, 'image/png'));
}

/** Camera button: Download image (Ctrl+Alt+S) or Copy image (Ctrl+Shift+S). */
export function SnapshotButton({ chart, title }: { chart: RefObject<IChartApi | null>; title: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const download = async () => {
    setOpen(false);
    if (!chart.current) return;
    const blob = await render(chart.current, title);
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backx-${title.replace(/[^A-Za-z0-9]+/g, '-')}-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const copy = async () => {
    setOpen(false);
    if (!chart.current) return;
    try {
      const blob = await render(chart.current, title);
      if (!blob) throw new Error('render');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setNote('Copied');
    } catch { setNote('Copy not allowed here: use Download'); }
    setTimeout(() => setNote(null), 2000);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      if (e.altKey) { e.preventDefault(); void download(); } else if (e.shiftKey) { e.preventDefault(); void copy(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('mousedown', away);
    return () => removeEventListener('mousedown', away);
  }, [open]);

  return (
    <div className="snap" ref={box}>
      <button type="button" className="chart-tool icon" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Chart snapshot" title="Chart snapshot">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
      </button>
      {note && <span className="snap-note" role="status">{note}</span>}
      {open && (
        <div className="snap-menu" role="menu">
          <p className="snap-head">Chart snapshot</p>
          <button role="menuitem" onClick={download}><span>Download image</span><kbd>Ctrl+Alt+S</kbd></button>
          <button role="menuitem" onClick={copy}><span>Copy image</span><kbd>Ctrl+Shift+S</kbd></button>
        </div>
      )}
    </div>
  );
}
