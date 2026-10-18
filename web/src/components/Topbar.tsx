import { Logo } from './Logo';
import { Dropdown } from './Dropdown';
import { MarketSearch } from './MarketSearch';
import { BalanceButton } from './BalanceButton';
import { Avatar } from './Avatar';
import { useAuth } from '../lib/auth';
import { go, href, type Route } from '../lib/router';
import type { Theme, PriceColors } from '../lib/theme';
import type { Market } from '../lib/markets';
import type { Balances } from '../lib/useBalances';

interface Props {
  route: Route;
  theme: Theme;
  onTheme: (t: Theme) => void;
  priceColors: PriceColors;
  onPriceColors: (p: PriceColors) => void;
  onSelectMarket: (m: Market) => void;
  balances: { data: Balances | null; error: boolean };
}

const swatch = (up: string, down: string) => (
  <span className="swatch" aria-hidden="true"><i style={{ background: up }} /><i style={{ background: down }} /></span>
);
const PRICE_OPTIONS: { value: PriceColors; label: string; icon: JSX.Element }[] = [
  { value: 'green-up', label: 'Green up', icon: swatch('var(--up)', 'var(--down)') },
  { value: 'red-up', label: 'Red up', icon: swatch('var(--down)', 'var(--up)') },
  { value: 'blue-orange', label: 'Blue · Orange', icon: swatch('var(--info)', 'var(--warning)') },
  { value: 'mono', label: 'Monochrome', icon: swatch('var(--ink)', 'var(--ink-3)') },
  { value: 'teal-pink', label: 'Teal · Pink', icon: swatch('#2DD4BF', '#F472B6') },
  { value: 'yellow-blue', label: 'Yellow · Blue', icon: swatch('#FFD100', '#4D8BFF') },
  { value: 'neon', label: 'Neon', icon: swatch('#A3E635', '#FB7185') },
  { value: 'gold-violet', label: 'Gold · Violet', icon: swatch('#E3B341', '#A78BFA') },
];

export function Topbar({ route, theme, onTheme, priceColors, onPriceColors, onSelectMarket, balances }: Props) {
  const { me, signIn, canSignIn } = useAuth();
  return (
    <header className="topbar">
      <Logo />
      <MarketSearch onSelect={onSelectMarket} />
      <nav className="nav" aria-label="Main">
        <a href={href('trade')} onClick={go('trade')} className={route === 'trade' ? 'active' : ''} aria-current={route === 'trade' ? 'page' : undefined}>Trade</a>
        <a href={href('issue')} onClick={go('issue')} className={route === 'issue' ? 'active' : ''} aria-current={route === 'issue' ? 'page' : undefined}>Issue Reserve</a>
        <a href={href('swap')} onClick={go('swap')} className={route === 'swap' ? 'active' : ''} aria-current={route === 'swap' ? 'page' : undefined}>Swap</a>
      </nav>
      {/* Theme + colours: own group so the phone header can move it next to the nav. */}
      <div className="topbar-prefs">
        <button className="icon-btn" onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
          )}
        </button>
        <Dropdown label="Price colors" value={priceColors} options={PRICE_OPTIONS} onChange={onPriceColors} compact iconOnly />
      </div>
      <div className="topbar-right">
        {me ? (
          <>
            <BalanceButton data={balances.data} error={balances.error} />
            <a className="btn btn-wallet" href={href('wallet')} onClick={go('wallet')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h13v4" /><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z" /><circle cx="16" cy="14.5" r="1.3" fill="currentColor" /></svg>
              <span>Wallet</span>
            </a>
            <a className="pfp-btn" href={href('profile')} onClick={go('profile')} aria-label="Profile and settings">
              <Avatar seed={me.avatarSeed} src={me.avatarUrl} size={32} />
              {me.isAdmin && <span className="pfp-badge" title="Admin">A</span>}
            </a>
          </>
        ) : (
          <button className="btn btn-primary" onClick={signIn} disabled={!canSignIn}>Sign in</button>
        )}
      </div>
    </header>
  );
}
