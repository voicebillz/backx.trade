import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Mark } from './Logo';
import { quote } from '../lib/hedge';
import { OverlayAccount } from './Account';

const STEPS = [
  { n: '01', title: 'Hedge' },
  { n: '02', title: 'Issue' },
  { n: '03', title: 'Your wallet' },
];
const STEP_MS = 2600;
const MIN = 1, MAX = 20; // Major coins cap at 20× (server HEDGE_CAP, sim5)

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The three steps light up one after another, in a loop. */
function Steps() {
  const [active, setActive] = useState(0);
  const [still] = useState(reduced);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setActive((a) => (a + 1) % STEPS.length), STEP_MS);
    return () => clearInterval(id);
  }, [still]);
  return (
    <ol className="soon-steps">
      {STEPS.map((s, i) => {
        const state = still ? 'done' : i === active ? 'active' : i < active ? 'done' : '';
        return (
          <li key={s.n} className={state}>
            <span className="step-n">{s.n}</span>
            <span className="step-text"><b>{s.title}</b></span>
            {/* key restarts the fill each time the step becomes active */}
            <span className="step-bar" aria-hidden="true"><i key={state === 'active' ? active : 'x'} /></span>
          </li>
        );
      })}
    </ol>
  );
}

/** Multiplier bar: glides to random values on its own; drag or use arrow keys to take over. */
function MultiplierBar() {
  const [value, setValue] = useState(5);          // shown, smooth
  const target = useRef(5);
  const pos = useRef(5);
  const vel = useRef(0);
  const userUntil = useRef(0);
  const dragging = useRef(false);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const still = reduced();
    let raf = 0, last = performance.now(), nextPick = last + 900;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!dragging.current && now > userUntil.current && now > nextPick) {
        // Mostly everyday values, sometimes a run toward the top.
        const r = Math.random();
        target.current = Math.round(r < 0.6 ? 2 + Math.random() * 10 : r < 0.9 ? 10 + Math.random() * 12 : 22 + Math.random() * 8);
        nextPick = now + 1500 + Math.random() * 1200;
      }
      if (still) pos.current = target.current;
      else {
        // Critically damped spring: no overshoot, settles in ~400 ms.
        const k = 90, c = 2 * Math.sqrt(k);
        vel.current += (k * (target.current - pos.current) - c * vel.current) * dt;
        pos.current += vel.current * dt;
      }
      setValue(pos.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fromPointer = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    const t = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    target.current = Math.round(MIN + t * (MAX - MIN));
    userUntil.current = performance.now() + 4000;
  };
  const onKey = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
    if (e.key === 'Home') target.current = MIN;
    else if (e.key === 'End') target.current = MAX;
    else if (step) target.current = Math.min(Math.max(target.current + step, MIN), MAX);
    else return;
    e.preventDefault();
    userUntil.current = performance.now() + 4000;
  };

  const m = Math.round(Math.min(Math.max(value, MIN), MAX));
  const t = (Math.min(Math.max(value, MIN), MAX) - MIN) / (MAX - MIN);
  // Major-coin example (deep pool, 1 % execution margin), same math as the ticket. 1× borrows nothing: no liquidation.
  const liq = m > 1 ? quote(100, m, 1, 0.0005, 10_000_000, 0.01).liqMove * 100 : null;

  return (
    <div className="mbar">
      <div className="mbar-head">
        <span className="mbar-label">Multiplication</span>
        <span className="mbar-liq">{liq == null ? <>No liquidation <b className="ok-text">at 1×</b></> : <>Liquidation at <b>▼ −{liq.toFixed(1)}%</b></>}</span>
      </div>
      <div className="mbar-value"><span>{m}</span>×</div>
      <div
        className="mbar-track" ref={track}
        role="slider" tabIndex={0} aria-label="Multiplication" aria-valuemin={MIN} aria-valuemax={MAX} aria-valuenow={m} aria-valuetext={`${m} times`}
        onKeyDown={onKey}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        style={{ ['--t' as string]: String(t) }}
      >
        <div className="mbar-rail"><div className="mbar-fill" /></div>
        <div className="mbar-thumb" />
      </div>
    </div>
  );
}

/** Full-screen overlay shown to every visitor until launch. The app behind it is inert. */
export function ComingSoon() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="soon" role="dialog" aria-modal="true" aria-labelledby="soon-title" tabIndex={-1} ref={ref}>
      <div className="soon-card">
        <div className="soon-mark">
          <Mark size={64} />
          <span className="soon-x" aria-hidden="true">×</span>
          <a className="soon-partner" href="https://gazz.fun" target="_blank" rel="noopener" aria-label="gazz.fun (opens in a new tab)">
            <img src="/gazz-logo.svg" alt="" width="48" height="48" />
          </a>
        </div>
        <p className="soon-word">backx<span>.trade</span></p>
        <h1 id="soon-title">Coming soon</h1>
        <Steps />
        <MultiplierBar />
        <OverlayAccount />
        <p className="soon-legal"><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></p>
      </div>
    </div>
  );
}
