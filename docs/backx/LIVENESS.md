# Liveness: BackX keeps working when our servers do not (2026-10-23)

Owner question: if our server (or the website) is down, what happens to positions that should be liquidated, to
issuer money, to execution speed? Goal: nothing that protects money may depend on BackX infrastructure.

Principle: **our servers are a convenience, never a requirement.** Every action that protects money must be
(1) callable by anyone, (2) paid for by the protocol so someone always wants to call it, and (3) decided only by
on-chain state plus a price that anyone can post.

## 1. What happens today if our validator is down (contracts as written, not deployed)

| Action | Who can do it today | If our validator is down |
|---|---|---|
| Liquidate / `liquidateBatch` | Validators only, unless the Safe turns on `permissionlessLiquidation` (off by default) | **Nobody liquidates.** Losses grow past the trader's margin into the issuers' principal; the RSF covers first, then issuers lose. |
| Take-profit fill (`executeLimit`) | Validators only (same flag) | Limits are not filled. |
| Trader closes own position (`close`) | The owner, any time (pause never blocks it) | Works, if the user can sign (Privy wallet or exported key) and finds the contract (explorer). |
| Issuer withdraws free money / `requestRedeem` | The issuer, any time | Works. |
| Pay the withdrawal queue (`processQueue`) | Anyone | Works, but nobody is paid to call it. |
| Open a position | Anyone (pause blocks only this) | Works. |

`pause()` only blocks new opens: close, liquidate, limit fills and withdrawals cannot be frozen. Keep it that way
(test it). The weak point is liquidation: it is gated to our validator and nobody else is rewarded for doing it.

## 2. Design: four layers, each enough on its own

### Layer 0: the contract guarantees it (required before audit)
1. **Permissionless from day one.** `liquidate`, `liquidateBatch`, `executeLimit(Batch)` and `processQueue` are
   open to any address. Safety does not come from *who* calls but from the checks inside: the trigger, the price
   guard (sale within 2 % of the reference price and full principal back when the coins cover it) and balance-delta
   accounting already make a hostile caller harmless.
