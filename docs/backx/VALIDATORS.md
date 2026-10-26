# Validators, rewards and claims (owner 2026-10-25)

Contracts: `contracts/src/BackxManagerBase.sol` (shared), `BackxHedgeManager.sol`, `BackxShortManager.sol`,
`BackxReserveVault.sol`, `BackxReserveSecurityFund.sol`. NOT audited, NOT deployed.

## Who is a validator
Anyone: a person, a bot or an AI agent, on every launch chain. There is no allow list. A validator calls

| What | Function (single / batch) | When it works |
|---|---|---|
| Liquidation | `liquidate(id)` / `liquidateBatch(ids)` | `isLiquidatable(id)`: the pool AND the oracle agree the position hit its trigger |
| Take-profit, short roof | `executeLimit(id)` / `executeLimitBatch(ids)` | `isLimitReached(id)`: the oracle reached the limit (or the short's roof) |
| Entry order (buy / sell) | `fillOrder(orderId)` / `fillOrderBatch(ids)` | `isOrderFillable(orderId)`: price crossed the trigger, not expired, and the reserve can lend |

Batches skip what is not due instead of reverting, so many validators can race safely: the first one settles,
the rest spend only the gas of a cheap no-op (and our own validators simulate first, so they spend nothing).
Everything is on-chain and visible: positions (`positions(id)`), orders (`orders(id)`), events `Opened`,
`Closed(id, by, kind, …)`, `OrderPlaced`, `OrderFilled`, `Rewarded(validator, id, kind, gas, bonus)`, `Claimed`.

Our own validators (code in `keeper/`, 10 per chain on 5 servers, docs/KEEPERS.md) are simply validators too.

## What a validator earns
1. **Gas**: every position escrows `validation.gasUsd` (default **$0.50**, the minimum every validator earns per settlement however late, owner 2026-10-26; max $5) when it opens. Whoever settles it
   gets it. If the owner closes the position themselves, no validator was needed and the gas goes to the Treasury (owner 2026-10-26: never refunded).
   An entry order escrows one extra gas for the validator that fills it.
2. **Accuracy bonus**: larger the closer the execution is to the trigger price, never below the late floor
   (`lateBps`, 20 % of the max bonus, owner 2026-10-26), so an overdue liquidation or fill always pays.

```
bonus = max(maxBonus · ((W − d) / W)², maxBonus · lateBps)   d = how far past the trigger, W = accuracyBps (1 %), lateBps 20 %
maxBonus: liquidation 0.5 % of the position value (liqBonusBps), fills 0.1 % (fillBonusBps), and never more than
15 % of what is left after the issuers' principal (restCapBps, owner 2026-10-25: issuers get the most)
```

| Distance past the trigger | 0 % | 0.1 % | 0.25 % | 0.5 % | 0.75 % | ≥ 1 % |
|---|---|---|---|---|---|---|
| Share of the max bonus | 100 % | 81 % | 56 % | 25 % | 20 % (floor) | 20 % (floor) |
| $1,000 position liquidated (bonus + $0.50 gas) | $5.50 | $4.55 | $3.31 | $1.75 | $1.50 | $1.50 |

## Who pays the validator, for every action (owner 2026-10-26)
Every action is paid from money set aside by the position or order itself when it was created, out of what the
trader paid. Nothing is pooled, so there is no reserve to drain, the company puts in no capital, and nobody (not the
Safe, not a hacker) can take a position's escrow: it goes only to whoever settles it, or back to the trader.

| Action | Who may do it | Paid | From |
|---|---|---|---|
| Liquidation | anyone | $0.50 + accuracy bonus (late floor 20 %) | the position's escrowed gas; bonus from the trader's rest |
| Take-profit / stop-loss / short roof | anyone | $0.50 + accuracy bonus | the position's escrowed gas; bonus from the payout |
| Fill a buy / sell (limit) order | anyone | $0.50 + accuracy bonus | the order's escrow (the order holds 2 × $0.50: one for the filler, one for the new position) |
| Clear an expired order | anyone | $0.50 | the order's escrow; the rest goes back to its owner |
| Treasury `distribute` (+ staking stream) | anyone | $0.50 when ≥ $50 arrived | the platform's part of the revenue (≤ 1 %) |
| Issuer queue `processQueue` | anyone | nothing | runs by itself at every repay, deposit and settlement |

The gas is fixed when the position or order is created, so a later change of `validation.gasUsd` never strands it.
Validators pay network gas in ETH/BNB up front per transaction and are paid back in USDC (`claim`), so a validator
needs only a small gas balance, refilled from what it earns.

Where the bonus comes from: a liquidation's bonus comes out of the trader's rest after the issuers' principal is
repaid (never out of the principal; capped by that rest). A take-profit / roof bonus comes out of the trader's
payout, an entry-order bonus out of the order's amount. Issuers are never paid less principal because of it.
The Safe can tune it (`setValidation`): gas ≤ $5, liquidation bonus ≤ 2 %, fill bonus ≤ 0.5 %, W 0.1–5 %, rest cap ≤ 50 %.

## Claims: everyone claims on-chain (or on the website)
| Who | Where the USDC waits | Claim |
|---|---|---|
| Validators (incl. our own and AI agents) | each manager: `claimable(address)` | `claim()` or `claimTo(to)` |
| Hedge issuers (USDC reserve) | the coin's USDC reserve: `pendingRewards(address)` | `claimRewards()` / `claimRewardsTo(to)` |
| Short issuers (coin reserve, e.g. PONS, BTC) | the coin's reserve, paid in USDC | `claimRewards()` / `claimRewardsTo(to)` |

Issuer rewards (borrow fee, p = 10 % of a trader's gain, s of a liquidation's rest) stream in over 24 h and are
split pro rata over the shares. Shares waiting in the withdrawal queue stop earning. Moving shares never moves
rewards already earned.

## Reserve Security Fund: crises only, with guardrails
- One fund per coin per side (Hedge, Short), fed by every position's RSF fee (0.5 % of the margin + 0.03 % of what
  is lent), shorts included.
- It pays only inside a liquidation the oracle has confirmed AND that cannot repay the issuers (a gap). Anyone can
  run that liquidation; nobody can call the fund directly.
- Caps: the manager asks for at most 50 % of that position's lent value (`maxCoverBps`); one payment is at most
  25 % of the fund (`perCoverBps`); all payments in 24 h at most 50 % of what it held when the window opened
  (`dailyBps`). The Safe can tune them between 5 % and 100 %, never switch them off. No owner withdrawal.
