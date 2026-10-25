import { useEffect, useRef, useState, type RefObject } from 'react';
import type { IChartApi } from 'lightweight-charts';
import { BODY, HEAD } from './Logo';

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export interface SnapInfo { symbol: string; name: string; frame: string; price: string; change24h: number }

const S = 1200;                    // square, fits X / Instagram / Telegram previews
const BLACK = '#070707', YELLOW = '#FFD100', WHITE = '#F2F2F2', GREY = '#8A8A8A', CARD_LINE = 'rgba(255,255,255,.08)';

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** Square share image (owner 2026-10-25): dark frame, logo and backx.trade on top, the chart re-laid out to fit, motto below. */
function render(chart: IChartApi, info: SnapInfo): Promise<Blob | null> {
  const card = { x: 48, y: 156, w: S - 96, h: 900 };
  // Draw the chart at the card's own shape (not the page's wide one), then give the page its size back.
  chart.applyOptions({ autoSize: false });
  chart.resize(card.w, card.h, true);
  chart.timeScale().fitContent();
  const shot = chart.takeScreenshot();
  chart.applyOptions({ autoSize: true });
  requestAnimationFrame(() => chart.timeScale().fitContent());

  const out = document.createElement('canvas');
  out.width = S; out.height = S;
  const g = out.getContext('2d')!;
  const sans = css('--font') || 'system-ui, sans-serif', mono = css('--mono') || 'monospace';
  g.fillStyle = BLACK; g.fillRect(0, 0, S, S);

  // Logo: the yellow tile with the black mark, then the wordmark.
  roundRect(g, 48, 52, 64, 64, 14); g.fillStyle = YELLOW; g.fill();
  g.save(); g.translate(48 + 8, 52 + 13); g.scale(48 / 75, 48 / 75); g.translate(-18, -25);
  g.fillStyle = BLACK; g.fill(new Path2D(HEAD)); g.fill(new Path2D(BODY)); g.restore();
  g.textBaseline = 'middle';
  g.font = `700 38px ${sans}`; g.fillStyle = WHITE; g.fillText('backx', 132, 86);
  const w1 = g.measureText('backx').width;
  g.fillStyle = GREY; g.fillText('.trade', 132 + w1, 86);

  // Coin, timeframe, price and 24 h change on the right.
  g.textAlign = 'right';
  g.font = `600 34px ${mono}`; g.fillStyle = WHITE; g.fillText(info.price, S - 48, 70);
  const up = info.change24h >= 0;
  const chg = `${up ? '+' : '−'}${Math.abs(info.change24h).toFixed(2)}% 24h`;
  g.font = `500 20px ${mono}`; g.fillStyle = up ? (css('--price-up') || '#22C38E') : (css('--price-down') || '#F2555F'); g.fillText(chg, S - 48, 108);
  const priceW = Math.max(g.measureText(chg).width, (g.font = `600 34px ${mono}`, g.measureText(info.price).width));
  g.font = `700 30px ${sans}`; g.fillStyle = WHITE; g.fillText(info.symbol, S - 48 - priceW - 28, 70);
  g.font = `400 18px ${sans}`; g.fillStyle = GREY; g.fillText(`${info.name} · ${info.frame}`, S - 48 - priceW - 28, 106);
  g.textAlign = 'left';

  // The chart in a rounded card.
  g.save(); roundRect(g, card.x, card.y, card.w, card.h, 20); g.clip();
  g.fillStyle = css('--panel') || '#0F1626'; g.fillRect(card.x, card.y, card.w, card.h);
  g.drawImage(shot, card.x, card.y, card.w, card.h);
  g.restore();
  roundRect(g, card.x + 0.5, card.y + 0.5, card.w - 1, card.h - 1, 20); g.strokeStyle = CARD_LINE; g.lineWidth = 1; g.stroke();

  // Footer: motto and time.
  g.font = `500 22px ${sans}`; g.fillStyle = WHITE; g.fillText('Future Trading for Agents', 48, 1110);
  const m = g.measureText('Future Trading for Agents ').width;
  g.fillStyle = YELLOW; g.fillText('⇄ Capital', 48 + m, 1110);
  g.font = `400 18px ${mono}`; g.fillStyle = GREY; g.textAlign = 'right';
  g.fillText(`${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, S - 48, 1110);
  g.textAlign = 'left';
  return new Promise((ok) => out.toBlob(ok, 'image/png'));
}

/** Camera button: Download image (Ctrl+Alt+S) or Copy image (Ctrl+Shift+S), both the square share image. */
export function SnapshotButton({ chart, info }: { chart: RefObject<IChartApi | null>; info: SnapInfo }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const download = async () => {
    setOpen(false);
    if (!chart.current) return;
    const blob = await render(chart.current, info);
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backx-${info.symbol}-${info.frame.replace(/\s+/g, '')}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const copy = async () => {
    setOpen(false);
    if (!chart.current) return;
    try {
      const blob = await render(chart.current, info);
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
