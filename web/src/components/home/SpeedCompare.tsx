import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

// Front-page speed cards (owner 2026-10-22), styled like an image before/after slider: Others on the left, BackX
// on the right, a dashed divider with a round knob. The divider rests in the middle and only moves left, so the
// BackX side is never covered. Dragging left uncovers the BackX timing bars, which fill in green as they appear.
// Each time the card comes into view the divider sweeps left by itself after a pause.
// Pointer drag is relative and geared up, see below (pointer capture, touch-action pan-y keeps vertical page
// scroll); the knob is a keyboard slider (arrows, Home/End). Reduced motion: no sweep, bars shown full.

export interface Row { who: string; s: number }
/** A BackX step; `from` set = shown as a stretch of one timeline (liquidation phases add up to the total). */
export interface Step { label: string; s: number; from?: number }

const REST = 0.5;
const SWIPE = 140;   // px of finger travel for the full range

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
    // Every time the card comes into view: rest in the middle, then fold over after a pause. Leaving the view
    // resets it (also after a drag), so scrolling past and back plays it again without a refresh.
    let t = 0;
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(t);
      if (e.intersectionRatio >= 0.6) {
        t = window.setTimeout(() => { if (!touched.current) { setAnim(true); setX(0); } }, 2400);
      } else if (!e.isIntersecting) {
        touched.current = false; setAnim(false); setX(REST);   // fully out of view: reset, out of sight
      }
    }, { threshold: [0, 0.6] });
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [still]);

  // Relative drag: a short swipe covers the whole range (SWIPE px or a third of the card, whichever is
  // smaller), so a thumb never has to reach the edge of the screen. A tap without movement flips between the two.
  const drag = useRef<{ x0: number; v0: number; w: number; moved: boolean } | null>(null);
  const down = (e: PointerEvent<HTMLElement>) => {
    touched.current = true; setAnim(false);
    e.currentTarget.setPointerCapture(e.pointerId);
    const w = Math.min(SWIPE, e.currentTarget.getBoundingClientRect().width / 3);
    drag.current = { x0: e.clientX, v0: x, w, moved: false };
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x0;
    if (Math.abs(dx) > 4) d.moved = true;
    if (d.moved) setX(Math.min(Math.max(d.v0 + (dx / d.w) * REST, 0), REST));
  };
  const up = () => {
    const d = drag.current; drag.current = null;
    if (d && !d.moved) { setAnim(true); setX(d.v0 > REST / 2 ? 0 : REST); }
  };
  const key = (e: KeyboardEvent<HTMLElement>) => {
    const step = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05 }[e.key];
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? REST : step !== undefined ? x + step : null;
    if (to === null) return;
    e.preventDefault(); touched.current = true; setAnim(true);
    setX(Math.min(Math.max(to, 0), REST));
  };

  return (
    <article ref={ref} className={'h-card sc' + (anim ? ' anim' : '')}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }} style={{ ['--x' as string]: x.toFixed(4), ['--r' as string]: r.toFixed(4) }}>
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
        <h3>{title} <span className="sc-tag">BackX</span></h3>
        <p className="sc-big">{backx} s</p>
      </div>
      <span className="sc-line" aria-hidden="true" />
      <span className="sc-knob" role="slider" tabIndex={0} onKeyDown={key}
        aria-label={`${title}: move left to see BackX step by step`}
        aria-valuemin={0} aria-valuemax={50} aria-valuenow={Math.round((REST - x) * 100)}
        aria-valuetext={`BackX ${backx} seconds: ${steps.map((st) => `${st.label} ${st.s} s`).join(', ')}. Others ${lo} to ${max} seconds`}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6 3 12l6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </article>
  );
}
