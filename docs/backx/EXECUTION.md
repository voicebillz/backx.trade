# Execution speed in flash crashes (2026-10-22)

Question (owner): is there a faster way to execute liquidations on-chain, ideally ahead of a market crash, and how
does our timing compare with a user swapping in MetaMask/Uniswap or an intent swap (Relay)?
Simulation: `docs/backx/sim/flash.py` (synthetic crashes at 250 ms steps, 20 seeds each). Latencies are modelled
assumptions, not measurements. Loss = share of the issuers' lent principal the sale does not return (before the
Reserve Security Fund).

## 1. Finding: today's design is too slow in a fast crash (must fix before audit)

The contract waits for two things that both lag in a crash:

1. **TWAP confirmation** (`_hedgeTriggered`): the 60 s TWAP must agree with spot within 0.25 %.
2. **2 % TWAP guard** (`_liqMinOut`, security review 2026-10-20): the sale may fill at most 2 % below the TWAP.
   While the price keeps falling, spot stays more than 2 % below the lagging TWAP, so every liquidation reverts
   until the crash stops.

| Crash | Tier | Today: sells after | Today: issuer loss | Fast oracle: sells after | Fast oracle: loss |
|---|---|---|---|---|---|
| −30 % in 10 s | Major 20× | +57 s | 22.7 % of lent | +0.5 s | 0 % |
| −30 % in 60 s | Large 5× | +64 s | 9.9 % | +0.5 s | 0 % |
| −45 % in 2 min | Mid 3× | +87 s | 14.7 % | +0.5 s | 0 % |
| −60 % in 5 min | Small 2× | +171 s | 18.8 % | +0.5 s | 0 % |

The guard protects against sandwiches but, measured against a lagging TWAP, it also blocks honest liquidations.

## 2. Recommended design: fast oracle as the reference price

- **Primary price:** a low-latency pull oracle (Pyth Lazer/Core, Chainlink Data Streams or RedStone), aggregated
  from CEX and DEX venues. The keeper posts the signed price update and the liquidation in the same transaction.
  Staleness limit ≈ 3 s; reject when the oracle's confidence interval is wide.
- **Trigger:** spot (net exit on the pool) AND the fast oracle both at or below the threshold. No TWAP wait.
- **Sandwich guard:** the sale must fill within 2 % of the **fast oracle** price (not the TWAP). A pool sandwich
  cannot move an off-chain aggregated price, so the protection stays; honest liquidations no longer revert.
- **TWAP stays** as a slow sanity bound: opening a position and limit fills still need spot, oracle and TWAP to agree,
  and a large oracle–TWAP gap pauses new opens (circuit breaker).
- **Pre-emptive signal:** the keeper also watches CEX streams; the DEX pool follows CEX by ~1–3 s, and an aggregated
  oracle already carries the CEX move, so the keeper can sell before the pool has repriced (`−1.5 s` in the sim).
- **Robinhood Chain:** 250 ms blocks and first-come-first-served sequencing: keepers send directly to the sequencer
  endpoint from low-latency hosts, two independent keepers, batches (`liquidateBatch`). Use an express lane
  (Timeboost-style) if the chain offers one.
- **Volatility mode:** when realized volatility or oracle–pool divergence spikes, pause new opens and raise the
  liquidation margin for new positions only.

Cost: the oracle fee per update (cents on L2) is paid by the keeper and covered by keeper gas.

## 3. Timing compared (−30 % in 60 s, Major 20×)

| Who sells | Sells after the trigger | Price drop at the sale | Issuer loss |
|---|---|---|---|
| BackX keeper, pre-emptive CEX signal (target) | −1.5 s (before the pool reprices) | −2.1 % | 0 % |
| BackX keeper, fast oracle (target) | +0.5 s | −2.9 % | 0 % |
| Intent-based swap bot (e.g. Relay) | +3 s | −4.1 % | 0 % |
| Bot on Ethereum L1 (12 s blocks) | +9 s | −7.6 % | 2.9 % |
| Manual swap in a wallet app (e.g. MetaMask + Uniswap) | +20 s | −15.4 % | 11.1 % |
| BackX today (TWAP confirm + 2 % TWAP guard) | +80 s | −27.9 % | 24.2 % |

Assumed latencies: manual 20 s (see, decide, confirm), intent fill 3 s, L1 bot 9 s, BackX keeper 0.5 s.

## 4. What to tell issuers

The Reserve Security Fund covers gaps first. In an extreme flash crash (30–60 % within minutes, which is very
rare) a gap larger than the fund can remain, and issuers can then expect a small loss, shared pro rata. With the
fast-oracle design the simulated gaps are zero; real markets add risks a model cannot (oracle outages, chain
congestion, empty pools), so this is never "zero risk".

## 5. To do (contracts, before audit)

1. Replace the TWAP confirm + TWAP guard in liquidations with the fast-oracle trigger and guard (keep TWAP for opens).
2. Add the oracle adapter (Pyth/Chainlink/RedStone) with staleness and confidence checks; fork tests on each chain.
3. Keeper: update+liquidate in one tx, CEX watcher, sequencer endpoint, two keepers, alerting (LIQUIDATION.md §3).
4. Re-run `flash.py` with real crash tapes (e.g. 2021-05-19, 2022-06-13, 2025-10-10) once the keeper exists.
