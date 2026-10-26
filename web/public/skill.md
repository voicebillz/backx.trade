---
name: backx-trade
description: Use BackX (backx.trade) on-chain contracts as an agent. Go long or short with leverage, issue USDC or coins that back traders, stake $GAZZ and Gazz Tanks, claim every reward in one transaction, and validate positions for fees. Plain EVM contract calls, no API key and no BackX server needed.
---

# BackX for agents

BackX is a trading platform where everything that matters happens in open smart contracts. An agent only needs an EVM
wallet, an RPC and this recipe. No API key, no login and no BackX server are involved in any call below.

- Address book (machine-readable, kept up to date automatically): https://www.backx.trade/agents.json
- ABIs: https://www.backx.trade/abi/BackxMarketFactory.json, BackxHedgeManager.json, BackxShortManager.json,
  BackxReserveVault.json, BackxReserveSecurityFund.json, BackxTreasury.json, BackxStaking.json
- Human docs: https://www.backx.trade/whitepaper (section "For AI agents" has the full call list as a CSV)
- Summary for language models: https://www.backx.trade/llms.txt

## 0. Before anything: is it live?

1. Fetch `agents.json`. `status` is `pre-launch` until the first Market Factory is deployed, then `live`.
2. Pick a chain from `chains[]` (launch chains have `launch: true`: Robinhood Chain 4663, BNB Chain 56, Base 8453,
   Arbitrum 42161). Every address is CREATE2, so it is known before launch.
3. Always confirm yourself with `eth_getCode(address)` before sending money: `deployed` in the file is only the last
   check (every 6 hours and on every contract change). No code = not live yet: do nothing.
4. Owner of every contract: the Safe `0xfa408F75490C0412d4a5F45FA7553Aff03249BE4`. Never send funds to any address
   that is not in `agents.json` or returned by the factory below.

## 1. Find a coin's contracts

```
factory = agents.json → chains[i].contracts.factory.address
factory.marketCount() → n;  factory.tokens(k) → coin address (k < n)
factory.setOf(coin) → (hedge, usdVault, hedgeFund, short, tokenVault, shortFund)
```
`hedge` = Long side (named "Hedge" in the contracts), `short` = Short side, `usdVault` = USDC reserve that backs longs,
`tokenVault` = the coin's own reserve that backs shorts. `short` is the zero address until the Short side is added.

Units: amounts are base units of the token. The stable is `chains[i].stable` (USDC, 6 decimals; 18 on BNB Chain).
`price()` = USD base units per 1e18 coin units.

## 2. Trade (long or short with leverage)

| Step | Call |
|---|---|
| Max leverage for an amount now | `hedge.maxMFor(amount)` / `short.maxMFor(amount)` (0 = nothing to borrow yet) |
| Approve | `usdc.approve(manager, amount)` (exact amount, never unlimited) |
| Long now | `hedge.open(amount, m, minOut, takeProfitPrice)` → position id |
| Short now | `short.open(amount, m, minOut, takeProfitPrice)` → position id (a profit roof is set automatically) |
| Take profit / stop loss | `setLimit(id, price)` / `setStop(id, price)` (0 = none; short limit 0 = back to the roof) |
| Read | `positions(id)`, `threshold(id)` (liquidation value), `isLiquidatable(id)`, `isLimitReached(id)` |
| Close | `close(id, limit)` (long: minimum USDC out; short: maximum USDC in) → USDC to you, gas refunded |
| Limit entry order | `placeOrder(m, amount, trigger, above, expiry, takeProfitPrice, slipBps)` → order id (USDC escrowed) |
| Cancel order | `cancelOrder(orderId)` → USDC back |

`amount` is everything you pay: fees and validator gas come out of it, the rest is your margin, the position is
margin × m. `m = 1` borrows nothing and cannot be liquidated. Pass 0 as `minOut` to use the oracle minus 1 %.
Leverage can lose the whole margin.

## 3. Issue (back traders, earn USDC)

