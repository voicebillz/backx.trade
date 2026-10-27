# Validators: 10 per chain on 5 servers (owner 2026-10-23, servers 2026-10-25)

A validator watches the Position Managers on Robinhood Chain and sends `liquidateBatch` / `executeLimitBatch` when a
position is due. Code: `keeper/` (Node, viem, no BackX dependency). Why several: `docs/backx/LIVENESS.md`.

Words (owner 2026-10-25): a **validator** is anyone who settles a position or fills an order on-chain; whoever does it
gets that position's gas fee (and, planned, the accuracy reward). The processes we run ourselves are **our
validators**. The code, image, env names and contract fields still say "keeper" (`keeper/`, `KEEPERS`,
`keeperGasUsd`, `setKeeper`); that is the same thing.

## Chains
A validator process watches one chain (`CHAIN_ID`, its own `RPC_URLS` and `MANAGERS`). Launch chains: Robinhood Chain
(4663), BNB Chain (56), Base (8453), Arbitrum (42161). Split the 50 processes across the chains that have markets
(e.g. 12–13 per chain), each chain with its own ranks 0…n and its own gas wallets (ETH on Robinhood / Base /
Arbitrum, BNB on BNB Chain). Multicall3 exists on all four.

## How 50 validators work together without wasting gas
- **Ranks.** Each validator has a unique rank 0–49. Rank 0 sends in the block it sees a position due. Rank r waits
  `r × RANK_BLOCKS` blocks (default 2 ≈ 0.5 s on Robinhood Chain) and simulates first; if someone above it already
  settled the position the simulation returns 0 and it sends nothing. Tested on a local chain: the primary settles,
  backups stay silent; when the primary is stopped, rank 1 takes over two blocks later.
- **Chain only.** Positions come from the contracts' events, due-checks from `isLiquidatable` / `isLimitReached`
  (multicall3 when the chain has it, single calls otherwise; an RPC error is never read as "nothing due").
  Several RPC providers per validator (`RPC_URLS`, comma-separated), failing ones are skipped.
- **Gas balance.** Each validator reads the other validators' balances on-chain (`PEERS`). The richest validator tops up any
  validator below `LOW_WEI` to `TARGET_WEI`; a validator above `CAP_WEI` sweeps the excess to the treasury (`SWEEP_TO`,
  the Safe). Only the richest acts, so 50 validators never all send at once. Defaults: low 0.0015, target 0.005,
  cap 0.02 ETH.

## Servers: 5 servers × 2 validators per chain (owner 2026-10-25; free terms checked 2026-10-25, they change)
| Slot | Host | Free? | Ranks on every chain |
|---|---|---|---|
| 1 | Railway (already paid for the API), Docker image service, no public domain | Paid | 0, 5 |
| 2 | Oracle Cloud Always Free, Ampere A1 (2 OCPU / 12 GB since June 2026) | Always | 1, 6 |
| 3 | Google Cloud e2-micro (us-west1 / us-central1 / us-east1) | Always | 2, 7 |
| 4 | Northflank Sandbox (2 always-on services, card check) | Yes | 3, 8 |
| 5 | Microsoft Azure B2pts v2 (750 h/month) | 12 months | 4, 9 |

Ranks are interleaved so the first five ranks sit on five providers: losing one provider costs one rank step.
Not used: Koyeb (free instance sleeps after 1 h), Render (sleeps), Fly.io (no free plan). Cloudflare Workers cron and
GitHub Actions schedules run at most once a minute: too slow for liquidations, fine as a "stuck?" alarm.

How a server is set up (step by step with copy buttons in Admin → Contracts):
1. One image for all: `ghcr.io/voicebillz/backx-keeper:latest` (amd64 + arm64, `.github/workflows/keeper-image.yml`,
   rebuilt on every change under `keeper/`). Make the package public once; it holds no secrets.
2. `docker run --rm IMAGE node src/setup.js --server oci --slot 2 --of 5 --keepers 10 --chains 4663,56,8453,42161`
   creates this server's validators (a gas key + report key each, id `oci-<chain>-<rank>`) and prints
   `KEEPER_SET=…` (secret, only on that server) and the public lines for `KEEPERS` on Railway.
   Optional env for setup: `RPC_<chainId>`, `MANAGERS_<chainId>`, `START_BLOCK_<chainId>`, `SWEEP_TO`.
3. Run `IMAGE` (default command `node src/multi.js`) with `KEEPER_SET`: it starts one validator process per entry,
   restarts a crashed one with back-off (5 s → 2 min), and idles while a chain has no MANAGERS yet.
4. Fund via Admin → Validators; check "▲ Up" there.

## Set up one validator
1. `cd keeper && npm ci && npm run keygen -- oci-1-05` prints:
   - secret lines (`KEEPER_ID`, `KEEPER_KEY`, `REPORT_KEY`): only in that host's secret settings, never in git;
   - one public line `id:gasAddress:reportPublicKey`: add it to `KEEPERS` on Railway (comma-separated, max 64).
