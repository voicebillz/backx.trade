import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Motto } from '../components/Motto';
import { quote } from '../lib/hedge';
import { usd } from '../lib/format';

// Whitepaper (owner 2026-10-22). Plain copy, no yield promises, "multiplication" never "leverage".
// Timing figures come from docs/backx/sim/flash.py (modelled latencies, synthetic crash): keep both in sync.

/** −30 % in 60 s, Major coin at 20×: seconds from the liquidation trigger to the sale, price drop at the sale. */
const TIMING = [
  { who: 'BackX, pre-emptive (CEX signal)', s: -1.5, drop: 2.1, loss: 0, ours: true },
  { who: 'BackX, fast oracle', s: 0.5, drop: 2.9, loss: 0, ours: true },
  { who: 'Intent-based swap bot', s: 3, drop: 4.1, loss: 0 },
  { who: 'Bot (12 s blocks)', s: 9, drop: 7.6, loss: 2.9 },
  { who: 'Manual swap in a wallet app', s: 20, drop: 15.4, loss: 11.1 },
];
const MAX_S = 20;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** True once the element has scrolled into view (at once for reduced motion). */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (reduced()) { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

/** Number that counts up from 0 when it comes into view (ease-out, ~1.1 s). */
function CountUp({ to, digits = 0, pre = '', post = '' }: { to: number; digits?: number; pre?: string; post?: string }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduced()) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const step = (now: number) => { const q = Math.min((now - t0) / 1100, 1); setV(to * (1 - Math.pow(1 - q, 3))); if (q < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seen, to]);
  return <span ref={ref} className="num">{pre}{v.toFixed(digits)}{post}</span>;
}

