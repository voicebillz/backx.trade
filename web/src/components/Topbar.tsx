import { SITE_URL } from '../lib/host';
import { LayoutButton } from './LayoutPanel';
import { Logo } from './Logo';
import { MarketSearch } from './MarketSearch';
import { BalanceButton } from './BalanceButton';
import { Avatar } from './Avatar';
import { Motto } from './Motto';
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
export const PRICE_OPTIONS: { value: PriceColors; label: string; icon: JSX.Element }[] = [
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
        <a href={SITE_URL} className="nav-home" aria-label="Home" title="Home">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h5v-6h4v6h5V9.5" /></svg>
        </a>
        <a href={href('trade')} onClick={go('trade')} className={route === 'trade' ? 'active' : ''} aria-current={route === 'trade' ? 'page' : undefined}>Trade</a>
        <a href={href('issue')} onClick={go('issue')} className={route === 'issue' ? 'active' : ''} aria-current={route === 'issue' ? 'page' : undefined}>Issue</a>
        <a href={href('stake')} onClick={go('stake')} className={route === 'stake' ? 'active' : ''} aria-current={route === 'stake' ? 'page' : undefined}>Stake</a>
        <a href={href('swap')} onClick={go('swap')} className={route === 'swap' ? 'active' : ''} aria-current={route === 'swap' ? 'page' : undefined}>Swap</a>
        <a href={href('whitepaper')} onClick={go('whitepaper')} className={route === 'whitepaper' ? 'active' : ''} aria-current={route === 'whitepaper' ? 'page' : undefined}>Whitepaper</a>
      </nav>
      <Motto className="motto-top" />
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
        <LayoutButton theme={theme} onTheme={onTheme} priceColors={priceColors} onPriceColors={onPriceColors} priceOptions={PRICE_OPTIONS} />
      </div>
    </header>
  );
}
