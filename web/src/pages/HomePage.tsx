import { useEffect } from 'react';
import { Logo } from '../components/Logo';
import { Motto } from '../components/Motto';
import { CircuitHero } from '../components/home/CircuitHero';
import { ChainCarousel } from '../components/home/ChainCarousel';
import { SpeedCompare } from '../components/home/SpeedCompare';
import { WalletVisual, IssueVisual } from '../components/home/HowVisuals';
import { MultiplierBar, BuyGazz } from '../components/Showcase';
import { useParticipate } from '../lib/useParticipate';
import { useTheme } from '../lib/theme';
import { APP_URL } from '../lib/host';

// Public front page at backx.trade (owner 2026-10-22). The app itself lives at app.backx.trade (admins only for now).
// Speed figures are the modelled results of docs/backx/sim/flash.py, shown as such (see the Whitepaper).

const TRADE = [
  { who: 'Intent swap', s: 3 },
  { who: 'Bot', s: 9 },
  { who: 'Manual wallet swap', s: 20 },
];
const LIQ = [
  { who: 'Intent swap bot', s: 3 },
  { who: 'Bot', s: 9 },
  { who: 'Manual wallet swap', s: 20 },
];

function Participate({ big = false }: { big?: boolean }) {
  const { me, joined, joinedAt, busy, err, canSignIn, participate } = useParticipate();
  if (joined) return (
    <span className={'h-joined' + (big ? ' big' : '')} aria-live="polite">
      You're in{joinedAt ? ` · since ${new Date(joinedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : ''}
    </span>
  );
  return (
    <>
      <button className={'h-btn h-btn-gold' + (big ? ' big' : '')} onClick={participate} disabled={busy || (!me && !canSignIn)} aria-busy={busy}>
        {busy ? 'Joining…' : 'Participate'}
      </button>
      {err && <span className="h-err" role="alert">That did not go through. Try again.</span>}
    </>
  );
}

export function HomePage() {
  useEffect(() => {
    document.title = 'BackX · Future Trading for Agents & Capital';
    document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.setAttribute('content', 'index, follow, max-image-preview:large, max-snippet:-1');
  }, []);
  const { theme, setTheme } = useTheme();

  return (
    <div className="home">
      <a className="skip" href="#main">Skip to content</a>
      <header className="h-header">
        <span className="h-logo"><Logo /></span>
        <div className="h-header-cta">
          <button className="h-icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            )}
          </button>
          {/* Launch App: login happens on app.backx.trade (admins only for now) */}
          <a className="h-btn h-btn-gold" href={APP_URL}>Launch App</a>
        </div>
      </header>

      <main id="main">
        <section className="h-hero" aria-labelledby="hero-title">
          <div className="h-hero-art"><CircuitHero /></div>
          <div className="h-hero-copy">
            <h1 id="hero-title"><Motto className="h-motto" /></h1>
            <p className="h-sub">Go long or short with leverage, or issue capital that backs traders.</p>
            <div className="h-cta"><Participate big /><a className="h-btn h-btn-ghost big" href={APP_URL}>Launch App</a></div>
          </div>
        </section>

        <section id="speed" className="h-section" aria-labelledby="speed-title">
          <div className="h-section-head">
            <p className="h-kicker">Speed</p>
            <h2 id="speed-title">Built for speed</h2>
          </div>
          <div className="h-speed">
            <SpeedCompare title="Speed of trade" others={TRADE} backx={0.5}
              steps={[{ label: 'Issuing', s: 0.25 }, { label: 'Buy', s: 0.3 }, { label: 'Sell', s: 0.3 }]} />
            <SpeedCompare title="Speed of liquidation" others={LIQ} backx={0.5}
              steps={[{ label: 'Position', s: 0.05, from: 0 }, { label: 'Planning', s: 0.1, from: 0.05 }, { label: 'Execution', s: 0.35, from: 0.15 }]} />
          </div>
        </section>

        <section id="chains" className="h-section h-chains" aria-labelledby="chains-title">
          <div className="h-section-head">
            <p className="h-kicker">Multi-chain</p>
            <h2 id="chains-title">20+ chains. <span className="h-y">More coming.</span></h2>
          </div>
          <ChainCarousel />
        </section>

        <section id="how" className="h-section" aria-labelledby="how-title">
          <div className="h-section-head">
            <p className="h-kicker">How it works</p>
            <h2 id="how-title">Three steps</h2>
          </div>
          <ol className="h-steps">
            <li className="h-card">
              <span className="h-step-n">01</span>
              <h3>Your wallet</h3>
              <p>Log in with email, Google, X and more. Your own self-custody wallet is created for you via Privy.</p>
              <WalletVisual />
            </li>
            <li className="h-card">
              <span className="h-step-n">02</span>
              <h3>Issue</h3>
              <p>Put USDC into a Long Pool that backs traders and earn from their activity.</p>
              <IssueVisual />
            </li>
            <li className="h-card">
              <span className="h-step-n">03</span>
              <h3>Long</h3>
              <p>Pick a coin, an amount and your leverage.</p>
              <MultiplierBar />
            </li>
          </ol>
        </section>

        <section className="h-section h-final" aria-labelledby="final-title">
          <h2 id="final-title">Join the venture</h2>
          <p className="h-sub">Participants are first in line when BackX opens.</p>
          <div className="h-cta center"><Participate big /></div>
          <div className="h-gazz"><BuyGazz /></div>
        </section>
      </main>

      <footer className="h-footer">
        <Logo />
        <nav aria-label="Footer"><a href="/whitepaper">Whitepaper</a><a href="/mcp">MCP</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></nav>
        <span className="h-footer-legal">Not financial advice. Using leverage can lose your whole margin.</span>
      </footer>
    </div>
  );
}
