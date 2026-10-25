# Liquidation, listing rules and revenue (2026-10-20)

Status: recommendation + what is already built. Contracts are NOT audited and NOT deployed.

## 1. Goal

Issuers must not lose money. A hedge must be sold **before** the coins are worth less than what was lent
(the principal). Everything below serves that: find the position fast, sell it fast, sell it at a fair price.

## 2. What is built (contracts + server)

| Piece | Where | What it does |
|---|---|---|
| Liquidation margin per tier | `liqMarginBps`, server `LIQ_MARGIN` | Major 1.5 %, Large 2 %, Mid 3 %, Small 4 % of buffer above the principal |
| Caps per tier | `maxHedgeM`, server `HEDGE_CAP` | Major 20×, Large 5×, Mid 3×, Small 2× |
| TWAP confirmation | `isLiquidatable` | spot AND TWAP must both be past the liquidation price (0.25 % confirmation) |
| Price guard | `_liqMinOut` | sale fills at most `liqMaxGapBps` (2 %) below TWAP; while TWAP covers principal + 2 % the sale must return the FULL principal, otherwise it reverts |
| Balance-delta booking | `_swapIn` / `_swapOut` | what the adapter claims is ignored; only what actually arrived counts |
| Batches | `liquidateBatch`, `executeLimitBatch` | many positions per tx (≈ 227k gas each), a failed one does not block the rest |
| Validator gas | `keeperGasUsd` | $0.10 per position paid at open to the validator wallet |
| Size caps | `maxNotionalUsd`, `maxOpenHedgeUsd` + listing rules | one position ≤ 0.5 % of DEX liquidity, all open hedges ≤ 10 % (5 % recommended) |
| Backstop | Reserve Security Fund | covers a gap the sale could not close (flash crash), last resort |

## 3. Recommended setup to sell fast

1. **Two independent validators** (separate Railway services, separate RPCs, separate keys, no public domain).
   Each block: one multicall of `isLiquidatable` over all open positions, then `liquidateBatch` with every hit.
   Second validator starts a few seconds later as a fallback, never both on the same batch.
2. **Robinhood Chain** (Arbitrum Orbit): FCFS sequencer, no public mempool, so no classic front-running.
   Block time ≈ 250 ms: a liquidation lands within 1–2 seconds of the price crossing.
   Other chains: send via private RPC (MEV Blocker on Ethereum, MEV Guard on BNB) like the user swaps.
3. **Price**: TWAP 1–5 min from the coin's deepest pool (short enough to follow a real fall, long enough that one
   block cannot move it). Recommended addition: a fast external feed (Chainlink, Pyth or RedStone, whichever lists
   the coin on the chain) as a second check, with a staleness limit (e.g. 60 s); if the two disagree by > 2 %,
   only liquidate (never open).
4. **Swap adapter**: whitelisted routes only (Uniswap v3/v4 style pools set by the Safe), split large sales over
   2–3 pools; the minOut guard and the principal floor protect every route. No aggregator call data from the
   validator (the validator could otherwise pick a bad route).
5. **Crash handling**: if a sale reverts on the 2 % guard (price moving too fast), the validator retries every block
   in smaller batches. If the coin keeps falling, the Safe can widen `liqMaxGapBps` for that market (contract allows up to 50 %; recommended never above 5 %); any
   shortfall after that is paid by the Reserve Security Fund.
