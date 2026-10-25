// Keeper configuration, all from the environment (docs/KEEPERS.md). Nothing here may point at BackX servers for
// anything the keeper needs to work: the chain (several RPCs) is its only source of truth. REPORT_URL is optional.

function req(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env ${name}`);
  return v;
}
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const addr = (a, what) => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error(`${what}: invalid address ${a}`);
  return a.toLowerCase();
};
const num = (name, d) => {
  const v = process.env[name];
  if (v === undefined || v === '') return d;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a number ≥ 0`);
  return n;
};

const rpcs = list(req('RPC_URLS'));
const local = (u) => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u + '/');   // a local test chain only
for (const u of rpcs) if (!/^https:\/\//.test(u) && !/^wss:\/\//.test(u) && !local(u)) throw new Error(`RPC_URLS must be https/wss: ${u}`);

const key = req('KEEPER_KEY');
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('KEEPER_KEY must be a 0x-prefixed 32-byte hex private key');

export const config = {
  id: req('KEEPER_ID'),                                   // e.g. "oci-1-03": shown in the admin portal
  chainId: num('CHAIN_ID', 4663),                          // Robinhood Chain
  rpcs,
  key,
  managers: list(req('MANAGERS')).map((a) => addr(a, 'MANAGERS')),   // BackxPositionManager proxies to watch
  startBlock: BigInt(process.env.START_BLOCK || '0'),
  // Rank 0 sends in the block it sees a position due; rank r waits r × RANK_BLOCKS more blocks and re-checks on the
  // newest block first, so a backup only pays gas when everyone ranked above it has failed. Robinhood Chain makes
  // a block every ~250 ms: with 2 blocks per rank, rank 1 steps in after ~0.5 s, rank 3 after ~1.5 s.
  rank: num('KEEPER_RANK', 0),
  rankBlocks: num('RANK_BLOCKS', 2),
  pollMs: num('POLL_MS', 250),
  batch: num('BATCH', 40),                                  // positions per liquidateBatch / executeLimitBatch
  // Gas balance management (ETH on Robinhood Chain, in wei). Peers are the other keepers' gas wallets.
  peers: list(process.env.PEERS).map((a) => addr(a, 'PEERS')),
  target: BigInt(process.env.TARGET_WEI || '5000000000000000'),        // 0.005 ETH
  low: BigInt(process.env.LOW_WEI || '1500000000000000'),              // 0.0015 ETH: a peer below this gets topped up
  cap: BigInt(process.env.CAP_WEI || '20000000000000000'),             // 0.02 ETH: above this the excess is swept
  sweepTo: process.env.SWEEP_TO ? addr(process.env.SWEEP_TO, 'SWEEP_TO') : null,  // the Safe / keeper treasury
  // USDC rewards (validator gas + accuracy bonus) are claimed once this much is waiting, in USDC base units.
  claimMin: BigInt(process.env.CLAIM_MIN || '1000000'),                             // $1 with 6-decimal USDC
  // Optional status reports to api.backx.trade (never needed to work).
  reportUrl: process.env.REPORT_URL?.trim() || null,
  reportKey: process.env.REPORT_KEY?.trim() || null,      // ed25519 private key, PKCS#8 base64 (npm run keygen)
  reportEveryMs: num('REPORT_EVERY_MS', 60_000),
  // Weekly $GAZZ revenue share push (Treasury.distribute → gazz.fun's contract). Set on one validator per chain.
  treasury: process.env.TREASURY ? { treasury: addr(process.env.TREASURY, 'TREASURY'), usd: addr(req('USD_TOKEN'), 'USD_TOKEN') } : null,
};

if (config.reportUrl && !/^https:\/\//.test(config.reportUrl)) throw new Error('REPORT_URL must be https');
if (config.reportUrl && !config.reportKey) throw new Error('REPORT_URL needs REPORT_KEY');
if (!(config.low < config.target && config.target < config.cap)) throw new Error('Need LOW_WEI < TARGET_WEI < CAP_WEI');
