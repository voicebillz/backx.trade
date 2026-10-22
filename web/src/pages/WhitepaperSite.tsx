import { useEffect } from 'react';
import { Logo } from '../components/Logo';
import { WhitepaperPage } from './WhitepaperPage';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';

/** Shown to everyone but admins until launch (owner 2026-10-22): greyed-out placeholder, no whitepaper text.
 *  Visual gate only: the text still ships in this chunk, so keep nothing secret in it. */
function Locked({ checking }: { checking: boolean }) {
  return (
    <main id="main" className="wp-locked">
      <div className="wp-locked-ghost" aria-hidden="true">
        <i className="h" /><i /><i style={{ width: '80%' }} /><i className="box" /><i className="h" /><i /><i style={{ width: '70%' }} /><i /><i className="box" />
      </div>
      {!checking && (
        <div className="wp-locked-card">
          <span className="soon-badge">Coming soon</span>
          <h1>Whitepaper</h1>
          <p>The BackX whitepaper is being finalised and opens here soon.</p>
        </div>
      )}
    </main>
  );
}

/** The whitepaper on the public site (backx.trade/whitepaper), with the front page header. */
export default function WhitepaperSite() {
  useEffect(() => { document.title = 'Whitepaper · BackX'; }, []);
  const { theme, setTheme } = useTheme();
  const { status, me } = useAuth();
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
      {me?.isAdmin ? <WhitepaperPage /> : <Locked checking={status === 'checking' || status === 'connecting'} />}
    </div>
  );
}
