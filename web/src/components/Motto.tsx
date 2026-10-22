import { useEffect, useState } from 'react';

/** Our motto (owner 2026-10-22): "Future Trading for Agents", then "Agents" flips to "Capital" and stays. */
export function Motto({ className = '' }: { className?: string }) {
  const [flipped, setFlipped] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (flipped) return;
    const id = setTimeout(() => setFlipped(true), 1400);
    return () => clearTimeout(id);
  }, [flipped]);
  return (
    <p className={'motto ' + className} aria-label="Future Trading for Capital">
      <span aria-hidden="true">Future Trading for </span>
      <span className={'motto-flip' + (flipped ? ' is-flipped' : '')} aria-hidden="true">
        <span className="motto-a">Agents</span>
        <span className="motto-c">Capital</span>
      </span>
    </p>
  );
}
