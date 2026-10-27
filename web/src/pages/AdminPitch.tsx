import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Mark } from '../components/Logo';

// Admin "Pitch deck" (owner 2026-10-27): investor deck, admins only (it lives in the admin chunk, which is still a
// public file: never put confidential numbers here, add them in the PDF/email instead). One slide at a time on screen
// (arrows, keys), "Download PDF" prints every slide as its own 16:9 page in the current theme.
// Style (owner 2026-10-27): one short, confident statement per slide and a picture that explains it; diagrams are
// drawn here, screenshots live in web/public/pitch (retake them when the app changes). Copy rules as everywhere:
// "Leverage" and "Long", never "zero risk", no yield promises.

const CHAINS = [
  ['Robinhood Chain', '/chains/robinhood.png'], ['BNB Chain', '/chains/bnb.png'],
  ['Base', '/chains/base.svg'], ['Arbitrum', '/chains/arbitrum.png'],
] as const;

// ---- Small flat icons ------------------------------------------------------------------------------------------

const I = ({ d, size = 1 }: { d: ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" className="ps-i" style={{ width: `${3.8 * size}cqw`, height: `${3.8 * size}cqw` }} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const User = () => <I d={<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>} />;
const Coins = () => <I d={<><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3" /></>} />;
const Bolt = () => <I d={<path d="M13 2 4 14h7l-1 8 9-12h-7z" />} />;
const Vault = () => <I d={<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="12" cy="12" r="3.5" /><path d="M12 8.5V7M12 17v-1.5M15.5 12H17M7 12h1.5" /></>} />;
const Lock = () => <I d={<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>} />;
const Pen = () => <I d={<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>} />;
const Arrow = ({ dir = 'r' }: { dir?: 'r' | 'd' | 'lr' }) => (
  <svg viewBox="0 0 40 12" className={'ps-arrow ' + dir} aria-hidden="true">
    {dir === 'lr' && <path d="M8 2 2 6l6 4" />}
    <path d="M2 6h36" /><path d="M32 2l6 4-6 4" />
  </svg>
);

// ---- Diagrams --------------------------------------------------------------------------------------------------

/** Three sides around one market. */
function SidesDiagram() {
  return (
    <div className="pd-sides">
      <div className="pd-node"><span className="pd-ico gold"><User /></span><b>Traders</b><span>Long or Short</span></div>
      <Arrow dir="lr" />
      <div className="pd-node core"><Mark size={44} /><b>Market</b><span>open contracts</span></div>
      <Arrow dir="lr" />
      <div className="pd-node"><span className="pd-ico blue"><Coins /></span><b>Issuers</b><span>back the trades</span></div>
      <div className="pd-under">
        <span className="pd-ico green"><Bolt /></span><b>Validators</b><span>settle every trade, paid per trade</span>
      </div>
    </div>
  );
}

/** $100 at 10×: what the trader puts in and what issuers lend. */
function LongDiagram() {
  return (
    <div className="pd-long">
      <div className="pd-bar">
        <div className="you" style={{ flex: 1 }}><b className="num">$100</b><span>you</span></div>
        <div className="lent" style={{ flex: 9 }}><b className="num">$900</b><span>lent by issuers</span></div>
      </div>
      <div className="pd-bar-label"><span className="num">10×</span><span>=</span><b className="num">$1,000 position</b></div>
      <div className="pd-split">
        <div><i className="you" /><span>Gain</span><b>to you</b></div>
        <div><i className="lent" /><span>10 %</span><b>to issuers</b></div>
        <div><i className="plat" /><span>2 %</span><b>to the platform</b></div>
      </div>
    </div>
  );
}

/** Liquidation timeline, 0.5 s end to end. */
function SpeedDiagram() {
  const steps = [['Spot', 0.05], ['Plan', 0.1], ['Execute', 0.35]] as const;
  return (
    <div className="pd-speed">
      <div className="pd-track">{steps.map(([l, s]) => <div key={l} style={{ flex: s * 10 }}><b className="num">{s} s</b><span>{l}</span></div>)}</div>
      <div className="pd-scale"><span className="num">0 s</span><span className="num">0.5 s</span></div>
      <div className="pd-chips">
        <div><b className="num">0.25 s</b><span>issue</span></div>
        <div><b className="num">0.3 s</b><span>buy</span></div>
        <div><b className="num">0.3 s</b><span>sell</span></div>
      </div>
    </div>
  );
}

/** Where every fee goes. */
function MoneyDiagram() {
  return (
    <div className="pd-money">
      <div className="pd-node"><span className="pd-ico gold"><User /></span><b>Every trade</b></div>
      <Arrow />
      <div className="pd-node core"><span className="pd-ico gold"><Vault /></span><b>Treasury</b><span>USDC</span></div>
      <div className="pd-fan">
        <Arrow /><div className="pd-pill"><b className="num">90 %</b><span>BackX</span></div>
        <Arrow /><div className="pd-pill gold"><b className="num">10 %</b><span>$GAZZ stakers</span></div>
      </div>
    </div>
  );
}

/** An AI assistant prepares, the user signs. */
function AgentDiagram() {
  return (
    <div className="pd-agent">
      <div className="pd-ais">
        <img src="/ai/openai.svg" alt="ChatGPT" /><img src="/ai/claude.svg" alt="Claude" /><img src="/ai/copilot.svg" alt="Copilot" />
      </div>
      <Arrow />
      <div className="pd-node core"><Mark size={40} /><b>MCP</b><span>prepares</span></div>
      <Arrow />
      <div className="pd-node"><span className="pd-ico gold"><Pen /></span><b>You sign</b><span>own wallet</span></div>
    </div>
  );
}

/** Social login straight into an own wallet. */
function WalletDiagram() {
  return (
    <div className="pd-agent">
      <div className="pd-logins">
        {['google', 'x', 'outlook', 'apple'].map((k) => <span key={k}><img src={`/logins/${k}.svg`} alt={k} /></span>)}
      </div>
      <Arrow />
      <div className="pd-node"><span className="pd-ico gold"><Lock /></span><b>Your wallet</b><span>yours alone</span></div>
      <Arrow />
      <div className="pd-node core"><Mark size={40} /><b>Trade</b><span>on-chain</span></div>
    </div>
  );
}

function Roadmap() {
  const steps = [['Oracle', 'fast prices'], ['Audit', 'external'], ['Launch', '4 chains'], ['Scale', 'more chains, Solana']];
  return (
    <ol className="pd-road">
      {steps.map(([h, t], n) => <li key={h} className={n === 0 ? 'now' : ''}><i /><b>{h}</b><span>{t}</span></li>)}
    </ol>
  );
}

function Uses() {
  const items: [ReactNode, string][] = [[<Lock key="a" />, 'Audit'], [<Bolt key="b" />, 'Oracle'], [<Vault key="c" />, 'Validators'], [<Coins key="d" />, 'Liquidity'], [<Pen key="e" />, 'Legal']];
  return <div className="pd-uses">{items.map(([icon, t]) => <div key={t}><span className="pd-ico gold">{icon}</span><b>{t}</b></div>)}</div>;
}

// ---- Slides ----------------------------------------------------------------------------------------------------

interface Slide { kicker: string; title: string; sub?: string; art: ReactNode; layout?: 'cover' | 'split' | 'wide' | 'end' }

const SLIDES: Slide[] = [
  { kicker: 'backx.trade', title: 'Future Trading for Agents ⇄ Capital', layout: 'cover', art: <img className="ps-shot" src="/pitch/terminal.webp" alt="BackX trading terminal" /> },
  { kicker: 'The idea', title: 'Three sides. One open market.', sub: 'Traders take the trade. Issuers back it. Validators settle it.', art: <SidesDiagram /> },
  { kicker: 'Long', title: 'Put in $100. Trade $1,000.', sub: 'Issuers lend the rest and earn from every gain.', art: <LongDiagram /> },
  { kicker: 'Product', title: 'The terminal is built.', art: <img className="ps-shot" src="/pitch/terminal.webp" alt="BackX trading terminal" />, layout: 'wide' },
  { kicker: 'Trade', title: 'Long or Short. Up to 20×.', sub: 'Take profit, stop loss and limit orders on every trade.', art: <img className="ps-shot tall" src="/pitch/ticket.webp" alt="BackX trade ticket" />, layout: 'split' },
  { kicker: 'Speed', title: 'Liquidation in half a second.', art: <SpeedDiagram /> },
  { kicker: 'Wallet', title: 'Log in. Own your wallet.', sub: 'Every account gets its own wallet. No custody.', art: <WalletDiagram /> },
  { kicker: 'Agents', title: 'AI agents trade BackX.', sub: 'ChatGPT, Claude and Copilot connect in one click.', art: <AgentDiagram /> },
  { kicker: 'Revenue', title: 'Every trade pays.', art: <MoneyDiagram /> },
  { kicker: '$GAZZ', title: 'Holders share the revenue.', sub: 'Stake $GAZZ or Gazz Tanks. Claim in USDC.', art: <img className="ps-shot" src="/pitch/staking.webp" alt="BackX staking" /> },
  { kicker: 'Launch', title: 'Four chains. Day one.', art: <div className="pd-chains">{CHAINS.map(([n, l]) => <div key={n}><img src={l} alt="" /><b>{n}</b></div>)}</div> },
  { kicker: 'Roadmap', title: 'Oracle. Audit. Launch.', art: <Roadmap /> },
  { kicker: 'The round', title: 'This round takes BackX live.', art: <Uses /> },
  { kicker: 'backx.trade', title: 'Trade with us.', sub: 'app.backx.trade', layout: 'end', art: <Mark size={120} /> },
];

function SlideView({ s, i }: { s: Slide; i: number }) {
  return (
    <div className="ps-frame">
      <section className={'ps-slide ' + (s.layout ?? 'stack')} aria-label={`Slide ${i + 1}: ${s.title}`}>
        <div className="ps-text">
          <p className="ps-top"><Mark size={20} /><span>{s.kicker}</span></p>
          <h2>{s.title}</h2>
          {s.sub && <p className="ps-sub">{s.sub}</p>}
        </div>
        <div className="ps-art">{s.art}</div>
        <div className="ps-foot"><span>backx.trade</span><span className="num">{i + 1} / {SLIDES.length}</span></div>
      </section>
    </div>
  );
}

export function AdminPitch() {
  const [i, setI] = useState(0);
  const [printing, setPrinting] = useState(false);
  const prev = () => setI((n) => Math.max(0, n - 1));
  const next = () => setI((n) => Math.min(SLIDES.length - 1, n + 1));

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') next();
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);

  useEffect(() => {
    if (!printing) return;
    document.body.classList.add('pitch-printing');
    const title = document.title;
    document.title = 'BackX Pitch deck';
    const done = () => { document.body.classList.remove('pitch-printing'); document.title = title; setPrinting(false); };
    addEventListener('afterprint', done, { once: true });
    print();
    return () => removeEventListener('afterprint', done);
  }, [printing]);

  return (
    <section className="card pitch">
      <div className="row-between">
        <h2>Pitch deck</h2>
        <button className="btn btn-primary" onClick={() => setPrinting(true)}>Download PDF</button>
      </div>
      <SlideView s={SLIDES[i]} i={i} />
      <div className="ps-nav">
        <button className="btn" onClick={prev} disabled={i === 0} aria-label="Previous slide">←</button>
        <div className="ps-dots" role="tablist" aria-label="Slides">
          {SLIDES.map((s, n) => <button key={n} role="tab" aria-selected={n === i} aria-label={`Slide ${n + 1}: ${s.title}`} className={n === i ? 'on' : ''} onClick={() => setI(n)} />)}
        </div>
        <button className="btn" onClick={next} disabled={i === SLIDES.length - 1} aria-label="Next slide">→</button>
      </div>
      {printing && createPortal(<div className="pitch-print">{SLIDES.map((s, n) => <SlideView key={n} s={s} i={n} />)}</div>, document.body)}
    </section>
  );
}
