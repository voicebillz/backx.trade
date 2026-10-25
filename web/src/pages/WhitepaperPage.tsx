import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AgentCallSheet } from '../components/AgentCallSheet';
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

// ---- Short with a profit roof (contracts/src/BackxShortManager.sol, docs/backx/sim/short_roof.py) ----------------

const SWAP = 0.0035;                       // pool fee + impact per way, paid by the trader
const SHORT_TIERS = [
  { tier: 'Major', maxM: 20, margin: 0.02, roof: 0.8 },
  { tier: 'Large', maxM: 5, margin: 0.03, roof: 0.7 },
  { tier: 'Mid', maxM: 3, margin: 0.04, roof: 0.6 },
  { tier: 'Small', maxM: 2, margin: 0.05, roof: 0.5 },
];
const E_SHORT: Record<number, number> = { 1: 0.4, 2: 0.4, 3: 0.35, 5: 0.3, 20: 0.14 };

/** Trader result (USD, net of everything) of a short paying `paid` at m when the price moves by `x` (−0.9 … +1). */
function shortPnl(paid: number, m: number, margin: number, roof: number, x: number) {
  const X = (paid - 0.1) / (1 + 0.025 + m * 0.0028);
  const C = X + m * X * (1 - SWAP);
  const buf = 0.003 + (m > 10 ? 0.0002 * (m - 10) : 0);
  const liqCost = (C - (E_SHORT[m] ?? 0.3) * X - margin * m * X) / (1 + buf);
  const liqMove = liqCost / (m * X * (1 + SWAP)) - 1;
  const move = Math.max(x, -roof);                       // the roof closes it: no further gain
  if (move >= liqMove) return { pnl: -paid, liqMove };    // liquidated: the margin is gone
  const rest = C - m * X * (1 + move) * (1 + SWAP);
  const gain = Math.max(rest - X, 0);
  return { pnl: rest - gain * 0.1 - paid, liqMove };
}

/** P/L of a $100 short at 2× (Major): rises as the price falls, flat from the roof, −$100 at liquidation. */
function ShortRoof() {
  const W = 320, H = 170, L = 34, B = 22;
  const xs = Array.from({ length: 151 }, (_, i) => -0.9 + i * 0.01);
  const t = SHORT_TIERS[0];
  const pts = xs.map((x) => [x, shortPnl(100, 2, t.margin, t.roof, x).pnl] as const);
  const yMax = 160, yMin = -110;
  const px = (x: number) => L + ((x + 0.9) / 1.5) * (W - L - 6);
  const py = (y: number) => 6 + ((yMax - y) / (yMax - yMin)) * (H - B - 6);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${px(x).toFixed(1)},${py(y).toFixed(1)}`).join('');
  const roofY = shortPnl(100, 2, t.margin, t.roof, -t.roof).pnl;
  const liq = shortPnl(100, 2, t.margin, t.roof, 0).liqMove;
  return (
    <Reveal className="wp-fig wp-chart" label="Short profit roof: result of a 100 USDC short at 2 times">
      <div className="wp-fig-head"><span>$100 short at 2× · Major · roof −{t.roof * 100}%</span><span className="num">max <span className="up">▲ +${roofY.toFixed(0)}</span></span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gain rises as the price falls and stops at the roof, +${roofY.toFixed(0)} dollars; at a rise of ${(liq * 100).toFixed(0)} percent the short is liquidated`}>
        {[-100, 0, 100].map((y) => <g key={y}><line x1={L} x2={W - 6} y1={py(y)} y2={py(y)} className="grid" /><text x={L - 4} y={py(y) + 3} className="ax r">{y > 0 ? '+' : y < 0 ? '−' : ''}${Math.abs(y)}</text></g>)}
        {[-0.8, -0.4, 0, 0.4].map((x) => <text key={x} x={px(x)} y={H - 6} className="ax c">{x > 0 ? '+' : x < 0 ? '−' : ''}{Math.abs(x * 100)}%</text>)}
        <line x1={px(-t.roof)} x2={px(-t.roof)} y1={6} y2={H - B} className="mark roof" />
        <line x1={px(liq)} x2={px(liq)} y1={6} y2={H - B} className="mark liq" />
        <path d={d} className="line" />
        <text x={px(-t.roof) + 4} y={14} className="ax">roof</text>
        <text x={px(liq) - 4} y={14} className="ax r">liquidated ▲ +{(liq * 100).toFixed(0)}%</text>
      </svg>
      <p className="wp-chart-x">Price move after opening</p>
    </Reveal>
  );
}

