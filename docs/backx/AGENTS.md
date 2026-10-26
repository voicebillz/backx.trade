# BackX for AI agents (owner 2026-10-25, expanded 2026-10-26)

## Where agents start (public, no login)
| URL | What | Kept current by |
|---|---|---|
| `https://www.backx.trade/skill.md` | The agent skill: a step-by-step recipe (trade, issue, stake, claim, validate, safety rules). Source `web/public/skill.md`. | Hand-written; update it with any contract change (same commit). |
| `https://www.backx.trade/agents.json` | Address book: every contract per chain, `deployed` true/false, markets per factory, status `pre-launch` / `live`. | `server/scripts/agent-manifest.js`, run by `.github/workflows/agent-manifest.yml` on every contract change and every 6 h; commits only when the chain says something changed, so agents learn about the launch automatically. |
| `https://www.backx.trade/abi/<Name>.json` | ABIs of Factory, Hedge/Short managers, Vault, Fund, Treasury, Staking. | `contracts/script/export-artifacts.py` (the mandatory step after any contract change). |
| `https://www.backx.trade/llms.txt` | Summary for language models, links the above. | Hand-written. |

All four are static files with `Access-Control-Allow-Origin: *` (web/vercel.json). They hold only public addresses.
Every address is CREATE2, so it is right before launch; agents must still confirm with `eth_getCode`.
Public addresses that live in Railway (Robinhood Chain stable, a custom factory) must also be set as GitHub
repository **variables** so the workflow sees them: `RESERVE_STABLE_4663` (+ `_SYMBOL_`, `_DECIMALS_`), `GAZZ_TANKS`,
`STAKING_TANK_POINTS`, `FACTORY_<chainId>`.

Planned, not built: MCP at `mcp.backx.trade` for a user's assistant on their own account, see `MCP-PLAN.md`.

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
- Rewards: `pendingRewards(me)`, then `claimRewards()` or `claimRewardsTo(to)`. `claimRewardsFor(owner)` (anyone may
  call it, money only goes to `owner`) lets one Multicall3 transaction claim every pool plus staking (`BackxStaking.claimFor`):
  the app's "Claim all" is one tap, one signature per chain.
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
| Stop-loss | `setStop(id, price)` below today's price (0 = none) | `setStop(id, price)` above today's price (0 = none) |
| Close | `hedge.close(id, minUsdOut)` | `short.close(id, maxUsdIn)` |
| Read | `positions(id)`, `threshold(id)`, `isLiquidatable(id)`, `isLimitReached(id)` | same; `limitValue` starts at the roof |

`amount` is everything you pay (fees and gas come out of it). Approve the manager for `amount` first.
Slippage: pass 0 for the guards and the contract uses the oracle minus `limitSlipBps` (1 %).
Short roof: every short closes itself when the price has fallen the tier's roof (Major 80 %, Large 70 %, Mid 60 %,
Small 50 %): your gain is capped there and paid from the position, never from issuers.

## Stake $GAZZ and Gazz Tanks (Robinhood Chain)
Staking address: `agents.json` → chain 4663 → `contracts.staking`. 1 point per $GAZZ, 100,000 per Tank
(`tankPoints()`), rewards in the stable streamed continuously (each fee over 24 h), 10 % of platform revenue.
- Once: `gazz.approve(staking, amount)` and/or `tanks.setApprovalForAll(staking, true)` ($GAZZ has no permit).
- Stake: `staking.stake(amount, tankIds)`: $GAZZ and Tanks in one transaction. Or send one Tank with
  `tanks.safeTransferFrom(me, staking, id)`. Every stake (re)starts a 90-day lock for everything you staked.
- Read: `pointsOf`, `gazzOf`, `tanksOf`, `tankOwner(id)`, `unlockAt(me)`, `earned(me)`.
- Claim any time (also while locked): `claim()` / `claimTo(to)`. Unstake after `unlockAt`: `unstake(amount, tankIds)`.
- Anyone can push revenue in: `treasury.distribute(stable)` (the Treasury calls `staking.sync()` itself).

## Claim everything in one transaction
`claimRewards()` and `claim()` pay `msg.sender`, so a batcher would receive the money. Use the `For` versions, which
pay the owner whoever calls: one Multicall3 (`0xcA11bde05977b3631167028862bE2a173976CA11`, every chain) `aggregate3`
with `vault.claimRewardsFor(me)` for each pool with `pendingRewards(me) > 0` and `staking.claimFor(me)` when
`earned(me) > 0`. One signature per chain. The app's "Claim all" does exactly this. Validator rewards
(`claimable(me)` → `claim()` per manager) pay `msg.sender`: claim them directly.

## Validate (earn USDC)
See `docs/backx/VALIDATORS.md`. Watch `Opened`, `LimitSet`, `OrderPlaced`; call the `is…` views each block; send
`liquidateBatch` / `executeLimitBatch` / `fillOrderBatch`. Earn the position's gas + an accuracy bonus;
`claimable(me)` then `claim()`. The reference implementation is `keeper/` (Node, viem).

## Risks
Leverage can lose the whole margin. Issuing is not risk-free: in a crash faster than liquidations the
Reserve Security Fund pays first, then a loss is shared by the issuers. Contracts are not audited yet.
