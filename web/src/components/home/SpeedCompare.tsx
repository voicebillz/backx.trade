import { useEffect, useRef, useState } from 'react';

// Front-page speed cards (owner 2026-10-22): "Before" (other ways to sell) flips once to "After" (BackX) when the
// card comes into view; drag or use the arrow keys to wipe between them. A native range input covers the card,
// so touch, mouse and keyboard all work. Reduced motion: no auto flip, the After side is shown.

export interface Row { who: string; s: number }

export function SpeedCompare({ title, before, after, afterSub }: { title: string; before: Row[]; after: { who: string; s: number }; afterSub: string }) {
  const ref = useRef<HTMLElement>(null);
  const touched = useRef(false);
  const [p, setP] = useState(0);              // 0 = Before, 1 = After
  const [anim, setAnim] = useState(false);
  const max = Math.max(...before.map((r) => r.s));

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

  const pct = p.toFixed(4);
  return (
    <article ref={ref} className={'h-card sc' + (anim ? ' anim' : '')} style={{ ['--p' as string]: pct }}>
      <div className="sc-top">
        <h3>{title}</h3>
        <span className="sc-tabs" aria-hidden="true"><b className={p < 0.5 ? 'on' : ''}>Before</b><b className={p >= 0.5 ? 'on' : ''}>After</b></span>
      </div>
      <div className="sc-stage">
        <div className="sc-pane sc-before">
          <ul className="h-bars">
            {before.map((r) => (
              <li key={r.who}>
                <span className="h-bar-who">{r.who}</span>
                <span className="h-bar"><i style={{ width: `${(r.s / max) * 100}%` }} /></span>
                <span className="h-bar-v num">{r.s} s</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="sc-pane sc-after" aria-hidden={p < 0.5}>
          <p className="sc-big">{after.s} s</p>
          <p className="sc-who">{after.who}</p>
          <p className="sc-sub">{afterSub}</p>
        </div>
        <span className="sc-line" aria-hidden="true"><i><svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 6 3 12l6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></i></span>
        <input className="sc-range" type="range" min={0} max={100} value={Math.round(p * 100)}
          aria-label={`${title}: drag to compare before and after`}
          aria-valuetext={p >= 0.5 ? `After: ${after.who}, ${after.s} seconds` : 'Before: other ways to trade'}
          onPointerDown={() => { touched.current = true; setAnim(false); }}
          onKeyDown={() => { touched.current = true; setAnim(true); }}
          onChange={(e) => setP(Number(e.target.value) / 100)} />
      </div>
    </article>
  );
}