| Step | Call |
|---|---|
| USDC for longs | `usdc.approve(usdVault, x)` → `usdVault.deposit(x, me)` → shares |
| The coin for shorts | `coin.approve(tokenVault, n)` → `tokenVault.deposit(n, me)` (you get the same number of coins back) |
| Rewards waiting | `vault.pendingRewards(me)` (USDC, streamed in over 24 h) |
| Claim one pool | `vault.claimRewards()` or `vault.claimRewardsTo(to)` |
| Withdraw what is free | `vault.maxWithdraw(me)` → `vault.withdraw(x, me, me)` |
| Withdraw the rest | `vault.requestRedeem(shares)` → paid straight to you as positions close; `cancelRequest(id)` undoes |

## 4. Stake $GAZZ and Gazz Tanks (Robinhood Chain)

10 % of all platform revenue goes to stakers in USDC, streamed continuously (each fee over 24 h), pro rata to points:
1 point per $GAZZ, `tankPoints()` per Tank (100,000: the 1,000 Tanks weigh the same as the 100M $GAZZ supply).

```
staking = agents.json → chains[chainId 4663].contracts.staking.address
gazz    = 0x08a5d78a4bc7754e8aff87b4509e007baeb685f3   (ERC-20, 18 decimals)
tanks   = 0x261371a1c467b82d43975cbe526c901b2a5ea9f4   (ERC-721 GAZZ TANKS)
```

| Step | Call |
|---|---|
| Once: approve $GAZZ | `gazz.approve(staking, amount)` |
| Once: approve Tanks | `tanks.setApprovalForAll(staking, true)` |
| Stake $GAZZ and/or Tanks (one tx) | `staking.stake(amount, [tankIds])` (locks everything you staked for 90 days from now) |
| Or: stake one Tank by sending it | `tanks.safeTransferFrom(me, staking, id)` |
| Read | `pointsOf(me)`, `gazzOf(me)`, `tanksOf(me)`, `tankOwner(id)`, `unlockAt(me)` (unix seconds), `earned(me)` |
| Claim (any time, also while locked) | `staking.claim()` or `staking.claimTo(to)` |
| Unstake (after `unlockAt`) | `staking.unstake(amount, [tankIds])` (reverts `Locked(until)` before; rewards are kept) |
| Push new revenue in (anyone) | `treasury.distribute(stable)` (the Treasury then calls `staking.sync()` itself) |

## 5. Claim everything in one transaction

`claimRewards()` / `claim()` pay `msg.sender`, so they cannot go through a batcher. The `...For` versions pay the
owner no matter who calls, so one Multicall3 transaction claims every pool plus staking for you:

```
Multicall3 (same address on every chain): 0xcA11bde05977b3631167028862bE2a173976CA11
aggregate3([
  { target: usdVaultA,  allowFailure: true, callData: claimRewardsFor(me) },
  { target: tokenVaultB, allowFailure: true, callData: claimRewardsFor(me) },
  { target: staking,    allowFailure: true, callData: claimFor(me) },        // Robinhood Chain only
])
```
One transaction per chain. Only call the pools where `pendingRewards(me) > 0` (or `earned(me) > 0`).
Validator rewards (`claimable(me)` → `claim()` on each manager) are paid to `msg.sender`, so claim those directly.

## 6. Validate (earn USDC for settling)

Execution is open to anyone. Watch the managers' `Opened`, `LimitSet`, `StopSet`, `OrderPlaced` events; each block
check `isLiquidatable(id)`, `isLimitReached(id)`, `isOrderFillable(orderId)`; settle many per transaction with
`liquidateBatch(ids)`, `executeLimitBatch(ids)`, `fillOrderBatch(orderIds)`. You earn that position's escrowed gas fee
plus an accuracy bonus (at least $0.50 per settlement, however late). Clearing an expired order with
`cancelOrder(orderId)` pays $0.50 too, and `treasury.distribute(stable)` pays $0.50 when at least $50 arrived.
`claimable(me)` → `claim()`. Our own validators are the reference
implementation (`keeper/` in the BackX repository).

## Safety rules for agents

- Only the wallet owner signs. Never ask for, store or send a private key or seed phrase anywhere.
- Approve exact amounts. Never approve unlimited, never approve an address that is not in `agents.json` / `setOf`.
- Check `eth_getCode` and `paused()` before money moves. Simulate (`eth_call`) every transaction before sending it.
- BackX never asks you to send funds to a person, a "support" address or a bridge. Withdrawals go only where you choose.
- Contracts are not audited yet; nothing here is financial advice and there are no promised returns.
