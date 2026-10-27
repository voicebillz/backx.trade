import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Mark } from '../components/Logo';

// Admin "Pitch deck" (owner 2026-10-27): investor deck, admins only (it lives in the admin chunk, which is still a
// public file: never put confidential numbers here, add them in the PDF/email instead). One slide at a time on screen
// (arrows, keys), "Download PDF" prints every slide as its own 16:9 page in the current theme.
// Copy rules as everywhere: "Leverage" and "Long", never "zero risk", no yield promises; status stays honest.

interface Slide { kicker: string; title: string; body: ReactNode }

const CHAINS = [
  { name: 'Robinhood Chain', logo: '/chains/robinhood.png' },
  { name: 'BNB Chain', logo: '/chains/bnb.png' },
  { name: 'Base', logo: '/chains/base.svg' },
  { name: 'Arbitrum', logo: '/chains/arbitrum.png' },
];

const Cols = ({ items }: { items: [string, string][] }) => (
  <div className="ps-cols">{items.map(([h, t]) => <div key={h} className="ps-box"><h3>{h}</h3><p>{t}</p></div>)}</div>
);
const List = ({ items }: { items: string[] }) => <ul className="ps-list">{items.map((t) => <li key={t}>{t}</li>)}</ul>;

const SLIDES: Slide[] = [
  {
    kicker: 'backx.trade', title: 'Future Trading for Agents ⇄ Capital',
    body: <p className="ps-lead">Open, on-chain leverage trading where every position is backed by real issuers, settled by anyone, and usable by people and AI agents alike.</p>,
  },
  {
    kicker: 'Problem', title: 'Leverage trading is closed, slow or both',
    body: <Cols items={[
      ['Centralised venues', 'They hold your money, set the rules and decide liquidations out of sight.'],
      ['On-chain perps', 'Liquidations lag in a fast crash, and the liquidity providers pay for it.'],
      ['AI agents', 'Need API keys, logins and custody to trade. Most venues were never built for them.'],
    ]} />,
  },
  {
    kicker: 'Solution', title: 'One open market per coin, three sides',
    body: <Cols items={[
      ['Traders', 'Go Long or Short up to 20× leverage from their own wallet. What they type is what they pay.'],
      ['Issuers', 'Back traders with USDC (for Long) or the coin itself (for Short) and earn claimable USDC.'],
      ['Validators', 'Anyone can liquidate, fill orders and take profit, paid from each position’s own gas escrow.'],
    ]} />,
  },
  {
    kicker: 'How it works', title: 'No custody, no company capital at risk',
    body: <List items={[
      'Every user gets their own embedded wallet at login (email, Google, X, passkey …). Deposits go straight to it.',
      'One upgradeable contract set per coin per chain, owned by a Safe, created in a single transaction.',
      'Liquidation guard: a sale must return the full principal while the price covers it, so sandwiches revert.',
      'Reserve Security Fund per market as the last resort, with hard caps on what it can pay out.',
      'Nothing that protects money depends on our servers: settlement is open to anyone.',
    ]} />,
  },
  {
    kicker: 'Why now', title: 'Agents are becoming traders',
    body: <Cols items={[
      ['Built for agents', 'Public skill.md, address book and ABIs, plus our own MCP server: ChatGPT, Claude and Copilot can trade, issue and claim, the user signs.'],
      ['Robinhood Chain', 'A new chain with stocks and crypto, and few native trading products yet.'],
      ['Cheap, fast L2s', 'Settlement in under a second makes on-chain liquidation practical.'],
    ]} />,
  },
  {
    kicker: 'Product', title: 'Built and running today',
    body: <List items={[
      'Trading app: chart terminal with 24 indicators, Long | Short ticket, leverage dial, TP / SL, limit orders.',
      'Demo mode with 10,000 play USDC, working now.',
      'Issue page, Swap (LI.FI), withdrawals, $GAZZ and Gazz Tanks staking, Claim all in one signature.',
      'MCP server live at mcp.backx.trade, with a consent and signing flow on the app.',
      'Contracts written and tested (96 tests, two stablecoin formats). Not yet audited or deployed.',
    ]} />,
  },
  {
    kicker: 'Business model', title: 'Revenue on every position',
    body: (
      <>
        <div className="ps-stats">
          <div><b className="num">2 %</b><span>platform fee on the margin</span></div>
          <div><b className="num">2 %</b><span>of a trader’s gain</span></div>
          <div><b className="num">5 %</b><span>of what is left at a liquidation</span></div>
          <div><b className="num">0.3 %</b><span>at 1× (nothing borrowed)</span></div>
        </div>
        <List items={[
          'All platform revenue lands in one Treasury per chain, in USDC.',
          '10 % of it is shared with $GAZZ and Gazz Tanks stakers.',
          'Issuers earn the most: 10 % of traders’ gains plus 0.25 % borrow fee on what they lend.',
        ]} />
      </>
    ),
  },
  {
    kicker: 'Speed', title: 'Liquidation in about half a second',
    body: (
      <>
        <div className="ps-stats">
          <div><b className="num">0.25 s</b><span>trade issuing</span></div>
          <div><b className="num">0.3 s</b><span>buy / sell</span></div>
          <div><b className="num">0.5 s</b><span>liquidation, end to end</span></div>
        </div>
        <p className="ps-fine">Launch targets from our flash-crash simulation with a fast pull oracle (Pyth). Method in the whitepaper.</p>
      </>
    ),
  },
  {
    kicker: 'Launch chains', title: 'Four chains, same addresses everywhere',
    body: (
      <div className="ps-chains">
        {CHAINS.map((c) => <div key={c.name}><img src={c.logo} alt="" width={56} height={56} /><span>{c.name}</span></div>)}
      </div>
    ),
  },
  {
    kicker: 'Go to market', title: 'Where the first users come from',
    body: <Cols items={[
      ['Agents', 'MCP and skill.md make BackX a tool every AI assistant can use.'],
      ['Community', '$GAZZ holders and Gazz Tanks owners share the platform revenue by staking.'],
      ['Partners', 'DEX hooks (PancakeSwap, Uniswap), chain ecosystem programmes, Pyth for prices.'],
    ]} />,
  },
  {
    kicker: 'Roadmap', title: 'From tested to live',
    body: (
      <ol className="ps-road">
        <li><b>Now</b><span>Fast oracle (Pyth) for liquidations, fork tests</span></li>
        <li><b>Next</b><span>External audit of all contracts</span></li>
        <li><b>Launch</b><span>Robinhood Chain, BNB Chain, Base, Arbitrum</span></li>
        <li><b>Then</b><span>DEX pool hook, more chains, Solana</span></li>
      </ol>
    ),
  },
  {
    kicker: 'The ask', title: 'What the round pays for',
    body: <List items={[
      'External smart contract audit.',
      'Pyth oracle integration and fork tests.',
      'Validators on five independent servers per chain.',
      'Launch liquidity for issuer reserves.',
      'Company, legal and operations.',
    ]} />,
  },
  {
    kicker: 'Contact', title: 'backx.trade',
    body: <p className="ps-lead">Try the demo at app.backx.trade. Read the whitepaper at backx.trade/whitepaper.</p>,
  },
];

function SlideView({ s, i }: { s: Slide; i: number }) {
  return (
    <div className="ps-frame">
      <section className={'ps-slide' + (i === 0 ? ' first' : '')} aria-label={`Slide ${i + 1}: ${s.title}`}>
        <header className="ps-top"><Mark size={22} /><span>{s.kicker}</span></header>
        <h2>{s.title}</h2>
        <div className="ps-body">{s.body}</div>
        <div className="ps-foot"><span>Future Trading for Agents ⇄ Capital</span><span className="num">{i + 1} / {SLIDES.length}</span></div>
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
