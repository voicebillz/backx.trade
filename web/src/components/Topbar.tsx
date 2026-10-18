import { Logo } from './Logo';
import { TopbarAccount } from './Account';
import type { Theme, PriceColors } from '../lib/theme';

interface Props {
  view: 'trade' | 'issue' | 'portfolio';
  onView: (v: 'trade' | 'issue' | 'portfolio') => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
  priceColors: PriceColors;
  onPriceColors: (p: PriceColors) => void;
  onSearch: () => void;
}

export function Topbar({ view, onView, theme, onTheme, priceColors, onPriceColors, onSearch }: Props) {
  return (
    <header className="topbar">
      <Logo />
      <button className="search-btn" onClick={onSearch} aria-label="Search markets">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span>Search markets</span>
        <kbd>⌘K</kbd>
      </button>
      <nav className="nav" aria-label="Main">
        {(['trade', 'issue', 'portfolio'] as const).map((v) => (
          <button key={v} className={view === v ? 'active' : ''} aria-current={view === v ? 'page' : undefined} onClick={() => onView(v)}>
            {v === 'trade' ? 'Trade' : v === 'issue' ? 'Issue' : 'Portfolio'}
          </button>
        ))}
      </nav>
      <div className="topbar-right">
        <label className="sr-only" htmlFor="price-colors">Price colors</label>
        <select id="price-colors" className="price-select" value={priceColors} onChange={(e) => onPriceColors(e.target.value as PriceColors)} title="Price colors">
          <option value="green-up">Green up</option>
          <option value="red-up">Red up</option>
          <option value="blue-orange">Blue · Orange</option>
          <option value="mono">Monochrome</option>
        </select>
        <button
          className="icon-btn"
          onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
          )}
        </button>
        <TopbarAccount />
      </div>
    </header>
  );
}
