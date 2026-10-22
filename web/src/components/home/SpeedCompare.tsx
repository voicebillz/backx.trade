import { useEffect, useRef, useState } from 'react';

// Front-page speed cards (owner 2026-10-22), styled like an image before/after slider: Others on the left, BackX
// on the right, a dashed divider with a round knob in the middle. The card starts as Others, then the divider
// sweeps to the middle when it comes into view; drag anywhere on the card (or use the arrow keys) to compare.
// A native range input covers the card, so touch, mouse and keyboard all work. Reduced motion: rests in the middle.

export interface Row { who: string; s: number }

export function SpeedCompare({ title, others, othersSub, backx, backxSub }: { title: string; others: Row[]; othersSub: string; backx: Row; backxSub: string }) {
  const ref = useRef<HTMLElement>(null);
  const touched = useRef(false);
  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [x, setX] = useState(still ? 0.5 : 1);        // divider: left of it Others, right of it BackX
  const [anim, setAnim] = useState(false);
  const max = Math.max(...others.map((r) => r.s));
  const lo = Math.min(...others.map((r) => r.s));

  useEffect(() => {
    if (still) return;
    let t = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      t = window.setTimeout(() => { if (!touched.current) { setAnim(true); setX(0.5); } }, 700);
    }, { threshold: 0.6 });
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [still]);

  const bar = (r: Row, ours = false) => (
    <li key={r.who} className={ours ? 'ours' : ''}>
      <span className="sc-row"><span>{r.who}</span><b className="num">{r.s} s</b></span>
      <span className="h-bar"><i style={{ width: `${Math.max(r.s / max, 0.03) * 100}%` }} /></span>
    </li>
  );

  return (
    <article ref={ref} className={'h-card sc' + (anim ? ' anim' : '')} style={{ ['--x' as string]: x.toFixed(4) }}>
      <div className="sc-layer sc-others">
        <div className="sc-half">
          <h3>{title}</h3>
          <p className="sc-big">{lo}–{max} s</p>
          <p className="sc-sub">{othersSub}</p>
          <ul className="sc-bars">{others.map((r) => bar(r))}</ul>
        </div>
        <span className="sc-label">Others</span>
      </div>
      <div className="sc-layer sc-backx">
        <div className="sc-half">
          <h3>{title}</h3>
          <p className="sc-big">{backx.s} s</p>
          <p className="sc-sub">{backxSub}</p>
          <ul className="sc-bars">{bar(backx, true)}</ul>
        </div>
        <span className="sc-label">BackX</span>
      </div>
      <span className="sc-line" aria-hidden="true" />
      <span className="sc-knob" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6 3 12l6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <input className="sc-range" type="range" min={0} max={100} value={Math.round(x * 100)}
        aria-label={`${title}: drag to compare others with BackX`}
        aria-valuetext={`Others ${lo} to ${max} seconds, BackX ${backx.s} seconds`}
        onPointerDown={() => { touched.current = true; setAnim(false); }}
        onKeyDown={() => { touched.current = true; setAnim(true); }}
        onChange={(e) => setX(Number(e.target.value) / 100)} />
    </article>
  );
}
