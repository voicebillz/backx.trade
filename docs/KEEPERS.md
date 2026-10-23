# Keepers: 50 keepers on 4 hosts (owner 2026-10-23)

A keeper watches the Position Managers on Robinhood Chain and sends `liquidateBatch` / `executeLimitBatch` when a
position is due. Code: `keeper/` (Node, viem, no BackX dependency). Why several: `docs/backx/LIVENESS.md`.

## Chains
A keeper process watches one chain (`CHAIN_ID`, its own `RPC_URLS` and `MANAGERS`). Launch chains: Robinhood Chain
(4663), BNB Chain (56), Base (8453), Arbitrum (42161). Split the 50 processes across the chains that have markets
(e.g. 12–13 per chain), each chain with its own ranks 0…n and its own gas wallets (ETH on Robinhood / Base /
Arbitrum, BNB on BNB Chain). Multicall3 exists on all four.

## How 50 keepers work together without wasting gas
- **Ranks.** Each keeper has a unique rank 0–49. Rank 0 sends in the block it sees a position due. Rank r waits
  `r × RANK_BLOCKS` blocks (default 2 ≈ 0.5 s on Robinhood Chain) and simulates first; if someone above it already
  settled the position the simulation returns 0 and it sends nothing. Tested on a local chain: the primary settles,
  backups stay silent; when the primary is stopped, rank 1 takes over two blocks later.
- **Chain only.** Positions come from the contracts' events, due-checks from `isLiquidatable` / `isLimitReached`
  (multicall3 when the chain has it, single calls otherwise; an RPC error is never read as "nothing due").
  Several RPC providers per keeper (`RPC_URLS`, comma-separated), failing ones are skipped.
- **Gas balance.** Each keeper reads the other keepers' balances on-chain (`PEERS`). The richest keeper tops up any
  keeper below `LOW_WEI` to `TARGET_WEI`; a keeper above `CAP_WEI` sweeps the excess to the treasury (`SWEEP_TO`,
  the Safe). Only the richest acts, so 50 keepers never all send at once. Defaults: low 0.0015, target 0.005,
  cap 0.02 ETH.

## Hosts (free tiers, checked 2026-10-23; terms change, check before relying on them)
| Host | Always free? | Keepers | Ranks |
|---|---|---|---|
| Railway (already paid for the API) | Paid | 13 processes in one service | 0, 4, 8, … |
| Oracle Cloud Always Free, Ampere A1 (2 OCPU / 12 GB since June 2026) + 2 AMD micro VMs | Yes | 13 | 1, 5, 9, … |
| Google Cloud e2-micro (us-west1 / us-central1 / us-east1, 1 VM) | Yes | 12 | 2, 6, 10, … |
| A fourth provider (e.g. AWS free credits, Hetzner, a second Oracle account in another region) | Credits / cheap | 12 | 3, 7, 11, … |

Ranks are interleaved so the first four ranks sit on four different providers: losing a whole provider costs at
most one rank step. Honest note: 50 processes on 4 providers are 4 independent failure domains; the extra
processes add separate keys and RPC orderings, not 50× safety. Give each host a different first RPC.
Cloudflare Workers cron (5 triggers, 1/min on the free plan) and GitHub Actions schedules are too slow for
liquidations; use them only as a last "is anything stuck?" alarm.

## Set up one keeper
1. `cd keeper && npm ci && npm run keygen -- oci-1-05` prints:
   - secret lines (`KEEPER_ID`, `KEEPER_KEY`, `REPORT_KEY`): only in that host's secret settings, never in git;
   - one public line `id:gasAddress:reportPublicKey`: add it to `KEEPERS` on Railway (comma-separated, max 64).
2. Env on the host: `RPC_URLS`, `CHAIN_ID=4663`, `MANAGERS` (Position Manager addresses), `START_BLOCK`,
   `KEEPER_RANK`, `PEERS` (all keepers' gas addresses), `SWEEP_TO` (the Safe), `REPORT_URL=https://api.backx.trade/keeper/heartbeat`.
3. Run with Docker (`keeper/Dockerfile`, pinned Node 24.22.1, non-root) or `node src/index.js` under systemd.
4. Fund the gas wallets: Admin → Keepers → "Top up low keepers" downloads a Safe Transaction Builder file; the Safe
   signs it. After that the keepers balance themselves.

## API between the keepers and Railway (optional, one-way)
`POST https://api.backx.trade/keeper/heartbeat` every minute: a JSON report signed with the keeper's own ed25519 key
(`x-keeper-id`, `x-keeper-sig`). The server checks the key from `KEEPERS`, the time (±60 s), a replay guard and a
rate limit (Redis, fails closed), and keeps the latest report for the admin portal. It is outside `/api` (machines,
not browsers) and gives keepers nothing they need: if Railway is down they keep working. Admin → Keepers shows
status, rank, gas balance (read on-chain), positions watched, sent / landed / failed and latency p50 / p95.

## Self-funding
Today each position pays a flat keeper gas fee at open (default $0.10, contract `keeperGasUsd`) into `keeperWallet`.
Make `keeperWallet` one of the keepers' gas addresses: the balancer spreads it to the others and sweeps anything
above the cap to the Safe, so keepers keep only a small buffer and the rest goes to the treasury.
Example, 1,000 positions a day: $100 a day of keeper gas income; 300 liquidations or limit fills batched into
~100 transactions at roughly $0.01–0.05 each on an L2 cost $1–5 a day; health reports are free (off-chain).
Keepers fund themselves many times over. Planned contract change (LIVENESS.md, needs owner sign-off): pay the
fee to whoever executes, so any keeper (or outside bot) earns directly.

## Speed: what is and is not guaranteed
- Measured by every keeper and shown in the admin portal: time from first seeing a position due to the
  transaction landing (p50 / p95). Target 0.5 s (EXECUTION.md). Alert if p95 > 1 s.
- Primary down: the next rank acts 2 blocks (~0.5 s) later; each further rank adds ~0.5 s.
- Not in our control: Robinhood Chain's sequencer (if it stops, nobody can settle) and the price feed's freshness.
  Speed is a target we measure, never a promise.
