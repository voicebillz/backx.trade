import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
export type PriceColors = 'green-up' | 'red-up' | 'blue-orange' | 'mono';

const THEME_KEY = 'backx.theme';
const PRICE_KEY = 'backx.price';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* private mode: keep in memory only */ }
}

/** Saved choice wins. Without one, follow the browser live (light only when it asks for light). */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) || 'dark',
  );

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      const saved = read(THEME_KEY);
      if (saved === 'light' || saved === 'dark') return;
      const t: Theme = mq.matches ? 'light' : 'dark';
      document.documentElement.dataset.theme = t;
      setThemeState(t);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    write(THEME_KEY, t);
    document.documentElement.dataset.theme = t;
    setThemeState(t);
  }, []);

  return { theme, setTheme };
}

export function usePriceColors() {
  const [mode, setMode] = useState<PriceColors>(
    () => (document.documentElement.dataset.price as PriceColors) || 'green-up',
  );
  const set = useCallback((m: PriceColors) => {
    write(PRICE_KEY, m);
    if (m === 'green-up') delete document.documentElement.dataset.price;
    else document.documentElement.dataset.price = m;
    setMode(m);
  }, []);
  return { priceColors: mode, setPriceColors: set };
}