/** Wrapper that adds .in when visible, so CSS can grow bars. */
function Reveal({ className, children, label }: { className: string; children: ReactNode; label?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return <div ref={ref} className={className + (seen ? ' in' : '')} aria-label={label} role={label ? 'figure' : undefined}>{children}</div>;
}

// Example hedge for the anatomy picture: $100 at 5× on a Major coin (same math as the ticket).
const EX = quote(100, 5, 1, 0.0005, 10_000_000, 0.015);

/** Hedge anatomy: what you pay → margin → lent by issuers → position. */
function HedgeAnatomy() {
  const fees = EX.paid - EX.stake, total = EX.notional;
  const pct = (x: number) => `${(x / total) * 100}%`;
  return (
    <Reveal className="wp-fig wp-anatomy" label="Example hedge: 100 USDC at 5 times">
      <div className="wp-fig-head"><span>Example · {usd(EX.amount, 0)} at {EX.m}×</span><span className="num down">Liquidation ▼ −{(EX.liqMove * 100).toFixed(1)}%</span></div>
      <div className="wp-an-row"><span className="wp-an-label">You pay</span>
        <div className="wp-an-bar"><i className="pay" style={{ width: pct(EX.paid) }} /></div><b className="num"><CountUp to={EX.paid} digits={2} pre="$" /></b></div>
      <div className="wp-an-row"><span className="wp-an-label">Position</span>
        <div className="wp-an-bar"><i className="margin" style={{ width: pct(EX.stake) }} /><i className="lent" style={{ width: pct(EX.loan) }} /></div><b className="num"><CountUp to={total} digits={2} pre="$" /></b></div>
      <div className="wp-an-legend">
        <span><i className="sw margin" />Your margin <b className="num">{usd(EX.stake)}</b></span>
        <span><i className="sw lent" />Lent by issuers <b className="num">{usd(EX.loan)}</b></span>
        <span><i className="sw fee" />Fees + gas <b className="num">{usd(fees)}</b></span>
      </div>
    </Reveal>
  );
}

/** Where a closed position's money goes, in order. */
function Waterfall() {
  const steps = [
    ['1', 'Lent principal', 'back to the issuers\' reserve first'],
    ['2', 'Issuers\' share', '10 % of the trader\'s gain, plus the borrow fee'],
    ['3', 'Trader', 'everything that is left'],
  ];
  return (
    <Reveal className="wp-fig wp-flow" label="Settlement order">
      {steps.map(([n, t, d]) => <div className="wp-flow-step" key={n}><span className="wp-flow-n num">{n}</span><div><b>{t}</b><small>{d}</small></div></div>)}
    </Reveal>
  );
}

/** Before / after card pair. */
function BeforeAfter({ title, before, after }: { title: string; before: [string, ReactNode][]; after: [string, ReactNode][] }) {
  return (
    <Reveal className="wp-fig wp-ba" label={title}>
      <div className="wp-ba-card before"><p className="wp-ba-tag">Before</p>{before.map(([k, v]) => <div className="wp-ba-line" key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      <div className="wp-ba-arrow" aria-hidden="true">→</div>
      <div className="wp-ba-card after"><p className="wp-ba-tag">After</p>{after.map(([k, v]) => <div className="wp-ba-line" key={k}><span>{k}</span><b>{v}</b></div>)}</div>
    </Reveal>
  );
}

/** Simulation results as big before → after numbers (−30 % in 60 s, Major 20×, docs/backx/sim/flash.py). */
function Results() {
  const items = [
    { k: 'Issuer loss', from: 24.2, to: 0, digits: 1, post: ' %' },
    { k: 'Sells after the trigger', from: 80, to: 0.5, digits: 1, post: ' s' },
    { k: 'Price drop at the sale', from: 27.9, to: 2.9, digits: 1, post: ' %', down: true },
  ];
  return (
    <Reveal className="wp-fig wp-results" label="Simulation results, before and after">
      <p className="wp-results-h">Test results · simulated flash crash −30 % in 60 s, Major coin at 20×</p>
      <div className="wp-results-grid">
        {items.map((r) => (
          <div className="wp-result" key={r.k}>
            <span className="wp-result-k">{r.k}</span>
            <span className="wp-result-from num">{r.down ? '▼ −' : ''}{r.from.toFixed(r.digits)}{r.post}</span>
            <b className="wp-result-to">{r.down ? '▼ −' : ''}<CountUp to={r.to} digits={r.digits} post={r.post} /></b>
            <span className="wp-result-tag">Today → launch design</span>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/** Two bars that grow to their value: today vs the launch design. */
function LossBars() {
  const rows = [['TWAP confirm + 2 % TWAP guard (today)', 24.2, 80, 'bad'], ['Fast reference price (launch design)', 0, 0.5, 'good']] as const;
  return (
    <Reveal className="wp-fig wp-loss" label="Issuer loss in a simulated crash, before and after">
      <div className="wp-fig-head"><span>−30 % in 60 s · Major 20× · simulated</span><span>Issuer loss</span></div>
      {rows.map(([t, loss, s, c]) => (
        <div className="wp-loss-row" key={t}>
          <span className="wp-loss-t">{t}<small className="num">sells after +{s} s</small></span>
          <div className="wp-an-bar"><i className={c} style={{ width: `${Math.max(loss / 30, 0.01) * 100}%` }} /></div>
          <b className="num"><CountUp to={loss} digits={1} post="%" /></b>
        </div>
      ))}
    </Reveal>
  );
}

const TOC = [
  ['overview', 'Overview'], ['hedge', 'Hedge'], ['issue', 'Issue'], ['execution', 'Execution & liquidation'],
  ['timing', 'Speed in a flash crash'], ['safety', 'Reserve Security Fund'], ['fees', 'Fees & revenue'],
  ['gazz', '$GAZZ'], ['risks', 'Risks'],
] as const;

export function WhitepaperPage() {
  return (
    <main id="main" className="page wp-page">
      <header className="page-head">
        <div>
          <p className="eyebrow gold">Whitepaper <span className="soon-badge">Draft</span></p>
          <h1>BackX: put your capital to work</h1>
          <Motto className="motto-wp" />
          <p className="page-sub">Hedge &amp; Issue trading on Robinhood Chain and other EVM chains. How it works, how positions are executed and how issuers are protected.</p>
        </div>
      </header>

      <Reveal className="wp-stats" label="Key numbers">
        <div><b><CountUp to={250} post=" ms" /></b><span>block time on Robinhood Chain</span></div>
        <div><b><CountUp to={0.5} digits={1} post=" s" /></b><span>target to sell</span></div>
        <div><b><CountUp to={20} post="+" /></b><span>chains for listings</span></div>
        <div><b><CountUp to={1} /></b><span>login, no wallet app needed</span></div>
      </Reveal>

      <nav className="wp-contents" aria-label="Contents">
        <p className="wp-contents-h">Contents</p>
        <ol>{TOC.map(([id, label], i) => <li key={id}><a href={`#${id}`}><span className="num">{String(i + 1).padStart(2, '0')}</span>{label}<i aria-hidden="true">→</i></a></li>)}</ol>
      </nav>

      <div className="wp-wrap">
        <article className="wp-body">
          <section id="overview">
            <h2>Overview</h2>
            <p>Every trade has two sides: someone taking a position, and someone providing the capital that makes it possible. BackX connects the two on-chain. <b>Hedgers</b> open positions with multiplication; <b>issuers</b> provide the USDC that backs them and earn from that activity. Everything runs in open contracts, owned by a multisig (Safe), with each coin isolated in its own set of contracts.</p>
            <BeforeAfter title="Centralized exchange compared with BackX"
              before={[['Other side of your trade', 'The exchange'], ['Custody', 'Exchange account'], ['Rules', 'Private'], ['Liquidation leftovers', 'Kept by the venue']]}
              after={[['Other side of your trade', 'Issuers, on-chain'], ['Custody', 'Your own wallet'], ['Rules', 'Open contracts'], ['Liquidation leftovers', 'Repay issuers first']]} />
          </section>

          <section id="hedge">
            <h2>Hedge</h2>
            <p>You choose a coin, an amount and a multiplication (1× to the coin's cap). The amount you type is what you pay: fees and keeper gas come out of it, and the rest is your margin. Your position is margin × multiplication; the part above your margin is lent by the issuers' reserve.</p>
            <p>Each position has a liquidation price, shown before you open. If the price falls to it, the position is closed early so the lent capital goes back to the issuers first. You can also set a take-profit limit, filled by a keeper.</p>
            <HedgeAnatomy />
          </section>

          <section id="issue">
            <h2>Issue</h2>
            <p><b>Hedge Pool.</b> Issuers deposit USDC into a coin's reserve. It is lent to hedgers and comes back first when positions close. Issuers share in traders' gains, earn a borrow fee on what is lent, and when a position falls it is closed early and the reserve is paid back first. Rewards go into the pool and are shared in proportion: nothing to claim. Withdrawals are instant from free capital; the rest is queued and paid out as positions settle.</p>
            <Waterfall />
            <p><b>Liquidity Pool · DEX</b> <span className="soon-badge">Soon</span>. Issue into liquidity pools built on the same pool technology as PancakeSwap and Uniswap, tradable on DEXs, managed from one place.</p>
          </section>

          <section id="execution">
            <h2>Execution &amp; liquidation</h2>
            <p>Positions are watched every block by independent keepers. On Robinhood Chain a block is about 250 ms and transactions are ordered first come, first served, so there is no public mempool to front-run. Keepers settle many positions in one transaction. The points below are the launch design; the contracts are being updated to it before the audit.</p>
            <ul>
              <li><b>Fast reference price.</b> A low-latency oracle aggregated from major exchanges is the reference for triggers and fills; the keeper posts the price update and the liquidation in the same transaction.</li>
              <li><b>Ahead of the pool.</b> On-chain pools follow centralized exchanges by a few seconds. Keepers watch those markets, so a liquidation can land before the pool has repriced.</li>
              <li><b>Fair fills.</b> A liquidation sale must fill close to the reference price, so it cannot be sandwiched, and it must return the full lent amount whenever the coins cover it.</li>
              <li><b>Sized to sell.</b> A coin is only listed with real DEX liquidity, and position and open-interest caps are set so a crash can be sold quickly.</li>
            </ul>
            <Results />
            <LossBars />
            <p className="hint">Simulated with docs/backx/sim/flash.py (synthetic crash, modelled latencies). Loss is before the Reserve Security Fund.</p>
          </section>

          <section id="timing">
            <h2>Speed in a flash crash</h2>
            <p>Simulated crash of −30 % in 60 seconds on a major coin, position at 20×. Time from the liquidation trigger until the sale lands, and how far the price had fallen at that moment.</p>
            <Reveal className="wp-timing" label="Execution speed compared"><div role="table" aria-label="Execution speed compared">
              <div className="wp-row wp-head" role="row">
                <span role="columnheader">Who sells</span><span role="columnheader">Seconds after trigger</span><span role="columnheader" className="r">Price at sale</span><span role="columnheader" className="r">Issuer loss</span>
              </div>
              {TIMING.map((t) => (
                <div className={'wp-row' + (t.ours ? ' ours' : '')} role="row" key={t.who}>
                  <span role="cell">{t.who}</span>
                  <span role="cell" className="wp-bar-cell">
                    <span className="wp-bar"><i style={{ width: `${Math.max(Math.abs(t.s) / MAX_S, 0.03) * 100}%` }} className={t.s < 0 ? 'early' : ''} /></span>
                    <span className="num">{t.s > 0 ? '+' : '−'}{Math.abs(t.s)} s</span>
                  </span>
                  <span role="cell" className="r num down">▼ −{t.drop.toFixed(1)}%</span>
                  <span role="cell" className="r num">{t.loss ? `${t.loss.toFixed(1)}%` : '0%'}</span>
                </div>
              ))}
            </div></Reveal>
            <p className="hint">Simulation with modelled latencies (manual 20 s, intent fill 3 s, L1 bot 9 s, BackX keeper 0.5 s), not measurements of these products. A negative time means the sale lands before the on-chain pool has repriced. Issuer loss is before the Reserve Security Fund.</p>
          </section>

          <section id="safety">
            <h2>Reserve Security Fund</h2>
            <p>Part of every fee goes into each coin's Reserve Security Fund. If a sale ever returns less than was lent, the fund covers the gap first, so issuers are kept whole in normal and fast markets.</p>
            <p className="wp-callout">In an extreme flash crash, a drop of 30–60 % within minutes, which is very rare, a gap can be larger than the fund. In such an event issuers can expect a small loss, shared in proportion across the pool.</p>
          </section>

          <section id="fees">
            <h2>Fees &amp; revenue</h2>
            <p>Fees are baked into the amount a hedger pays and shown as one figure, plus keeper gas. They fund the issuers (borrow fee and a share of gains), the Reserve Security Fund, the keepers, and the platform. Issuers get the biggest rewards; platform revenue flows back to GAZZFUN and its holders.</p>
          </section>

          <section id="gazz">
            <h2>$GAZZ</h2>
            <p><b>$GAZZ is the core token of BackX.</b> BackX is built inside the gazz.fun ecosystem, and $GAZZ ties the two together: it is the token future staking on BackX is built around, and the one that ecosystem holders share in.</p>
            <p><b>Revenue shared with the ecosystem.</b> Every hedge pays a holders fee of 2 % of the trader's margin, sent on-chain to gazz.fun. BackX shares its revenue with the gazz.fun ecosystem holders this way, so platform activity flows back to the community that backs it, alongside what issuers earn.</p>
            <Reveal className="wp-fig wp-flow" label="How revenue reaches gazz.fun holders">
              <div className="wp-flow-step"><span className="wp-flow-n num">1</span><div><b>Hedge opens</b><small>fees come out of the amount the trader pays</small></div></div>
              <div className="wp-flow-step"><span className="wp-flow-n num">2</span><div><b>2 % to gazz.fun</b><small>holders fee, sent by the contract</small></div></div>
              <div className="wp-flow-step"><span className="wp-flow-n num">3</span><div><b>Ecosystem holders</b><small>share in BackX revenue</small></div></div>
            </Reveal>
            <p>Contract on Robinhood Chain: <span className="num wp-ca">0x08a5d78a4bc7754e8aff87b4509e007baeb685f3</span>. How the share is split among holders and how staking works will be published before launch. Holding $GAZZ is not a promise of returns.</p>
          </section>

          <section id="risks">
            <h2>Risks</h2>
            <p>BackX is not live yet. Contracts are being finalised and will be audited before launch. Using multiplication can lose your whole margin. Issuing is not risk-free: crashes, oracle or chain outages and empty pools can cause losses. Nothing here is a promise of returns or financial advice.</p>
          </section>
        </article>
      </div>
    </main>
  );
}
