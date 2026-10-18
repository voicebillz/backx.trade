import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

interface Props {
  value: number;
  min: number;
  max: number;
  onChange: (m: number) => void;
  label?: string;
}

/**
 * Multiplication slider: rail fills from yellow toward red as it nears the coin's max,
 * glides between values, snaps to whole steps. Drag or use the keyboard.
 */
export function MultiplierSlider({ value, min, max, onChange, label = 'Multiplication' }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const t = max > min ? (value - min) / (max - min) : 0;

  const fromPointer = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    const k = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    onChange(Math.round(min + k * (max - min)));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
    let next = value;
    if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    else if (step) next = Math.min(Math.max(value + step, min), max);
    else return;
    e.preventDefault();
    onChange(next);
  };

  return (
    <div className="msl">
      <div
        className={'msl-track' + (dragging.current ? ' dragging' : '')} ref={track}
        role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${value} times`}
        onKeyDown={onKey}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        style={{ ['--t' as string]: String(t) }}
      >
        <div className="msl-rail"><div className="msl-fill" /></div>
        <div className="msl-thumb"><span className="msl-bubble num">{value}×</span></div>
      </div>
    </div>
  );
}
