import { useEffect, useRef, useState } from 'react';

// Front-page speed cards (owner 2026-10-22), styled like an image before/after slider: Others on the left, BackX
// on the right, a dashed divider with a round knob. The divider rests in the middle and only moves left, so the
// BackX side is never covered. Dragging left uncovers the BackX timing bars, which fill in green as they appear.
// When the card comes into view the divider sweeps left once by itself. A native range input covers the card, so
// touch, mouse and keyboard all work. Reduced motion: no sweep, bars shown full.

export interface Row { who: string; s: number }
/** A BackX step; `from` set = shown as a stretch of one timeline (liquidation phases add up to the total). */
export interface Step { label: string; s: number; from?: number }

const REST = 0.5;

export function SpeedCompare({ title, others, backx, steps }: { title: string; others: Row[]; backx: number; steps: Step[] }) {
  const ref = useRef<HTMLElement>(null);
  const touched = useRef(false);
  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [x, setX] = useState(still ? 0 : REST);        // divider: left of it Others, right of it BackX
  const [anim, setAnim] = useState(false);
  const max = Math.max(...others.map((r) => r.s));
  const lo = Math.min(...others.map((r) => r.s));
  const scale = Math.max(backx, ...steps.map((st) => (st.from ?? 0) + st.s));
  const r = Math.min(Math.max((REST - x) / (REST - 0.06), 0), 1);   // how far the BackX side is uncovered, 0..1

  useEffect(() => {
    if (still) return;
    let t = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      t = window.setTimeout(() => { if (!touched.current) { setAnim(true); setX(0); } }, 900);
    }, { threshold: 0.6 });
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [still]);

  return (
    <article ref={ref} className={'h-card sc' + (anim ? ' anim' : '')} style={{ ['--x' as string]: x.toFixed(4), ['--r' as string]: r.toFixed(4) }}>
      <div className="sc-layer sc-others">
        <div className="sc-half">
          <h3>{title} <span className="sc-tag">Others</span></h3>
          <p className="sc-big">{lo}–{max} s</p>
          <ul className="sc-bars">
            {others.map((o) => (
              <li key={o.who}>
                <span className="sc-row"><span>{o.who}</span><b className="num">{o.s} s</b></span>
                <span className="h-bar"><i style={{ width: `${(o.s / max) * 100}%` }} /></span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="sc-layer sc-backx">
        <ul className="sc-steps">
          {steps.map((st, i) => (
            <li key={st.label} style={{ ['--i' as string]: i }}>
              <span className="sc-row"><span>{st.label}</span><b className="num">{st.s} s</b></span>
              <span className="sc-track">
                <i style={{ left: `${((st.from ?? 0) / scale) * 100}%`, width: `${(st.s / scale) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
        <div className="sc-half">
          <h3>{title} <span className="sc-tag">BackX</span></h3>
          <p className="sc-big">{backx} s</p>
        </div>
      </div>
      <span className="sc-line" aria-hidden="true" />
      <span className="sc-knob" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6 3 12l6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <input className="sc-range" type="range" min={0} max={REST * 100} value={Math.round(x * 100)}
        aria-label={`${title}: drag left to see BackX step by step`}
        aria-valuetext={`BackX ${backx} seconds: ${steps.map((st) => `${st.label} ${st.s} s`).join(', ')}. Others ${lo} to ${max} seconds`}
        onPointerDown={() => { touched.current = true; setAnim(false); }}
        onKeyDown={() => { touched.current = true; setAnim(true); }}
        onChange={(e) => setX(Number(e.target.value) / 100)} />
    </article>
  );
}