2. Env on the host: `RPC_URLS`, `CHAIN_ID=4663`, `MANAGERS` (Position Manager addresses), `START_BLOCK`,
   `KEEPER_RANK`, `PEERS` (all validators' gas addresses), `SWEEP_TO` (the Safe), `REPORT_URL=https://api.backx.trade/keeper/heartbeat`.
3. Run with Docker (`keeper/Dockerfile`, pinned Node 24.22.1, non-root) or `node src/index.js` under systemd.
4. Fund the gas wallets: Admin → Validators → "Top up low validators" downloads a Safe Transaction Builder file; the Safe
   signs it. After that the validators balance themselves.

## API between the validators and Railway (optional, one-way)
`POST https://api.backx.trade/keeper/heartbeat` every minute: a JSON report signed with the validator's own ed25519 key
(`x-keeper-id`, `x-keeper-sig`). The server checks the key from `KEEPERS`, the time (±60 s), a replay guard and a
rate limit (Redis, fails closed), and keeps the latest report for the admin portal. It is outside `/api` (machines,
not browsers) and gives validators nothing they need: if Railway is down they keep working. Admin → Validators shows
status, rank, gas balance (read on-chain), positions watched, sent / landed / failed and latency p50 / p95.

## Key rotation (owner 2026-10-27)
Every validator gets a new gas key every 30 days (`ROTATE_DAYS`), made **on its own server**. Owner's first idea was
to make keys on Railway and send them out; rejected because one hacked Railway would then hold every key and keys
would travel over the network. What happens instead (`keeper/src/keystore.js`, `rotation()` in `keeper/src/index.js`):
1. The server makes a new key and saves it encrypted (AES-256-GCM, `KEY_SECRET` from KEEPER_SET, one per server) in
   `KEY_DIR` (a persistent volume, `/data/keys` in the image), then reads it back. Only then does money move.
2. The old key claims its validator rewards (to `SWEEP_TO` = the Safe, else the new key) and sends all its gas to
   the new key except a tiny reserve (0.00003 ETH + 3× the transfer fee, for OP-stack L1 fees). Then it switches.
3. The old key stays as **previous** (the last batch) and forwards anything that still arrives, hourly, until the
   next rotation replaces it. A handover that was cut short (crash, RPC error) is finished by that same pass.
4. The report to Railway carries `rotation: { from, to, tx }`. The API accepts the new address only after it finds
   that gas transfer from the current address to the new one on-chain (`keeper_addresses` table), so a stolen report
   key alone cannot redirect Safe funding or top-ups. Admin → Validators shows the current key, since when, and the
   previous address.
- Gas cap stays **0.02 ETH** per validator (`CAP_WEI`, owner 2026-10-27): above it the excess goes to the Safe; top-ups
  among validators use the current addresses from the report reply (not the fixed `PEERS` list, which would top up
  retired keys).
- Rotation is on when `KEY_DIR` is set. A disk that cannot be written, or a key file sealed with another
  `KEY_SECRET` (setup.js run again), turns rotation off with a log line; the validator never stops validating.
- If the API missed a whole rotation (down for 30+ days), it stays on "Rotating": set that validator's address in
  KEEPERS to the one it reports and delete its row in `keeper_addresses`.
- Keep KEEPER_SET in a password manager: without its `KEY_SECRET` the rotated keys on disk cannot be opened.
- Add contract addresses later as `MANAGERS_<chainId>` server variables (`src/multi.js`), not by running setup.js
  again (that makes new keys and a new secret).
- Railway: attach a volume at `/data/keys`, `KEY_DIR=/data/keys`, `RAILWAY_RUN_UID=0` (Railway volumes are root-owned).
  VMs: `-v /opt/backx/keys:/data/keys -e KEY_DIR=/data/keys` with the host folder owned by uid 1000.
- Tested on a local chain 2026-10-27: rotation, gas handover, restart on the new key, late funds forwarded from the
  previous key, wrong secret and unwritable disk both keep validating.

## Self-funding
Today each position pays a flat validator gas fee at open (default $0.50, contract `validation.gasUsd`, the minimum per settlement) into `keeperWallet`.
Make `keeperWallet` one of the validators' gas addresses: the balancer spreads it to the others and sweeps anything
above the cap to the Safe, so validators keep only a small buffer and the rest goes to the treasury.
Example, 1,000 positions a day: $100 a day of validator gas income; 300 liquidations or limit fills batched into
~100 transactions at roughly $0.01–0.05 each on an L2 cost $1–5 a day; health reports are free (off-chain).
Validators fund themselves many times over. Planned contract change (LIVENESS.md, needs owner sign-off): pay the
fee to whoever executes, so any validator (or outside bot) earns directly.

## Continuous staking payout (owner 2026-10-26)
10 % of platform revenue in the Treasury goes to `BackxStaking` ($GAZZ and Gazz Tanks stakers). Every hour, when at
least `DISTRIBUTE_MIN` (default 1 USDC in base units, 1e6) is pending, one of our validators calls
`Treasury.distribute(USDC)`; the Treasury passes the share on and calls `BackxStaking.sync()` itself, which spreads it
over the next 24 hours (`src/revenueShare.js`; the call is public, anyone could make it). Env on that validator only: `TREASURY`,
`USD_TOKEN`. Nothing moves until the Safe has run `Treasury.setHolders(<staking>, 1000)`.

## Speed: what is and is not guaranteed
- Measured by every validator and shown in the admin portal: time from first seeing a position due to the
  transaction landing (p50 / p95). Target 0.5 s (EXECUTION.md). Alert if p95 > 1 s.
- Primary down: the next rank acts 2 blocks (~0.5 s) later; each further rank adds ~0.5 s.
- Not in our control: Robinhood Chain's sequencer (if it stops, nobody can settle) and the price feed's freshness.
  Speed is a target we measure, never a promise.