6. **Permissionless fallback** (`permissionlessLiquidation`): the Safe can let anyone liquidate if both validators
   are down. A bounty for outside liquidators is an OPEN decision (suggestion: 0.1 % of the position, from the
   trader's remaining margin, never from the issuers).
7. **Monitoring**: alert (Telegram/e-mail) when a validator misses 10 blocks, its gas balance < 1 day of use, a
   batch reverts twice, or the fund drops below its target. The validator swaps part of its USDC gas income to ETH
   for gas automatically.
8. **Circuit breaker** (recommended, not built): a guardian address (not the Safe, a fast hot key) that can only
   PAUSE new opens on a market. It can never move money; only the Safe unpauses.

## 4. Listing rules (enforced by the server, shown in the admin listing window)

`server/src/listing.js`, live data from GeckoTerminal (market) and GoPlus (automated on-chain token audit).
A coin that fails a required check is **rejected**: "Save and deploy" is disabled and `/deploy` returns 409.

Minimums: market cap ≥ $10M, DEX liquidity on that chain ≥ $1M, 24 h volume ≥ $500k, trading ≥ 30 days.
Token audit: verified source, not a honeypot, no buy/sell/transfer tax, no hidden mint, no hidden owner,
no pause/blacklist, no self-destruct or changeable tax. Proxy tokens = warning only (USDC/WETH-type are proxies).

| Tier | Market cap | Liquidity | Max multiplication | Min liquidation margin |
|---|---|---|---|---|
| Major | ≥ $10B | ≥ $20M | 20× | 1.5 % |
| Large | ≥ $1B | ≥ $5M | 5× | 2 % |
| Mid | ≥ $100M | ≥ $2M | 3× | 3 % |
| Small | ≥ $10M | ≥ $1M | 2× | 4 % |

The stricter of market cap and liquidity decides the tier. Max position = 0.5 % of liquidity, max open = 10 %.
Live test 2026-10-20: cbBTC on Base PASS (Large), PEPE on Ethereum REJECTED (blacklist function),
WETH on Robinhood PASS (Small: only $ liquidity on that chain counts).

## 5. Revenue at $30M volume, $10M issued

Volume = sum of opened position sizes (m × X). Fee model v4: holders 2 % of X, borrow 0.25 % of lent,
RSF 0.5 % of X + 0.03 % of lent, issuers 10 % of gains, validator gas $0.10 per position.

| Average multiplication | 3× | 5× | 10× |
|---|---|---|---|
| Margin X total | $10M | $6M | $3M |
| Lent by issuers | $20M | $24M | $27M |
| Holders 2 % (fee collector) | $200k | $120k | $60k |
| Reserve Security Fund | $56k | $37.2k | $23.1k |
| Issuers: borrow fee | $50k | $60k | $68k |
| Issuers: + 10 % of gains (est.) | $10–50k | $12–60k | $14–68k |
| **Issuers total on $10M** | **$60–100k (0.6–1.0 %)** | **$72–120k (0.7–1.2 %)** | **$81–135k (0.8–1.35 %)** |
| Validator gas (avg $250 position) | ≈ $4k | ≈ $2.4k | ≈ $1.2k |

Lent ($20–27M) is more than $10M issued: the same reserve is lent again after each position closes.
Figures are per $30M of volume, not per year; no yield is promised.

**Platform / treasury: OPEN.** Today the whole 2 % goes to one `feeCollector` address. Nothing goes to a
backx treasury yet. Suggestion: `feeCollector` = a splitter contract (owned by the Safe), e.g. 1.5 % to
gazz.fun holders and 0.5 % to the backx treasury, or make `holdersFeeBps` + a new `treasuryFeeBps` separate
fields (storage append-only). Owner decides the split.

## 5b. Proposal v5: one pot, split by shares (owner 2026-10-20, NOT built yet)

Everything earned from a position goes into one pot: the open fee (same rates as v4, so the trader pays exactly
the same), the validator gas, the 10 % share of a gain and the share of what is left after a liquidation. The pot is
split by fixed shares with issuers always the largest; the validator never gets less than the real gas.
`docs/backx/sim/sim6.py`, real 1-minute paths, both directions, pessimistic fills. $30M position volume:

| Coin, multiplication | Pot | v4 issuers (now) | B: issuers 50 % | holders 20 % | fund 15 % | treasury 10 % | validator 5 % |
|---|---|---|---|---|---|---|---|
| BTC 3× | $321k | $61k | $161k | $64k | $48k | $32k | $16k |
| BTC 5× | $231k | $71k | $115k | $46k | $35k | $23k | $12k |
| BTC 10× | $177k | $92k | $88k | $35k | $27k | $18k | $9k |
| BTC 20× | $199k | $152k | $100k | $40k | $30k | $20k | $10k |
| DOGE 3× | $336k | $76k | $168k | $67k | $50k | $34k | $17k |
| PEPE 3× | $386k | $126k | $193k | $77k | $58k | $39k | $19k |
| WIF 2× | $477k | $91k | $238k | $95k | $72k | $48k | $24k |

On $10M issued that is 0.9–2.4 % for issuers per $30M volume (v4: 0.6–1.5 %). No gap needed the fund in the
sample. Alternatives in the sim: A 45/20/15/15/5, C 40/25/15/15/5. Holders get far less than v4's flat 2 %
(which was 50–68 % of the pot at 2–5×). At 10–20× v4 already gave issuers more (liquidation shares).
Figures are per $30M of volume, not per year; no yield is promised.

## 6. Issuer withdrawal queue (built)

Issuers can always withdraw what is free (`freeIdle`). For the rest:

- `requestRedeem(shares)`: the shares move into the vault and are reserved. Whatever is free is paid at once.
- At every settlement point (`repay` after a close/liquidation, any new deposit, or `processQueue`) money that
  came back pays the queue first, FIFO, part-payments allowed, straight to the wallet that made the request.
- Reserved money is not lent again (`availableToLend` uses `freeIdle`), so the queue only grows shorter.
- `cancelRequest(id)` gives back the shares not yet paid. Rewards keep accruing on queued shares until paid.
