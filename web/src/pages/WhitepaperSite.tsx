import { useEffect } from 'react';
import { Logo } from '../components/Logo';
import { WhitepaperPage } from './WhitepaperPage';

/** The whitepaper on the public site (backx.trade/whitepaper), with the front page header. */
export default function WhitepaperSite() {
  useEffect(() => { document.title = 'Whitepaper · BackX'; }, []);
  return (
    <div className="home home-doc">
      <a className="skip" href="#main">Skip to content</a>
      <header className="h-header">
        <span className="h-logo"><Logo /></span>
        <nav className="h-nav" aria-label="Main"><a href="/">Home</a><a href="/whitepaper" aria-current="page">Whitepaper</a></nav>
      </header>
      <WhitepaperPage />
    </div>
  );
}