2. **The protocol pays whoever does the work.** Validator gas (flat $0.50 per position, escrowed, minimum per settlement) is sent to our validator
   wallet at open. Instead hold it in the contract per position and pay it to **whoever** closes, liquidates or fills
   it. Add a small liquidation bonus on top (e.g. 0.25 % of the position, capped, taken from what the trader would
   keep, never from the issuers' principal). Any liquidation bot, MEV searcher or user then earns money by keeping
   BackX safe, exactly how Aave, Compound and Morpho stay safe without their teams online.
3. **A price anyone can post.** The fast reference price (Pyth, chosen 2026-10-22) is a pull oracle: the caller
   includes the signed price update in the same transaction, fetched from Pyth's public Hermes service, not from us.
   Second source: Chainlink Data Streams / Data Feeds, which are live on Robinhood Chain from mainnet day one.
   If both are stale, liquidation still works on the slower on-chain TWAP path (wider guard), so liquidations slow
   down but never stop; new opens pause automatically while prices are stale.
4. **Findable without our indexer.** Positions emit `Opened`/`Closed` events and expose `isLiquidatable(id)` /
   `isLimitReached(id)`, so any bot can rebuild the list from the chain alone. Optionally an on-chain list of open
   ids per market (costs gas and contract size; decide with the size work below).
5. **No surprise changes.** Upgrades (beacons, factory) go through a timelock (e.g. 48 h) so everyone can exit before
   new code applies. Open decision since 2026-10-19.

### Layer 1: many independent executors
- **Our validators, not one server:** at least two validator services on different providers (Railway + another cloud),
  each with its own key, its own funded gas wallet and a different RPC provider (Robinhood public RPC plus e.g.
  Chainstack / GetBlock / Alchemy). Either one alone keeps the system safe. Alerts if any liquidatable position is
  older than a few blocks.
- **Open-source validator:** publish the validator script so anyone can run it; with Layer 0 rewards it pays for itself.
- **Third-party bots:** liquidation searchers find BackX through the events and the reward.
- **Automation networks** (Gelato, Chainlink Automation): neither is confirmed on Robinhood Chain yet (checked
  2026-10-23). Ask both (PARTNERS.md); add whichever arrives as an extra executor, never as the only one.

### Layer 2: users without the website
- Contracts verified on the explorer, so close / withdraw / requestRedeem work from the explorer's "Write contract".
- A static copy of the app on IPFS (with an ENS name), with no backend: it reads the chain and signs with the user's key.
- Privy key export documented (Profile → Security). Note: signing inside the app depends on Privy; exporting the key
  removes that dependency.

### Layer 3: the chain itself (cannot be removed, only handled)
Robinhood Chain is an Arbitrum Orbit L2 with one sequencer run by Robinhood. If it stops, nobody can liquidate,
not only us. L2BEAT notes there is no guaranteed forced-inclusion path on Robinhood Chain (transaction filtering).
Handling: a sequencer-uptime check; after a restart, a short grace period where opens stay paused while prices
settle, liquidations allowed, the RSF covers gaps. This is a chain risk issuers must be told about (Risks section).

## 2b. Orders that already sit on-chain (owner question 2026-10-23: no validator at all?)

An EVM chain never runs code by itself: every change needs someone's transaction. What we *can* do is make the
market's own trades carry out our orders, so no BackX validator is needed:

| Order | Keeperless on-chain form | Executed by |
|---|---|---|
| Take-profit (sell above a price) | Range order: the position's coins sit as single-sided liquidity just above the target in our hooked Uniswap v4 / PancakeSwap Infinity pool; buyers swapping through the range turn them into USDC | Every trader who pushes the price up. A hook (`afterSwap`) marks the order filled and pulls the liquidity out in the same transaction, so it cannot convert back if the price falls again |
| Entry limit (buy below a price) | Range order: USDC sits as single-sided liquidity just below the target; sellers turn it into the coin | Every trader who pushes the price down; the hook opens the position |
| Liquidation / stop-loss (sell when the price falls) | Not possible as passive liquidity (coins can only rest above the price). Instead the pool's hook checks, after each swap, the positions whose liquidation price that swap crossed and settles a bounded number of them inside that same transaction | Whoever moves the price down, including arbitrage bots that copy a CEX crash into the pool. Backed by the permissionless liquidate + bonus (Layer 0) for everything the hook does not reach |

Limits: range orders fill gradually across their range (fill price = average of the range, set narrow), and only
on trading in our pool; a liquidation-checking hook adds gas to swaps, so aggregators may route around the pool if
it is heavy (cap it to a few positions per swap, skip when nothing is due). Robinhood Chain's sequencer still has
to be running. Plan: put this in the DEX hook spec (not written yet) as an extra executor next to Layers 0 and 1,
never as the only one.

## 3. What changes, and in what order
1. Contracts (needs owner sign-off; together with the 24 KB size fix, i.e. removing Short or splitting the
   manager, and the Pyth integration already planned):
   - remove the keeper-only gate (or initialise `permissionlessLiquidation = true`);
   - escrow validator gas per position and pay it to the executor; add the capped liquidation bonus;
   - Pyth update-and-liquidate in one call, Chainlink second source, TWAP fallback, stale-price auto-pause of opens;
   - tests: pause never blocks exits; a random address can liquidate/fill/process the queue; a hostile caller cannot
     make a sale worse than the guard; liquidation still works with the fast oracle stale.
2. Validator service: two instances, two clouds, two RPCs, alerts; publish the script.
3. Timelock on upgrades.
4. IPFS mirror of the app; "exit without the website" guide in the docs.
5. Re-run `sim/flash.py` with: our validators down, only third-party bots (slower, e.g. 2–12 s) and the fast oracle.

## 4. What issuers should hear
BackX does not need its own servers to liquidate or to return issuer money: the contracts pay anyone to do it and
use a public price. The remaining shared risk is Robinhood Chain itself being down. Never "zero risk".

Sources checked 2026-10-23: Chainlink services live on Robinhood Chain (CCIP, Data Streams, Data Feeds); no public
confirmation of Gelato or Chainlink Automation on Robinhood Chain; L2BEAT Robinhood Chain page (sequencer, forced inclusion).
