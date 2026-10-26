// Pieces shown on the public front page (they lived in the old coming-soon overlay).
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { quote } from '../lib/hedge';
import { APP_URL } from '../lib/host';

const MIN = 1, MAX = 20; // Major coins cap at 20× (server HEDGE_CAP, sim5)

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Multiplier bar: glides to random values on its own; drag or use arrow keys to take over. */
export function MultiplierBar() {
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
  // Major-coin example (deep pool, 1.5 % execution margin), same math as the ticket. 1× borrows nothing: no liquidation.
  const liq = m > 1 ? quote(100, m, 1, 0.0005, 10_000_000, 0.015).liqMove * 100 : null;

  return (
    <div className="mbar">
      <div className="mbar-head">
        <span className="mbar-label">Multiplication</span>
        <span className="mbar-liq">{liq == null ? <>No liquidation <b className="ok-text">at 1×</b></> : <>Liquidation at <b>−{liq.toFixed(1)}%</b></>}</span>
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

// $GAZZ on Robinhood Chain (Uniswap v4 pool GAZZ/ETH). Buying happens on Uniswap, never through backx.
const GAZZ_CA = '0x08a5d78a4bc7754e8aff87b4509e007baeb685f3';
const GAZZ_BUY = `https://app.uniswap.org/swap?chain=robinhood&inputCurrency=NATIVE&outputCurrency=${GAZZ_CA}`;

export function BuyGazz() {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(GAZZ_CA).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  return (
    <div className="gazz-buy">
      <a className="gazz-btn" href={GAZZ_BUY} target="_blank" rel="noopener noreferrer" aria-label="Buy $GAZZ on Uniswap (opens in a new tab)">
        <img src="/gazz-logo.svg" alt="" width="20" height="20" />Buy $GAZZ
      </a>
      <a className="gazz-btn" href={`${APP_URL}/stake`} aria-label="Stake $GAZZ and Gazz Tanks on BackX"><img src="/gazz-logo.svg" alt="" width="20" height="20" />Stake $GAZZ</a>
      <button className="gazz-ca" onClick={copy} aria-label={`Copy $GAZZ contract address ${GAZZ_CA}`}>
        {/* Tap the address to copy it; the label confirms. */}
        <span className="gazz-ca-label" aria-live="polite">{copied ? 'Copied ✓' : '$GAZZ CA:'}</span> <span className="gazz-ca-addr">{GAZZ_CA}</span>
      </button>
    </div>
  );
}
