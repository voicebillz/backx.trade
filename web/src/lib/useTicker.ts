import { useEffect, useRef, useState } from 'react';

/**
 * Demo price feed: nudges the price every few seconds and reports the last
 * direction for the 400 ms flash. Replace with the price service later.
 */
export function useTicker(base: number, volatility: number) {
  const [price, setPrice] = useState(base);
  const [dir, setDir] = useState<'up' | 'down' | null>(null);
  const tick = useRef(0);

  useEffect(() => {
    setPrice(base);
    setDir(null);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = setInterval(() => {
      setPrice((p) => {
        const next = p * (1 + (Math.random() - 0.5) * volatility);
        setDir(next >= p ? 'up' : 'down');
        tick.current++;
        return next;
      });
    }, reduce ? 6000 : 2500);
    return () => clearInterval(id);
  }, [base, volatility]);

  return { price, dir, tick: tick.current };
}
