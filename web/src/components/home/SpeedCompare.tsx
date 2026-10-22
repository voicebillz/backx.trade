import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

// Front-page speed cards (owner 2026-10-22), styled like an image before/after slider: Others on the left, BackX
// on the right, a dashed divider with a round knob. The divider rests in the middle and only moves left, so the
// BackX side is never covered. Dragging left uncovers the BackX timing bars, which fill in green as they appear.
// When the card comes into view the divider sweeps left once by itself.
// Pointer drag follows the finger or mouse exactly (pointer capture, touch-action pan-y keeps vertical page
// scroll); the knob is a keyboard slider (arrows, Home/End). Reduced motion: no sweep, bars shown full.

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
      t = window.setTimeout(() => { if (!touched.current) { setAnim(true); setX(0); } }, 2900);   // owner: a further 2 s before it folds over
    }, { threshold: 0.6 });
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [still]);

  const dragging = useRef(false);
  const at = (e: PointerEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setX(Math.min(Math.max((e.clientX - box.left) / box.width, 0), REST));
  };
  const down = (e: PointerEvent<HTMLElement>) => {
    touched.current = true; dragging.current = true; setAnim(false);
    e.currentTarget.setPointerCapture(e.pointerId);
    at(e);
  };
  const move = (e: PointerEvent<HTMLElement>) => { if (dragging.current) at(e); };
  const up = () => { dragging.current = false; };
  const key = (e: KeyboardEvent<HTMLElement>) => {
    const step = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05 }[e.key];
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? REST : step !== undefined ? x + step : null;
    if (to === null) return;
    e.preventDefault(); touched.current = true; setAnim(true);
    setX(Math.min(Math.max(to, 0), REST));
  };

  return (
    <article ref={ref} className={'h-card sc' + (anim ? ' anim' : '')}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ ['--x' as string]: x.toFixed(4), ['--r' as string]: r.toFixed(4) }}>
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
