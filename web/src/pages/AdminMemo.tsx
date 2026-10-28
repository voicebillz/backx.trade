import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Mark } from '../components/Logo';
import { MARKET, AMM } from '../lib/memoData';

// Admin "Investor memo" (owner 2026-10-28): the long-form document for VCs, in English, under the pitch deck.
// Everything a fund asks in diligence: what BackX is, how a trade works, who earns what, the market next to DEXs and
// perp DEXs, why AMM liquidity is a weak foundation as bots and AI agents grow, status, risks and the round.
// "Download PDF" prints it on A4 in the current theme. Charts: one accent (the brand yellow) for the point being
// made, neutral grey for the rest, every bar labelled, so nothing relies on colour. Market numbers live in
// lib/memoData.ts with their sources. Lives in the admin chunk, which is a public file: no confidential numbers.

const DATE = 'October 2026';

// ---- small chart parts ---------------------------------------------------------------------------------------------

interface Bar { label: string; value: number; text?: string; hi?: boolean }
/** Horizontal bars, direct-labelled, the highlighted one in the accent. */
function HBars({ rows, max, unit = '' }: { rows: Bar[]; max?: number; unit?: string }) {
  const top = max ?? Math.max(...rows.map((r) => r.value));
  return (
    <div className="mm-hbars" role="table">
      {rows.map((r) => (
        <div key={r.label} className={'mm-hbar' + (r.hi ? ' hi' : '')} role="row" title={`${r.label}: ${r.text ?? r.value + unit}`}>
          <span role="rowheader">{r.label}</span>
          <span className="mm-track"><i style={{ width: `${Math.max((r.value / top) * 100, 1.5)}%` }} /></span>
          <b className="num" role="cell">{r.text ?? `${r.value}${unit}`}</b>
        </div>
      ))}
    </div>
  );
}

/** One 100 % bar split into labelled parts. */
function Split({ parts }: { parts: Bar[] }) {
  return (
    <div className="mm-split">
      <div className="mm-split-bar">{parts.map((p) => <i key={p.label} className={p.hi ? 'hi' : ''} style={{ flex: p.value }} title={`${p.label} ${p.value} %`} />)}</div>
      <div className="mm-split-legend">{parts.map((p) => <span key={p.label} className={p.hi ? 'hi' : ''}><i />{p.label} <b className="num">{p.text ?? `${p.value} %`}</b></span>)}</div>
    </div>
  );
}

function Fig({ title, children, source }: { title: string; children: ReactNode; source?: string }) {
  return (
    <figure className="mm-fig">
      <figcaption>{title}</figcaption>
      {children}
      {source && <p className="mm-src">Source: {source}</p>}
    </figure>
  );
}

const Stat = ({ v, l }: { v: string; l: string }) => <div className="mm-stat"><b className="num">{v}</b><span>{l}</span></div>;

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mm-table-wrap">
      <table className="mm-table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// ---- the document --------------------------------------------------------------------------------------------------

