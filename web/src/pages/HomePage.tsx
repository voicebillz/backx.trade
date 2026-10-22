import { useEffect } from 'react';
import { Logo } from '../components/Logo';
import { Motto } from '../components/Motto';
import { CircuitHero } from '../components/home/CircuitHero';
import { ChainCarousel } from '../components/home/ChainCarousel';
import { MultiplierBar, BuyGazz } from '../components/Showcase';
import { useParticipate } from '../lib/useParticipate';
import { useAuth } from '../lib/auth';
import { APP_URL } from '../lib/host';

// Public front page at backx.trade (owner 2026-10-22). The app itself lives at app.backx.trade (admins only for now).
// Speed figures are the modelled results of docs/backx/sim/flash.py, shown as such (see the Whitepaper).

const TRADE = [
  { who: 'BackX on Robinhood Chain', s: 0.5, ours: true },
  { who: 'Intent swap (e.g. Relay)', s: 3 },
  { who: 'Bot on Ethereum L1', s: 9 },
  { who: 'Manual wallet swap', s: 20 },
];
const LIQ = [
  { who: 'BackX keeper, CEX signal', drop: 2.1, loss: 0, ours: true },
  { who: 'BackX keeper, fast oracle', drop: 2.9, loss: 0, ours: true },
  { who: 'Intent swap bot', drop: 4.1, loss: 0 },
  { who: 'Bot on Ethereum L1', drop: 7.6, loss: 2.9 },
  { who: 'Manual wallet swap', drop: 15.4, loss: 11.1 },
];

function Participate({ big = false }: { big?: boolean }) {
  const { me, joined, joinedAt, busy, err, canSignIn, participate } = useParticipate();
  if (joined) return (
    <span className={'h-joined' + (big ? ' big' : '')} aria-live="polite">
      ▲ You're in{joinedAt ? ` · since ${new Date(joinedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : ''}
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

function Bars<T extends { who: string; ours?: boolean }>({ rows, value, max, label }: { rows: T[]; value: (r: T) => number; max: number; label: (r: T) => string }) {
  return (
    <ul className="h-bars">
      {rows.map((r) => (
        <li key={r.who} className={r.ours ? 'ours' : ''}>
          <span className="h-bar-who">{r.who}</span>
          <span className="h-bar"><i style={{ width: `${Math.max(value(r) / max, 0.025) * 100}%` }} /></span>
          <span className="h-bar-v num">{label(r)}</span>
        </li>
      ))}
    </ul>
  );
}

export function HomePage() {
  useEffect(() => {
    document.title = 'BackX · Future Trading for Capital';
    document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.setAttribute('content', 'index, follow, max-image-preview:large, max-snippet:-1');
  }, []);
  const { me, signOut } = useAuth();

  return (
    <div className="home">
      <a className="skip" href="#main">Skip to content</a>
      <header className="h-header">
        <span className="h-logo"><Logo /></span>
        <nav className="h-nav" aria-label="Main">
          <a href="#speed">Speed</a>
          <a href="#chains">Chains</a>
          <a href="#how">How it works</a>
          <a href="/whitepaper">Whitepaper</a>
        </nav>
        <div className="h-header-cta">
          {/* Launch App: login happens on app.backx.trade (admins only for now) */}
          <a className="h-btn h-btn-gold" href={APP_URL}>Launch App</a>
        </div>
      </header>

      <main id="main">
        <section className="h-hero" aria-labelledby="hero-title">
          <div className="h-hero-art"><CircuitHero /></div>
          <div className="h-hero-copy">
            <p className="h-eyebrow"><span className="soon-badge">Coming soon</span></p>
            <h1 id="hero-title"><Motto className="h-motto" /></h1>
            <p className="h-sub">Hedge with multiplication or issue capital that backs traders, on Robinhood Chain and 20+ chains. One login, no wallet to connect.</p>
            <div className="h-cta"><Participate big /><a className="h-btn h-btn-ghost big" href={APP_URL}>Launch App</a></div>
            {me && <button className="h-signout" onClick={signOut}>Sign out</button>}
          </div>
        </section>

        <section id="speed" className="h-section" aria-labelledby="speed-title">
          <div className="h-section-head">
            <p className="h-kicker">Tested in simulation</p>
            <h2 id="speed-title">Built for speed</h2>
          </div>
          <div className="h-speed">
            <article className="h-card">
              <h3>Speed of trade</h3>
              <p className="h-card-sub">From signing to on-chain, in seconds</p>
              <Bars rows={TRADE} value={(r) => r.s} max={20} label={(r) => `${r.s} s`} />
            </article>
            <article className="h-card">
              <h3>Speed of liquidation</h3>
              <p className="h-card-sub">Flash crash −30 % in 60 s, position at 20×: price when the sale lands, and issuer loss</p>
              <Bars rows={LIQ} value={(r) => r.drop} max={16} label={(r) => `▼ −${r.drop.toFixed(1)}% · ${r.loss ? `${r.loss}%` : '0%'}`} />
            </article>
          </div>
          <p className="h-note">Modelled latencies from our flash-crash simulation, not measurements of other products. BackX figures are launch targets. <a href="/whitepaper#timing">How we tested</a>.</p>
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
              <h3>Hedge</h3>
              <p>Pick a coin, an amount and a multiplication. What you type is what you pay; your liquidation price is shown before you open.</p>
              <MultiplierBar />
            </li>
            <li className="h-card">
              <span className="h-step-n">02</span>
              <h3>Issue</h3>
              <p>Put USDC into a Hedge Pool that backs traders and earn from their activity, up or down. Lent capital comes back first.</p>
              <p className="h-step-tag">Liquidity Pool · DEX <span className="soon-badge">Soon</span></p>
            </li>
            <li className="h-card">
              <span className="h-step-n">03</span>
              <h3>Your wallet</h3>
              <p>Log in with email, Google, X and more. Your own wallet is created for you: deposit, swap and withdraw to any address you choose.</p>
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
        <nav aria-label="Footer"><a href="/whitepaper">Whitepaper</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></nav>
        <span className="h-footer-legal">Operated by GAZZFUN LLC. Not financial advice. Using multiplication can lose your whole margin.</span>
      </footer>
    </div>
  );
}
