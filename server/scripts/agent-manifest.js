#!/usr/bin/env node
// Writes web/public/agents.json: the machine-readable address book agents start from (owner 2026-10-26, served at
// https://www.backx.trade/agents.json next to /skill.md). Every address follows from the exact init code (CREATE2),
// so the book is right before launch; with --check it also reads each chain and marks what is really deployed and
// how many markets each factory has. .github/workflows/agent-manifest.yml runs it on every contract change and every
// 6 hours and commits the file when something changed, so agents learn about a launch without anyone editing docs.
// Read-only: eth_getCode / eth_call only, no keys, no database.
import { writeFileSync, readFileSync } from 'node:fs';
import { CHAINS, LAUNCH_CHAIN_IDS, SAFE, ethCall, decodeUint } from '../src/chains.js';
import {
  IMPLS, TREASURY, CREATE2_DEPLOYER, ARTIFACTS_COMMIT, STAKING_CHAIN, stakingConfig, factoryInitcode, create2Address, getCode, selector,
} from '../src/deployments.js';
import { GAZZ, TANKS } from '../src/stake.js';

const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';
const check = process.argv.includes('--check');
const out = new URL('../../web/public/agents.json', import.meta.url);
let prev = null;
try { prev = JSON.parse(readFileSync(out, 'utf8')); } catch { /* first run */ }
const before = (chainId, a) => {
  const c = prev?.chains?.find((x) => x.chainId === chainId);
  return Object.values(c?.contracts ?? {}).find((x) => x.address === a)?.deployed ?? null;
};
// null = not checked; a failed RPC read keeps the last known answer so a flaky RPC does not flip the file.
const live = async (chainId, a) => (check && a ? getCode(chainId, a).catch(() => before(chainId, a)) : null);

const chains = [];
for (const [id, c] of Object.entries(CHAINS).map(([k, v]) => [Number(k), v])) {
  // Factory proxy with the default settings (fee collector = the Treasury). FACTORY_<id> overrides, like the portal.
  const env = process.env[`FACTORY_${id}`]?.trim().toLowerCase();
  const factory = env || (c.stable ? create2Address(factoryInitcode(c.stable.address, { feeCollector: TREASURY })) : null);
  const [treasuryLive, factoryLive, multicallLive] = await Promise.all([live(id, TREASURY), live(id, factory), live(id, MULTICALL3)]);
  let markets = null;
  if (factoryLive) {
    try { markets = Number(decodeUint(await ethCall(id, factory, selector('marketCount()')))); } catch { markets = null; }
  }
  const entry = {
    chainId: id, name: c.name, launch: LAUNCH_CHAIN_IDS.includes(id), rpc: c.rpc, explorer: c.explorer,
    stable: c.stable ? { symbol: c.stable.symbol, address: c.stable.address.toLowerCase(), decimals: c.stable.decimals } : null,
    contracts: {
      treasury: { address: TREASURY, deployed: treasuryLive },
      factory: { address: factory, deployed: factoryLive, markets },
      multicall3: { address: MULTICALL3, deployed: multicallLive },
    },
  };
  if (id === STAKING_CHAIN) {
    const sc = stakingConfig(id);
    const addr = sc?.address ?? null;
    entry.contracts.staking = { address: addr, deployed: await live(id, addr), gazz: GAZZ, tanks: TANKS, tankPoints: sc?.tankPoints ?? (process.env.STAKING_TANK_POINTS?.trim() || '100000'), lockDays: 90 };
  }
  chains.push(entry);
}

const book = {
  name: 'BackX', site: 'https://www.backx.trade', app: 'https://app.backx.trade',
  skill: 'https://www.backx.trade/skill.md', docs: 'https://www.backx.trade/whitepaper', abi: 'https://www.backx.trade/abi/',
  status: chains.some((c) => c.contracts.factory.deployed) ? 'live' : 'pre-launch',
  note: 'Addresses are CREATE2 and known before launch. deployed: true = code found on-chain at the last check, false = not yet, null = not checked. Always confirm with eth_getCode before sending money.',
  owner: { safe: SAFE }, create2Deployer: CREATE2_DEPLOYER, artifactsCommit: ARTIFACTS_COMMIT,
  implementations: Object.fromEntries(IMPLS.filter((i) => i.key !== 'treasury').map((i) => [i.key, i.address])),
  chains,
};
const text = JSON.stringify(book, null, 2) + '\n';
let old = '';
try { old = readFileSync(out, 'utf8'); } catch { /* first run */ }
if (old !== text) writeFileSync(out, text);
console.log(old === text ? 'agents.json unchanged' : 'agents.json written', book.status);
