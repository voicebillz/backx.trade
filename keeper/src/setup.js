// Makes everything one server needs to run several keepers (docs/KEEPERS.md):
//   node src/setup.js --server oci --slot 1 --of 5 --keepers 10 --chains 4663,56,8453,42161 [--report https://api.backx.trade/keeper/heartbeat]
// For each chain this server runs its share of the 10 ranks (slot 1 of 5 → ranks 0 and 5), with a fresh gas key and
// report key per keeper. Prints:
//   - KEEPER_SET=…  one secret env line for this server only (base64 JSON; never commit, never paste anywhere public)
//   - the public lines for Railway KEEPERS (id:gasAddress:reportPublicKey)
// RPCs and Position Manager addresses per chain come from env RPC_<chainId> / MANAGERS_<chainId>, or can be added
// later by re-running with them set.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const server = arg('server', 'srv');
const slot = Number(arg('slot', '1')), of = Number(arg('of', '5')), total = Number(arg('keepers', '10'));
const chains = arg('chains', '4663').split(',').map(Number);
const report = arg('report', 'https://api.backx.trade/keeper/heartbeat');
if (!/^[a-z0-9]{1,12}$/.test(server) || !(slot >= 1 && slot <= of) || !(total >= of)) throw new Error('bad --server / --slot / --of / --keepers');

const DEFAULT_RPC = {
  4663: 'https://rpc.mainnet.chain.robinhood.com', 56: 'https://bsc-dataseed.bnbchain.org',
  8453: 'https://mainnet.base.org', 42161: 'https://arb1.arbitrum.io/rpc',
};
// One secret per server that encrypts its rotated keys on its own disk (KEY_DIR, docs/KEEPERS.md "Key rotation").
const keySecret = randomBytes(32).toString('base64');
const set = [], pub = [];
for (const chainId of chains) {
  // Interleave ranks across servers: slot s gets s−1, s−1+of, … so the first ranks sit on different servers.
  const ranks = []; for (let r = slot - 1; r < total; r += of) ranks.push(r);
  const keepers = ranks.map((rank) => {
    const key = generatePrivateKey();
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const id = `${server}-${chainId}-${String(rank).padStart(2, '0')}`;
    pub.push(`${id}:${privateKeyToAddress(key)}:${publicKey.export({ format: 'der', type: 'spki' }).toString('base64')}`);
    return { id, chainId, rank, key, address: privateKeyToAddress(key), reportKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') };
  });
  for (const k of keepers) {
    set.push({
      KEEPER_ID: k.id, CHAIN_ID: String(chainId), KEEPER_RANK: String(k.rank), KEEPER_KEY: k.key, REPORT_KEY: k.reportKey,
      REPORT_URL: report, RPC_URLS: process.env[`RPC_${chainId}`] || DEFAULT_RPC[chainId] || '',
      MANAGERS: process.env[`MANAGERS_${chainId}`] || '', START_BLOCK: process.env[`START_BLOCK_${chainId}`] || '0',
      PEERS: keepers.map((x) => x.address).join(','), SWEEP_TO: process.env.SWEEP_TO || '', KEY_SECRET: keySecret,
    });
  }
}
console.log(`# ---- secret: only in this server's settings (env var / env file) ----\nKEEPER_SET=${Buffer.from(JSON.stringify(set)).toString('base64')}\n`);
console.log(`# ---- public: add to Railway KEEPERS (comma-separated) ----\n${pub.join(',')}`);