/** Max result per tier at the cap and at 2×, for $100 paid, at the roof. */
function RoofTable() {
  return (
    <div className="wp-table" role="table" aria-label="Short roof per tier">
      <div className="wp-row wp-head" role="row"><span role="columnheader">Tier</span><span role="columnheader" className="r">Roof</span><span role="columnheader" className="r">Liquidated at</span><span role="columnheader" className="r">Max result, $100</span></div>
      {SHORT_TIERS.map((t) => {
        const top = shortPnl(100, t.maxM, t.margin, t.roof, -t.roof);
        return (
          <div className="wp-row" role="row" key={t.tier}>
            <span role="cell">{t.tier} · {t.maxM}×</span>
            <span role="cell" className="r num down">▼ −{t.roof * 100}%</span>
            <span role="cell" className="r num">▲ +{(top.liqMove * 100).toFixed(1)}%</span>
            <span role="cell" className="r num up">▲ +${top.pnl.toFixed(0)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Validator accuracy bonus: max · ((W − d) / W)², W = 1 %. */
function RewardCurve() {
  const W = 320, H = 150, L = 34, B = 22;
  const px = (d: number) => L + (d / 1.2) * (W - L - 6);
  const py = (s: number) => 6 + (1 - s) * (H - B - 6);
  const share = (d: number) => (d >= 1 ? 0 : (1 - d) ** 2);
  const path = Array.from({ length: 121 }, (_, i) => i / 100).map((d, i) => `${i ? 'L' : 'M'}${px(d).toFixed(1)},${py(share(d)).toFixed(1)}`).join('');
  return (
    <Reveal className="wp-fig wp-chart" label="Validator accuracy bonus by distance from the trigger">
      <div className="wp-fig-head"><span>Accuracy bonus · share of the max</span><span className="num">max 0.5 % of the position</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Full bonus right at the trigger, a quarter at 0.5 percent past it, nothing from 1 percent">
        {[0, 0.5, 1].map((s) => <g key={s}><line x1={L} x2={W - 6} y1={py(s)} y2={py(s)} className="grid" /><text x={L - 4} y={py(s) + 3} className="ax r">{s * 100}%</text></g>)}
        {[0, 0.25, 0.5, 0.75, 1].map((d) => <text key={d} x={px(d)} y={H - 6} className="ax c">{d}%</text>)}
        <path d={path} className="line" />
        {[0, 0.25, 0.5].map((d) => <circle key={d} cx={px(d)} cy={py(share(d))} r={3} className="dot" />)}
      </svg>
      <p className="wp-chart-x">Distance past the trigger when the validator executes</p>
    </Reveal>
  );
}

const TOC = [
  ['overview', 'Overview'], ['hedge', 'Hedge'], ['short', 'Short'], ['issue', 'Issue'], ['orders', 'Orders'],
  ['execution', 'Execution & liquidation'], ['validators', 'Validators'], ['timing', 'Speed in a flash crash'],
  ['safety', 'Reserve Security Fund'], ['rewards', 'Rewards & claims'], ['agents', 'For AI agents'],
  ['fees', 'Fees & revenue'], ['gazz', '$GAZZ'], ['risks', 'Risks'],
] as const;

export function WhitepaperPage() {
  return (
    <main id="main" className="page wp-page">
      <header className="page-head">
        <div>
          <p className="eyebrow gold">Whitepaper</p>
          <h1>BackX: put your capital to work</h1>
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
            <p>Every trade has two sides: someone taking a position, and someone providing the capital that makes it possible. BackX connects the two on-chain. <b>Hedgers</b> buy with multiplication and <b>shorters</b> sell borrowed coins; <b>issuers</b> provide the USDC and the coins that back them and earn from that activity. Everything runs in open contracts, owned by a multisig (Safe), with each coin isolated in its own set of contracts.</p>
            <BeforeAfter title="Centralized exchange compared with BackX"
              before={[['Other side of your trade', 'The exchange'], ['Custody', 'Exchange account'], ['Rules', 'Private'], ['Liquidation leftovers', 'Kept by the venue']]}
              after={[['Other side of your trade', 'Issuers, on-chain'], ['Custody', 'Your own wallet'], ['Rules', 'Open contracts'], ['Liquidation leftovers', 'Repay issuers first']]} />
          </section>

          <section id="hedge">
            <h2>Hedge</h2>
            <p>You choose a coin, an amount and a multiplication (1× to the coin's cap). The amount you type is what you pay: fees and validator gas come out of it, and the rest is your margin. Your position is margin × multiplication; the part above your margin is lent by the issuers' reserve.</p>
            <p>Each position has a liquidation price, shown before you open. If the price falls to it, the position is closed early so the lent capital goes back to the issuers first. You can also set a take-profit limit, filled by a validator.</p>
            <HedgeAnatomy />
          </section>

          <section id="short">
            <h2>Short</h2>
            <p>Old-school shorting, on-chain. You borrow the coin itself from issuers who deposited that coin, it is sold for USDC, and later exactly the same number of coins is bought back and returned. If the price fell, the difference is yours. Every swap cost, both ways, is yours too, so issuers always get the same coins back and earn USDC on top: a borrow fee and 10 % of your gain.</p>
            <p><b>Profit roof.</b> Every short has one: when the price has fallen the tier's roof, the short closes itself and your gain is paid from the position, never from issuers. The coins are bought back while the market can still sell them. You can take profit earlier, never later than the roof. If the price rises to the liquidation price, the short is closed so the issuers' coins come back first.</p>
            <ShortRoof />
            <RoofTable />
            <p className="hint">Modelled with the contract's formulas: $100 paid everything included, swap cost 0.35 % per way, issuers' share of a gain 10 %. Short margins are slightly larger than Hedge margins because a pump can gap harder than a crash (docs/backx/sim/short_roof.py: with a 0.5 s validator the issuers' coins came back in full in every scenario up to +60 % in 5 minutes).</p>
          </section>

          <section id="issue">
            <h2>Issue</h2>
            <p><b>Hedge capital (USDC).</b> Issuers deposit USDC into a coin's reserve. It is lent to hedgers and comes back first when positions close.</p>
            <p><b>Short capital (the coin).</b> Holders of a coin (PONS, BTC and every other listed coin) deposit the coin itself. It is lent to shorters and always comes back as the same number of coins. Their risk stays what it already was: the coin's price.</p>
            <p>Both earn in USDC: a borrow fee on what is lent and 10 % of traders' gains. Rewards stream in over 24 hours, are shared in proportion and are claimed whenever you like. Withdrawals are instant from free capital; the rest is queued and paid out as positions settle.</p>
            <Waterfall />
            <p><b>Liquidity Pool · DEX</b> <span className="soon-badge">Soon</span>. Issue into liquidity pools built on the same pool technology as PancakeSwap and Uniswap, tradable on DEXs, managed from one place.</p>
          </section>

          <section id="orders">
            <h2>Orders</h2>
            <p>Buy and sell orders live on-chain. A <b>buy order</b> opens a hedge when the price reaches your level (below it to buy a dip, above it for a breakout); a <b>sell order</b> opens a short the same way. Your USDC waits in the contract until a validator fills the order; you can cancel any time, and an expired order goes back to you. A short order also waits until coins are issued, so you can place it before anyone has. Take-profits close positions the same way, at most 1 % worse than your price.</p>
          </section>

          <section id="execution">
            <h2>Execution &amp; liquidation</h2>
            <p>Positions are watched every block by independent validators. On Robinhood Chain a block is about 250 ms and transactions are ordered first come, first served, so there is no public mempool to front-run. Validators settle many positions in one transaction. The points below are the launch design; the fast reference price is being added to the contracts before the audit.</p>
            <ul>
              <li><b>Fast reference price.</b> A low-latency oracle aggregated from major exchanges is the reference for triggers and fills; the validator posts the price update and the liquidation in the same transaction.</li>
              <li><b>Ahead of the pool.</b> On-chain pools follow centralized exchanges by a few seconds. Validators watch those markets, so a liquidation can land before the pool has repriced.</li>
              <li><b>Fair fills.</b> A liquidation sale must fill close to the reference price, so it cannot be sandwiched, and it must return the full lent amount whenever the coins cover it.</li>
              <li><b>Sized to sell.</b> A coin is only listed with real DEX liquidity, and position and open-interest caps are set so a crash can be sold quickly.</li>
            </ul>
            <Results />
            <LossBars />
            <p className="hint">Simulated with docs/backx/sim/flash.py (synthetic crash, modelled latencies). Loss is before the Reserve Security Fund.</p>
          </section>

          <section id="validators">
            <h2>Validators</h2>
            <p>Anyone can be a validator: a person, a bot or an AI agent, on every chain BackX runs on. Validators liquidate positions, fill take-profits, close shorts at their roof and fill buy and sell orders. There is no allow list and nothing depends on BackX servers: if ours stop, everyone else keeps the market running. Everything they do is visible on-chain.</p>
            <p><b>What a validator earns.</b> Every position puts its gas fee aside when it opens; whoever settles it gets it. On top comes an accuracy bonus, largest when the execution lands right at the trigger price and falling to zero 1 % past it. The fastest, most accurate validator earns the most, which is exactly what keeps issuers safe.</p>
            <RewardCurve />
            <div className="wp-table three" role="table" aria-label="Validator bonus by distance">
              <div className="wp-row wp-head" role="row"><span role="columnheader">Past the trigger</span><span role="columnheader" className="r">Share of max</span><span role="columnheader" className="r">$1,000 liquidation</span></div>
              {[[0, '$5.00'], [0.1, '$4.05'], [0.25, '$2.81'], [0.5, '$1.25'], [0.75, '$0.31'], [1, '$0']].map(([d, v]) => (
                <div className="wp-row" role="row" key={d}><span role="cell" className="num">{d}%</span><span role="cell" className="r num">{Math.round((d as number) >= 1 ? 0 : (1 - (d as number)) ** 2 * 100)}%</span><span role="cell" className="r num">{v} + gas</span></div>
              ))}
            </div>
            <p className="hint">Liquidation bonus up to 0.5 % of the position, from what is left for the trader after the issuers are repaid; take-profit, roof and order fills up to 0.1 %. The issuers' principal never pays a bonus.</p>
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
            <p className="hint">Simulation with modelled latencies (manual 20 s, intent fill 3 s, L1 bot 9 s, BackX validator 0.5 s), not measurements of these products. A negative time means the sale lands before the on-chain pool has repriced. Issuer loss is before the Reserve Security Fund.</p>
          </section>

          <section id="safety">
            <h2>Reserve Security Fund</h2>
            <p>Part of every hedge and every short goes into that coin's Reserve Security Fund, one for each side. It is for crises only: if a liquidation ever returns less than was lent, the fund covers the gap, so issuers are kept whole in normal and fast markets.</p>
            <p><b>Guardrails.</b> Anyone can run the liquidation that uses the fund, but nobody can draw from it directly: only that coin's contract can, and only when a confirmed liquidation cannot repay the issuers. One payment is at most a quarter of the fund and all payments in a day at most half, so no single event or bug can empty it.</p>
            <p className="wp-callout">In an extreme flash crash, a drop of 30–60 % within minutes, which is very rare, a gap can be larger than the fund. In such an event issuers can expect a small loss, shared in proportion across the pool.</p>
          </section>

          <section id="rewards">
            <h2>Rewards &amp; claims</h2>
            <p>Every reward is paid in USDC, sits in the contract and is claimed by its owner, on-chain or on the website. People and AI agents claim the same way.</p>
            <div className="wp-table three wide" role="table" aria-label="Who earns what">
              <div className="wp-row wp-head" role="row"><span role="columnheader">Who</span><span role="columnheader">Earns</span><span role="columnheader" className="r">Claim</span></div>
              {[
                ['Hedge issuers (USDC)', 'Borrow fee 0.25 % of what is lent + 10 % of hedgers\' gains', 'Reserve'],
                ['Short issuers (the coin)', 'Borrow fee 0.25 % of what is lent + 10 % of shorters\' gains, in USDC', 'Reserve'],
                ['Validators', 'Each position\'s gas + accuracy bonus', 'Manager'],
                ['Reserve Security Fund', '0.5 % of the margin + 0.03 % of what is lent', 'Crises only'],
                ['gazz.fun holders', '2 % of the margin', 'Sent at open'],
              ].map(([w, e, c]) => <div className="wp-row" role="row" key={w}><span role="cell">{w}</span><span role="cell">{e}</span><span role="cell" className="r">{c}</span></div>)}
            </div>
            <p className="hint">After a liquidation, issuers also take a share of what is left (50–90 % depending on the multiplication). Rewards stream in over 24 hours so a deposit made just before a large reward cannot take what earlier issuers earned.</p>
          </section>

          <section id="agents">
            <h2>For AI agents</h2>
            <p>Every part of BackX is a plain contract call, so agents need no API key and no BackX server. An agent can issue USDC or coins, open and close hedges and shorts, place buy and sell orders, validate other positions and claim every reward, all on-chain. Agents can also log in on the website with their own wallet.</p>
            <p><b>Recipe.</b> Find the coin's contracts, approve USDC (or the coin), then call. Amounts are in base units; prices are USD per one coin. Every row below is one call, in the order an agent uses them.</p>
            <AgentCallSheet />
          </section>

          <section id="fees">
            <h2>Fees &amp; revenue</h2>
            <p>Fees are baked into the amount a trader pays and shown as one figure, plus validator gas. They fund the issuers (borrow fee and a share of gains), the Reserve Security Fund, the validators, and the platform. Issuers get the biggest rewards; platform revenue flows back to GAZZFUN and its holders.</p>
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