function Memo() {
  return (
    <article className="mm-doc">
      <header className="mm-cover">
        <p className="mm-kicker"><Mark size={22} />backx.trade</p>
        <h1>Investor memo</h1>
        <p className="mm-lead">Open, on-chain leverage trading where every position is backed by real capital, settled by anyone, and usable by people and AI agents alike.</p>
        <p className="mm-date">{DATE} · Seed round</p>
      </header>

      <section>
        <h2>1. Summary</h2>
        <div className="mm-stats">
          <Stat v="20×" l="Max leverage, Long and Short" />
          <Stat v="0.5 s" l="Liquidation target, end to end" />
          <Stat v="4" l="Launch chains, same addresses" />
          <Stat v="59 %" l="Of every trade's fees to issuers" />
        </div>
        <ul className="mm-points">
          <li><b>What:</b> a leverage market for every listed coin. Traders go Long or Short; issuers supply the capital (USDC for Longs, the coin itself for Shorts) and earn from every position; validators settle positions and are paid from each position's own escrow.</li>
          <li><b>Why it wins:</b> issuers are lenders with a protected principal, not AMM liquidity providers who bleed to arbitrage. The model gets stronger, not weaker, as bots and AI agents take over trading.</li>
          <li><b>Built for agents:</b> any AI assistant can trade, issue and claim through our MCP server or plain contract calls; the user always signs.</li>
          <li><b>Where:</b> Robinhood Chain, BNB Chain, Base and Arbitrum at launch, identical contract addresses on every chain.</li>
          <li><b>Status:</b> contracts written and tested (96 tests), trading app and demo live, MCP server live. Next: fast oracle, external audit, launch.</li>
          <li><b>The round:</b> a seed round with one lead investor, who is invited to lead or anchor the Series A.</li>
        </ul>
      </section>

      <section>
        <h2>2. The problem</h2>
        <p>Leverage is the largest market in crypto, and it still runs on two flawed models.</p>
        <Table head={['Model', 'Who takes the other side', 'The flaw']} rows={[
          ['Centralised exchanges', 'The exchange', 'Custody of user funds, opaque liquidations, accounts and API keys that agents cannot hold.'],
          ['On-chain perp DEXs', 'A shared vault or market makers', 'Vault depositors carry trader PnL; liquidations lag in fast crashes; deep books need professional market makers.'],
          ['AMM pools (spot)', 'Passive liquidity providers', 'LPs lose to arbitrage (loss-versus-rebalancing, impermanent loss) and to MEV; the more efficient the bots, the larger the loss. See section 7.'],
        ]} />
      </section>

      <section>
        <h2>3. How BackX works</h2>
        <div className="mm-flow">
          <div><b>Trader</b><span>pays margin, picks Long or Short and leverage</span></div>
          <i aria-hidden="true">⇄</i>
          <div className="core"><b>Market contract</b><span>one per coin per chain, open source</span></div>
          <i aria-hidden="true">⇄</i>
          <div><b>Issuers</b><span>lend USDC (Long) or the coin (Short), principal first</span></div>
        </div>
        <ul className="mm-points">
          <li><b>Longs</b> borrow USDC from the coin's USDC reserve and buy the coin. <b>Shorts</b> borrow the coin from the coin reserve, sell it, and buy exactly the same coins back to close.</li>
          <li><b>Issuers get their principal back first.</b> A position is liquidated while the trader's margin still covers the loan plus a buffer, so issuers only lose if price gaps a further 2.7 % (major coins at 20×) to 24 % (small coins at 2×) past the liquidation point before the sale.</li>
          <li><b>Validators</b> are open to anyone: whoever settles a liquidation, take-profit, stop-loss or order is paid that position's escrowed gas ($0.50) plus an accuracy bonus. No allow-list, no company capital at risk.</li>
          <li><b>Reserve Security Fund</b> per market, funded by every position, pays a capped amount in the rare crash the contract cannot liquidate through.</li>
          <li><b>Withdrawals:</b> free capital leaves at once; capital that is lent out queues and is paid first, in order, as positions close.</li>
        </ul>
        <Fig title="Example: a $100 Long at 10×">
          <div className="mm-long">
            <div className="you" style={{ flex: 1 }}><b className="num">$100</b><span>trader</span></div>
            <div className="lent" style={{ flex: 9 }}><b className="num">$900</b><span>lent by issuers</span></div>
          </div>
          <p className="mm-note">Position $1,000. On a gain, issuers receive 10 % and the platform 2 % of the trader's profit; on a close or liquidation, the $900 goes back to issuers first.</p>
        </Fig>
        <Table head={['Leverage caps by tier', 'Major', 'Large', 'Mid', 'Small']} rows={[
          ['Max leverage (Long and Short)', '20×', '5×', '3×', '2×'],
          ['Liquidation margin', '1.5 %', '2 %', '3 %', '4 %'],
          ['Short: max profit (auto-close at a fall of)', '80 %', '70 %', '60 %', '50 %'],
        ]} />
      </section>

      <section>
        <h2>4. Who earns what</h2>
        <Table head={['Fee', 'Rate', 'Goes to']} rows={[
          ['Platform fee', '2 % of margin (0.3 % at 1×, nothing borrowed)', 'Platform'],
          ['Borrow fee', '0.25 % of the amount lent', 'Issuers'],
          ['Safety fee', '0.5 % of margin + 0.03 % of the amount lent', 'Reserve Security Fund'],
          ['Gain share', '10 % of a trader\'s profit', 'Issuers'],
          ['Gain share', '2 % of a trader\'s profit', 'Platform'],
          ['Liquidation', '5 % of what is left, then most of the rest', 'Platform, then issuers'],
          ['Validator gas', '$0.50 per position + accuracy bonus (≤ 0.5 %, never more than 15 % of what is left)', 'Whoever settles'],
        ]} />
        <Fig title="Average split of everything a trade pays (simulation)" source="docs/backx/sim/revenue_split.py, 200,000 simulated Long positions across four coin tiers, six variants.">
          <Split parts={[{ label: 'Issuers', value: 59 }, { label: 'Platform', value: 30, hi: true }, { label: 'Safety fund', value: 7 }, { label: 'Validators', value: 4 }]} />
        </Fig>
        <p>Issuers earn the most by design: their capital makes the leverage possible. The platform keeps about 30 % of all fees, about 0.42 % of position size on average in the simulation.</p>
        <Fig title="Platform revenue at different monthly volumes (position size, simulated take 0.42 %)">
          <HBars rows={[
            { label: '$10M / month', value: 42, text: '$42k / month' },
            { label: '$100M / month', value: 420, text: '$420k / month' },
            { label: '$1B / month', value: 4200, text: '$4.2M / month', hi: true },
          ]} />
        </Fig>
      </section>

      <section>
        <h2>5. The market</h2>
        {MARKET.intro}
        {MARKET.figures}
      </section>

      <section>
        <h2>6. Competitive landscape</h2>
        <Table head={['', 'BackX', 'Perp DEX vault (e.g. GMX)', 'Order-book perp DEX (e.g. Hyperliquid)', 'AMM (e.g. Uniswap)', 'Lending (e.g. Aave)']} rows={[
          ['Who backs the trade', 'Issuers, as lenders', 'Vault LPs, as counterparty', 'Market makers', 'Passive LPs', 'Lenders'],
          ['Capital at risk from trader PnL', 'No: principal first', 'Yes', 'Market makers', 'Yes (LVR, IL)', 'No'],
          ['Leverage in one step', 'Yes, up to 20×', 'Yes', 'Yes', 'No', 'No (loop manually)'],
          ['Short with the coin itself', 'Yes', 'Synthetic', 'Synthetic', 'No', 'Borrow and sell'],
          ['Settlement open to anyone', 'Yes, paid per position', 'Keepers', 'Validators of own chain', 'n/a', 'Liquidators'],
          ['AI agents', 'MCP server + skill file', 'API', 'API', 'Contracts', 'Contracts'],
          ['Chains', '4 at launch, same addresses', 'Several', 'Own L1', 'Many', 'Many'],
        ]} />
      </section>

      <section>
        <h2>7. Why AMM liquidity is a weak foundation</h2>
        {AMM.body}
        <Table head={['', 'AMM liquidity provider', 'BackX issuer']} rows={[
          ['Loses to arbitrage on every price move', 'Yes (LVR)', 'No: lends, does not quote prices'],
          ['Exposed to sandwiches and JIT liquidity', 'Yes', 'No'],
          ['Principal', 'Can shrink with price and flow', 'Returned first on every close'],
          ['Earns from', 'Swap fees, minus losses to informed flow', 'Borrow fees + 10 % of trader gains + liquidations'],
          ['Gets worse as bots and AI agents grow', 'Yes: faster arbitrage takes more', 'No: more trading means more fees'],
        ]} />
      </section>

      <section>
        <h2>8. Product and status</h2>
        <Table head={['Part', 'Status']} rows={[
          ['Smart contracts (factory, Long and Short managers, reserves, safety fund, treasury)', 'Written, 96 tests passing in both stablecoin formats; not yet audited or deployed'],
          ['Trading app (chart terminal, Long/Short ticket, TP/SL, limit orders)', 'Built; demo mode live'],
          ['Issue page, swap, withdrawals, claim all in one signature', 'Built'],
          ['MCP server for AI agents (mcp.backx.trade) + public skill file and address book', 'Live'],
          ['Validators (10 per chain on 5 independent servers, 30-day key rotation)', 'Built; deploy at launch'],
          ['Fast pull oracle (Pyth) for liquidations', 'Next: fixes the known gap in fast crashes (simulated issuer loss falls from 10–57 % of lent to 0 %)'],
        ]} />
        <Fig title="Speed targets">
          <HBars unit=" s" rows={[
            { label: 'Open a position (issue)', value: 0.25, text: '0.25 s' },
            { label: 'Buy', value: 0.3, text: '0.3 s' },
            { label: 'Sell', value: 0.3, text: '0.3 s' },
            { label: 'Liquidation, end to end', value: 0.5, text: '0.5 s', hi: true },
          ]} />
        </Fig>
      </section>

      <section>
        <h2>9. Go to market</h2>
        <ul className="mm-points">
          <li><b>Agents first:</b> BackX is a tool every AI assistant can use (ChatGPT, Claude, Copilot) through one MCP address. Agents bring volume without a front end.</li>
          <li><b>Chains:</b> launch with Robinhood Chain, BNB Chain, Base and Arbitrum; apply to each ecosystem programme for grants and co-marketing.</li>
          <li><b>Liquidity partners:</b> DEX hooks with PancakeSwap and Uniswap so every position routes volume through their pools.</li>
          <li><b>Issuers:</b> a clear, principal-first product for holders of USDC and of the listed coins, who today can only lend for low rates or LP at a loss.</li>
        </ul>
      </section>

      <section>
        <h2>10. Risks and how they are handled</h2>
        <Table head={['Risk', 'Mitigation']} rows={[
          ['Smart contract bugs', 'External audit before launch; upgradeable per contract type by a Safe; storage append-only'],
          ['Fast crashes outrun liquidations', 'Fast pull oracle (Pyth) as trigger, liquidation price guard, Reserve Security Fund with hard caps'],
          ['Validator downtime', 'Open to anyone and paid per position; 10 of our own per chain on 5 providers'],
          ['Sandwich attacks on liquidation sales', 'Sale must return the full principal while the oracle shows it covers it, else it reverts'],
          ['Regulation', 'Non-custodial: every user has their own wallet; legal review before launch in each market'],
        ]} />
      </section>

      <section>
        <h2>11. The round</h2>
        <p>We are raising a seed round with <b>one lead investor</b>. The lead is invited to lead or anchor the Series A after launch. Terms and amount are shared directly.</p>
        <Fig title="Use of funds (proposed)">
          <HBars unit=" %" rows={[
            { label: 'Engineering', value: 35, hi: true },
            { label: 'Audit and security', value: 25 },
            { label: 'Issuer liquidity at launch', value: 15 },
            { label: 'Validators and infrastructure', value: 10 },
            { label: 'Legal and company', value: 10 },
            { label: 'Go to market', value: 5 },
          ]} />
        </Fig>
        <p className="mm-fine">This memo describes software under development. Contracts are not yet audited or deployed. Leverage can lose a trader's whole margin. Nothing here is an offer of securities or financial advice, and no returns are promised.</p>
      </section>
    </article>
  );
}

export function AdminMemo() {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    document.body.classList.add('memo-printing');
    const title = document.title;
    document.title = 'BackX Investor memo';
    const done = () => { document.body.classList.remove('memo-printing'); document.title = title; setPrinting(false); };
    addEventListener('afterprint', done, { once: true });
    print();
    return () => removeEventListener('afterprint', done);
  }, [printing]);
  return (
    <section className="card memo">
      <div className="row-between">
        <h2>Investor memo</h2>
        <button className="btn btn-primary" onClick={() => setPrinting(true)}>Download PDF</button>
      </div>
      <Memo />
      {printing && createPortal(<div className="memo-print"><Memo /></div>, document.body)}
    </section>
  );
}
