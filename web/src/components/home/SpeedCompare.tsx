import { useEffect, useRef, useState } from 'react';

// Front-page speed cards (owner 2026-10-22): the whole card is a before/after wipe. "Others" flips once to
// "BackX" when the card comes into view; drag anywhere on the card (or use the arrow keys) to compare. A native
// range input covers the card, so touch, mouse and keyboard all work. Reduced motion: no auto flip, BackX shown.

export interface Row { who: string; s: number }

function Layer({ title, tag, ours, big, sub, rows, max }: { title: string; tag: string; ours: boolean; big: string; sub: string; rows: (Row & { ours?: boolean })[]; max: number }) {
  return (
    <div className={'sc-layer' + (ours ? ' ours' : '')}>
      <h3>{title} <span className="sc-tag">{tag}</span></h3>
      <p className="sc-big">{big}</p>
      <p className="sc-sub">{sub}</p>
      <ul className="h-bars sc-bars">
        {rows.map((r) => (
          <li key={r.who} className={r.ours ? 'ours' : ''}>
            <span className="h-bar-who">{r.who}</span>
            <span className="h-bar"><i style={{ width: `${Math.max(r.s / max, 0.03) * 100}%` }} /></span>
            <span className="h-bar-v num">{r.s} s</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SpeedCompare({ title, others, othersSub, backx, backxSub }: { title: string; others: Row[]; othersSub: string; backx: Row; backxSub: string }) {
  const ref = useRef<HTMLElement>(null);
  const touched = useRef(false);
  const [p, setP] = useState(0);              // 0 = Others, 1 = BackX
  const [anim, setAnim] = useState(false);
  const max = Math.max(...others.map((r) => r.s));
  const lo = Math.min(...others.map((r) => r.s));

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setP(1); return; }
    let t = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      t = window.setTimeout(() => { if (!touched.current) { setAnim(true); setP(1); } }, 900);
    }, { threshold: 0.6 });
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);

  return (
    <article ref={ref} className={'h-card sc' + (anim ? ' anim' : '')} style={{ ['--p' as string]: p.toFixed(4) }}>
      <Layer title={title} tag="Others" ours={false} big={`${lo}–${max} s`} sub={othersSub} rows={others} max={max} />
      <Layer title={title} tag="BackX" ours big={`${backx.s} s`} sub={backxSub} rows={[{ ...backx, ours: true }, ...others]} max={max} />
      <span className="sc-line" aria-hidden="true" />
      <span className="sc-knob" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6 3 12l6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <input className="sc-range" type="range" min={0} max={100} value={Math.round(p * 100)}
        aria-label={`${title}: drag to compare others with BackX`}
        aria-valuetext={p >= 0.5 ? `BackX, ${backx.s} seconds` : `Others, ${lo} to ${max} seconds`}
        onPointerDown={() => { touched.current = true; setAnim(false); }}
        onKeyDown={() => { touched.current = true; setAnim(true); }}
        onChange={(e) => setP(Number(e.target.value) / 100)} />
    </article>
  );
}
