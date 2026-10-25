import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';

interface Props {
  value: number;
  max: number;
  onChange: (m: number) => void;
  label?: string;
}

const STEP = 30; // px between two whole values on the dial

/**
 * Multiplication dial (owner 2026-10-25): always on, starts at 1×. A ruler of values slides under a fixed centre
 * mark: drag sideways, scroll, tap a value or use the arrow keys. Snaps to whole values.
 */
export function MultRoller({ value, max, onChange, label = 'Multiplication' }: Props) {
  const drag = useRef<{ x: number; v: number } | null>(null);
  const [live, setLive] = useState<number | null>(null); // fractional position while dragging
  const pos = live ?? value;
  const clamp = (v: number) => Math.min(Math.max(v, 1), max);
  useEffect(() => { if (value > max) onChange(max); }, [max]); // eslint-disable-line react-hooks/exhaustive-deps

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, v: value };
  };
  const move = (e: PointerEvent) => {
    if (!drag.current) return;
    const v = clamp(drag.current.v - (e.clientX - drag.current.x) / STEP);
    setLive(v);
    if (Math.round(v) !== value) onChange(Math.round(v));
  };
  const up = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setLive(null);
    // A tap (no real drag) on a value picks it.
    if (d && Math.abs(e.clientX - d.x) < 4) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onChange(Math.round(clamp(value + (e.clientX - (r.left + r.width / 2)) / STEP)));
    }
  };
  const wheel = (e: WheelEvent) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 4) return;
    onChange(clamp(value + (d > 0 ? 1 : -1)));
  };
  const key = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
    const next = e.key === 'Home' ? 1 : e.key === 'End' ? max : step ? clamp(value + step) : null;
    if (next == null) return;
    e.preventDefault();
    onChange(next);
  };

  const marks = Array.from({ length: max }, (_, i) => i + 1);
  const labelled = (v: number) => max <= 12 || v === 1 || v === max || v % 5 === 0;
  const heat = max > 1 ? (value - 1) / (max - 1) : 0;

  return (
    <div className="mroll">
      <div className="mroll-head">
        <span className="label">{label}</span>
        <span className="mroll-max num">Max {max}×</span>
      </div>
      <div className={'mroll-dial' + (live != null ? ' dragging' : '')} role="slider" tabIndex={0} aria-label={label}
        aria-valuemin={1} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${value} times`}
        style={{ ['--heat' as string]: String(heat) }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setLive(null); }}
        onWheel={wheel} onKeyDown={key}>
        <div className="mroll-track" style={{ transform: `translateX(${-(pos - 1) * STEP}px)` }}>
          {marks.map((v) => (
            <span key={v} className={'mroll-tick' + (labelled(v) ? ' major' : '') + (v === value ? ' on' : '')} style={{ left: (v - 1) * STEP }}>
              <i />{labelled(v) && <b className="num">{v}</b>}
            </span>
          ))}
        </div>
        <span className="mroll-mark" aria-hidden="true" />
        <span className="mroll-value num" aria-hidden="true">{value}×</span>
      </div>
    </div>
  );
}
