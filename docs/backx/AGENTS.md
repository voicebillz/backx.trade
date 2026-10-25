# BackX for AI agents (owner 2026-10-25)

Everything an agent needs is on-chain: no API key, no BackX server. One set of contracts per coin per chain,
found with `BackxMarketFactory.setOf(token)` → `(hedge, usdVault, hedgeFund, short, tokenVault, shortFund)`.
Amounts are in base units (USDC 6 decimals; 18 on BNB Chain). Prices are USD base units per 1e18 coin units.
Agents can also log in on backx.trade with their own wallet (Privy, WalletConnect).
The whole call list as a spreadsheet: `docs/backx/agent-calls.csv` (also on the Whitepaper → For AI agents, with a
Download CSV button; source `web/src/lib/agentCalls.ts`, regenerate the CSV from it after changes).

## Issue capital
- **Hedge capital (USDC)**: `usdc.approve(usdVault, x)`, `usdVault.deposit(x, me)`.
- **Short capital (the coin itself, e.g. PONS)**: `coin.approve(tokenVault, n)`, `tokenVault.deposit(n, me)`.
  You always get the same number of coins back; you earn USDC.
- Rewards: `pendingRewards(me)`, then `claimRewards()` or `claimRewardsTo(to)`.
- Leave: `maxWithdraw(me)` is free now (`withdraw` / `redeem`); for the rest `requestRedeem(shares)`: paid straight
  to you as positions close (`cancelRequest(id)` to undo).

## Trade
| Action | Hedge (price up) | Short (price down) |
|---|---|---|
| Max multiplication for an amount now | `hedge.maxMFor(amount)` | `short.maxMFor(amount)` (0 = no coins issued yet) |
| Open now | `hedge.open(amount, m, minCoinsOut, takeProfit)` | `short.open(amount, m, minUsdOut, takeProfit)` |
| Single settle (reverts with the reason) | `liquidate(id)`, `executeLimit(id)`, `fillOrder(orderId)` | same |
| Entry order (limit buy / sell) | `hedge.placeOrder(m, amount, trigger, above, expiry, takeProfit, slipBps)` (slipBps 0 = 0.5 %) | `short.placeOrder(…)`: also waits for issued coins |
| Cancel order | `cancelOrder(orderId)` | same |
| Move take-profit | `setLimit(id, price)` (0 = none) | `setLimit(id, price)` (0 = back to the roof) |
| Close | `hedge.close(id, minUsdOut)` | `short.close(id, maxUsdIn)` |
| Read | `positions(id)`, `threshold(id)`, `isLiquidatable(id)`, `isLimitReached(id)` | same; `limitValue` starts at the roof |

`amount` is everything you pay (fees and gas come out of it). Approve the manager for `amount` first.
Slippage: pass 0 for the guards and the contract uses the oracle minus `limitSlipBps` (1 %).
Short roof: every short closes itself when the price has fallen the tier's roof (Major 80 %, Large 70 %, Mid 60 %,
Small 50 %): your gain is capped there and paid from the position, never from issuers.

## Validate (earn USDC)
See `docs/backx/VALIDATORS.md`. Watch `Opened`, `LimitSet`, `OrderPlaced`; call the `is…` views each block; send
`liquidateBatch` / `executeLimitBatch` / `fillOrderBatch`. Earn the position's gas + an accuracy bonus;
`claimable(me)` then `claim()`. The reference implementation is `keeper/` (Node, viem).

## Risks
Multiplication can lose the whole margin. Issuing is not risk-free: in a crash faster than liquidations the
Reserve Security Fund pays first, then a loss is shared by the issuers. Contracts are not audited yet.
