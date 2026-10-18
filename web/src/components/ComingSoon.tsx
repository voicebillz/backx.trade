import { useEffect, useRef } from 'react';
import { Mark } from './Logo';

/** Full-screen overlay shown to every visitor until launch. The app behind it is inert. */
export function ComingSoon() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="soon" role="dialog" aria-modal="true" aria-labelledby="soon-title" tabIndex={-1} ref={ref}>
      <div className="soon-card">
        <div className="soon-mark"><Mark size={64} /></div>
        <p className="soon-word">backx<span>.trade</span></p>
        <h1 id="soon-title">Coming soon</h1>
        <p className="soon-sub">Hedge &amp; Issuer Trading. Real tokens behind every position.</p>
        <ul className="soon-points">
          <li><b>Hedge</b> with multiplication</li>
          <li><b>Issue</b> and earn on every hedge</li>
          <li><b>Your wallet</b>, your keys</li>
        </ul>
      </div>
    </div>
  );
}
