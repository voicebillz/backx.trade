// Pieces shown on the public front page (they lived in the old coming-soon overlay).
import { useEffect, useRef, useState } from 'react';
import { MultRoller } from './MultRoller';
import { quote } from '../lib/hedge';
import { APP_URL } from '../lib/host';

const MAX = 20; // Major coins cap at 20× (server HEDGE_CAP, sim5)

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The ticket's leverage dial, rolling up and down on its own; drag, scroll, tap or use the keys to take over. */
export function MultiplierBar() {
  const [m, setM] = useState(5);
  const target = useRef(5);
  const userUntil = useRef(0);

  useEffect(() => {
    if (reduced()) return;
    // One whole step every ~110 ms toward a new random target, so the dial visibly rolls up and down.
    const id = setInterval(() => {
      if (performance.now() < userUntil.current) return;
      setM((cur) => {
        if (cur === target.current) {
          const r = Math.random();
          target.current = Math.round(r < 0.55 ? 2 + Math.random() * 8 : r < 0.85 ? 10 + Math.random() * 10 : 1);
          return cur;
        }
        return cur + Math.sign(target.current - cur);
      });
    }, 110);
    return () => clearInterval(id);
  }, []);

  const pick = (v: number) => { userUntil.current = performance.now() + 4000; target.current = v; setM(v); };
  // Major-coin example (deep pool, 1.5 % execution margin), same math as the ticket. 1× borrows nothing: no liquidation.
  const liq = m > 1 ? quote(100, m, 1, 0.0005, 10_000_000, 0.015).liqMove * 100 : null;

  return (
    <div className="mbar">
      <MultRoller value={m} max={MAX} onChange={pick} label="Leverage" />
      <p className="mbar-liq">{liq == null ? <>No liquidation <b className="ok-text">at 1×</b></> : <>Liquidation at <b>−{liq.toFixed(1)}%</b></>}</p>
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
      <a className="gazz-btn" href={`${APP_URL}/profile/stake`} aria-label="Stake $GAZZ and Gazz Tanks on BackX"><img src="/gazz-logo.svg" alt="" width="20" height="20" />Stake $GAZZ</a>
      <button className="gazz-ca" onClick={copy} aria-label={`Copy $GAZZ contract address ${GAZZ_CA}`}>
        {/* Tap the address to copy it; the label confirms. */}
        <span className="gazz-ca-label" aria-live="polite">{copied ? 'Copied ✓' : '$GAZZ CA:'}</span> <span className="gazz-ca-addr">{GAZZ_CA}</span>
      </button>
    </div>
  );
}
