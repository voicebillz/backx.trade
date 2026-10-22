// Whitepaper (owner 2026-10-22). Plain copy, no yield promises, "multiplication" never "leverage".
// Timing figures come from docs/backx/sim/flash.py (modelled latencies, synthetic crash): keep both in sync.

/** −30 % in 60 s, Major coin at 20×: seconds from the liquidation trigger to the sale, price drop at the sale. */
const TIMING = [
  { who: 'BackX keeper, pre-emptive (CEX signal)', s: -1.5, drop: 2.1, loss: 0, ours: true },
  { who: 'BackX keeper, fast oracle', s: 0.5, drop: 2.9, loss: 0, ours: true },
  { who: 'Intent-based swap bot (e.g. Relay)', s: 3, drop: 4.1, loss: 0 },
  { who: 'Bot on Ethereum L1 (12 s blocks)', s: 9, drop: 7.6, loss: 2.9 },
  { who: 'Manual swap in a wallet app (e.g. MetaMask + Uniswap)', s: 20, drop: 15.4, loss: 11.1 },
];
const MAX_S = 20;

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
          <p className="page-sub">Hedge &amp; Issue trading on Robinhood Chain and other EVM chains. How it works, how positions are executed and how issuers are protected.</p>
        </div>
      </header>

      <div className="wp-grid">
        <nav className="wp-toc" aria-label="Contents">
          <ol>{TOC.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}</ol>
        </nav>

        <article className="wp-body">
          <section id="overview">
            <h2>Overview</h2>
            <p>Every trade has two sides: someone taking a position, and someone providing the capital that makes it possible. BackX connects the two on-chain. <b>Hedgers</b> open positions with multiplication; <b>issuers</b> provide the USDC that backs them and earn from that activity. Everything runs in open contracts, owned by a multisig (Safe), with each coin isolated in its own set of contracts.</p>
          </section>

          <section id="hedge">
            <h2>Hedge</h2>
            <p>You choose a coin, an amount and a multiplication (1× to the coin's cap). The amount you type is what you pay: fees and keeper gas come out of it, and the rest is your margin. Your position is margin × multiplication; the part above your margin is lent by the issuers' reserve.</p>
            <p>Each position has a liquidation price, shown before you open. If the price falls to it, the position is closed early so the lent capital goes back to the issuers first. You can also set a take-profit limit, filled by a keeper.</p>
          </section>

          <section id="issue">
            <h2>Issue</h2>
            <p><b>Hedge Pool.</b> Issuers deposit USDC into a coin's reserve. It is lent to hedgers and comes back first when positions close. Issuers share in traders' gains, earn a borrow fee on what is lent, and when a position falls it is closed early and the reserve is paid back first. Rewards go into the pool and are shared in proportion: nothing to claim. Withdrawals are instant from free capital; the rest is queued and paid out as positions settle.</p>
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
          </section>

          <section id="timing">
            <h2>Speed in a flash crash</h2>
            <p>Simulated crash of −30 % in 60 seconds on a major coin, position at 20×. Time from the liquidation trigger until the sale lands, and how far the price had fallen at that moment.</p>
            <div className="wp-timing" role="table" aria-label="Execution speed compared">
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
            </div>
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
            <p>$GAZZ is the core token of BackX, where future staking will live. Contract on Robinhood Chain: <span className="num wp-ca">0x08a5d78a4bc7754e8aff87b4509e007baeb685f3</span>.</p>
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
