import { useEffect } from 'react';
import { Logo } from '../components/Logo';
import { WhitepaperPage } from './WhitepaperPage';
import { useTheme } from '../lib/theme';

/** The whitepaper on the public site (backx.trade/whitepaper), with the front page header. */
export default function WhitepaperSite() {
  useEffect(() => { document.title = 'Whitepaper · BackX'; }, []);
  const { theme, setTheme } = useTheme();
  return (
    <div className="home home-doc">
      <a className="skip" href="#main">Skip to content</a>
      <header className="h-header">
        <span className="h-logo"><Logo /></span>
        <nav className="h-nav" aria-label="Main"><a href="/">Home</a><a href="/whitepaper" aria-current="page">Whitepaper</a></nav>
        <div className="h-header-cta">
          <button className="h-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>{theme === 'dark' ? '☀' : '☾'}</button>
          <a className="h-btn h-btn-gold" href="https://app.backx.trade">Launch App</a>
        </div>
      </header>
      <WhitepaperPage />
    </div>
  );
}
