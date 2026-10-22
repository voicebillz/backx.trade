import { useEffect, useState } from 'react';

const WORDS = ['Agents', 'Capital'] as const;
const EVERY_MS = 2600;

/** Our motto (owner 2026-10-22): "Future Trading for Agents ⇄ Capital", flipping on a steady loop. */
export function Motto({ className = '' }: { className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setI(1); return; }
    const id = setInterval(() => setI((n) => (n + 1) % WORDS.length), EVERY_MS);
    return () => clearInterval(id);
  }, []);
  return (
    <p className={'motto ' + className} aria-label="Future Trading for Agents and Capital">
      <span aria-hidden="true">Future Trading for </span>
      <span className="motto-flip" aria-hidden="true">
        {WORDS.map((w, k) => (
          <span key={w} className={k === i ? 'is-on' : k === (i + WORDS.length - 1) % WORDS.length ? 'is-out' : ''}>{w}</span>
        ))}
      </span>
    </p>
  );
}
