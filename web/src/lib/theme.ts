import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';
export type PriceColors = 'green-up' | 'red-up' | 'blue-orange' | 'mono';

const THEME_KEY = 'backx.theme';
const PRICE_KEY = 'backx.price';

function write(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* private mode: keep in memory only */ }
}

/** Dark is the standard; the user's saved choice wins (set before paint by public/theme-boot.js). */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) || 'dark',
  );

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
