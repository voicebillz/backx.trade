import { readFileSync } from 'node:fs';
import { keccak_256 } from '@noble/hashes/sha3.js';
// Postgres is loaded only where it is used, so scripts (scripts/agent-manifest.js) can use the address maths without a
// database or server env.
const pg = () => import('./db.js').then((m) => m.db);
import { CHAINS, SAFE, ethCall, pad, padAddr, decodeUint } from './chains.js';

// Core contracts per chain (owner 2026-10-22, admin portal "Contracts"). The portal never deploys with a key: it
// builds a Safe Transaction Builder file that calls the deterministic CREATE2 deployer (same address on every EVM
// chain). The new address follows from the init code alone, so the portal knows it before the Safe signs and
// detects the deployment by reading the chain. Init code comes from contracts/script/export-artifacts.py.

const ART = JSON.parse(readFileSync(new URL('./artifacts.json', import.meta.url), 'utf8'));
export const ARTIFACTS_COMMIT = ART._meta?.sourceCommit ?? null;

/** Arachnid deterministic deployment proxy: calldata = salt (32 bytes) ++ init code. */
export const CREATE2_DEPLOYER = '0x4e59b44847b379578588920ca78fbf26c0b4956c';
const hex = (b) => Buffer.from(b).toString('hex');
const bytes = (h) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ''), 'hex'));
const keccak = (h) => hex(keccak_256(bytes(h)));
const SALT = keccak(Buffer.from('backx.v1').toString('hex'));
/** EIP-170: no contract may be larger than this on any of our chains. */
export const MAX_RUNTIME = 24_576;

export function create2Address(initcode) {
  return '0x' + keccak('ff' + CREATE2_DEPLOYER.slice(2) + SALT + keccak(initcode)).slice(24);
}

const sel = (sig) => keccak(Buffer.from(sig).toString('hex')).slice(0, 8);
/** 4-byte selector of a Solidity signature, 0x-prefixed. */
export const selector = (sig) => '0x' + sel(sig);
const FACTORY_INIT = sel('initialize(address,address,address,address,address,address,address)');
const MARKET_COUNT = '0x' + sel('marketCount()');

/** Holders' share of platform fees at deploy (10 %, owner 2026-10-25; the Safe can lower it, or raise it to at most 50 %). */
const TREASURY_HOLDER_BPS = 1_000;

/** The implementations and the Treasury: identical on every chain, so they get the same address everywhere. */
export const IMPLS = [
  { key: 'vaultImpl', artifact: 'BackxReserveVault', label: 'Issue Reserve', role: 'Issuers\' capital: USDC for hedges, the coin itself for shorts (ERC-4626, withdrawal queue, claimable USDC rewards).' },
  { key: 'fundImpl', artifact: 'BackxReserveSecurityFund', label: 'Reserve Security Fund', role: 'Crisis cover when a crash cannot be liquidated in time, with per-payment and daily caps.' },
  { key: 'hedgeImpl', artifact: 'BackxHedgeManager', label: 'Hedge Manager', role: 'Opens, closes and liquidates hedges; open validators, take-profits, buy orders, claims.' },
  { key: 'shortImpl', artifact: 'BackxShortManager', label: 'Short Manager', role: 'Borrow-and-sell shorts with a profit roof; open validators, take-profits, sell orders, claims.' },
  { key: 'factoryImpl', artifact: 'BackxMarketFactory', label: 'Market Factory (code)', role: 'Code behind the factory proxy (UUPS).' },
  // Platform Treasury (owner 2026-10-25): the fee collector of every market on the chain. Constructor (Safe, holders'
  // share in bps), so the same address on every chain. Not upgradeable.
  { key: 'treasury', artifact: 'BackxTreasury', kind: 'core', args: padAddr(SAFE) + pad(TREASURY_HOLDER_BPS), label: 'Treasury',
    role: 'All platform fees in USDC. 10 % goes to $GAZZ and Gazz Tanks stakers (setHolders → staking); only the Safe withdraws the rest.' },
].map((c) => {
  const initcode = ART[c.artifact].initcode + (c.args ?? '');
  return { kind: 'implementation', ...c, initcode, runtimeSize: ART[c.artifact].runtimeSize, address: create2Address(initcode) };
});
/** $GAZZ + Gazz Tanks staking (owner 2026-10-26): lives where $GAZZ lives (Robinhood Chain) and receives the Treasury's
 *  holder share in that chain's stable. Constructor (gazz, tanks, usd, tankPoints); no owner, nothing to configure later.
 *  One Tank counts as 100,000 $GAZZ (owner 2026-10-26): 1,000 Tanks weigh the same as the 100M $GAZZ supply
 *  (STAKING_TANK_POINTS, whole $GAZZ). Stakes are locked 3 months (contract LOCK). */
export const STAKING_CHAIN = 4663;
const GAZZ = '0x08a5d78a4bc7754e8aff87b4509e007baeb685f3';
export function stakingConfig(chainId) {
  if (chainId !== STAKING_CHAIN) return null;
  // GAZZ TANKS on Robinhood Chain (OpenSea gazztanks; ERC-721, 1,000, checked on-chain 2026-10-26). GAZZ_TANKS overrides.
  const tanks = process.env.GAZZ_TANKS?.trim().toLowerCase() || '0x261371a1c467b82d43975cbe526c901b2a5ea9f4';
  const whole = process.env.STAKING_TANK_POINTS?.trim() || '100000';
  const usd = CHAINS[chainId].stable?.address?.toLowerCase() || null;
  const missing = [];
  if (!tanks || !/^0x[0-9a-f]{40}$/.test(tanks)) missing.push('Gazz Tanks NFT contract address (GAZZ_TANKS on Railway).');
  if (!usd) missing.push(`Reserve stablecoin on ${CHAINS[chainId].name} (RESERVE_STABLE_${chainId}).`);
  if (!/^\d{1,12}$/.test(whole)) missing.push('STAKING_TANK_POINTS must be a whole number of $GAZZ.');
  if (missing.length) return { missing };
  const initcode = ART.BackxStaking.initcode + padAddr(GAZZ) + padAddr(tanks) + padAddr(usd) + pad(BigInt(whole) * 10n ** 18n);
  return { initcode, address: create2Address(initcode), tanks, usd, tankPoints: whole, runtimeSize: ART.BackxStaking.runtimeSize };
}

/** The Treasury's address (same on every chain): the default fee collector for the factory. */
export const TREASURY = IMPLS.find((c) => c.key === 'treasury').address;

/** ERC1967Proxy(factoryImpl, initialize(safe, usd, vault, fund, hedge, short, feeCollector)). */
export function factoryInitcode(usdAddr, cfg) {
  const a = Object.fromEntries(IMPLS.map((c) => [c.key, c.address]));
  const init = FACTORY_INIT + padAddr(SAFE) + padAddr(usdAddr) + padAddr(a.vaultImpl) + padAddr(a.fundImpl) + padAddr(a.hedgeImpl)
    + padAddr(a.shortImpl) + padAddr(cfg.feeCollector);
  const len = init.length / 2;
  const args = padAddr(a.factoryImpl) + pad(64) + pad(len) + init.padEnd(Math.ceil(len / 32) * 64, '0');
  return ART.ERC1967Proxy.initcode + args;
}

export async function getCode(chainId, address) {
  const r = await fetch(CHAINS[chainId].rpc, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [address, 'latest'] }),
  });
  const j = await r.json();
  if (j.error || typeof j.result !== 'string') throw new Error('rpc');
  return j.result.length > 2;
}
const hasCode = (chainId, address) => getCode(chainId, address).catch(() => null); // null = could not read

/** Factory on a chain: Railway FACTORY_<id> wins, else the one the portal saw deployed. */
export async function factoryAddress(chainId) {
  const env = process.env[`FACTORY_${chainId}`]?.trim();
  if (env && /^0x[0-9a-fA-F]{40}$/.test(env)) return env.toLowerCase();
  const { rows } = await (await pg()).query(`select address from core_contracts where chain_id = $1 and name = 'factory' and status = 'deployed'`, [chainId]);
  return rows[0]?.address ?? null;
}

/** Status of every core contract on one chain, read from the chain (and remembered once deployed). */
export async function chainStatus(chainId) {
  const chain = CHAINS[chainId];
  const db = await pg();
  const { rows } = await db.query('select * from core_contracts where chain_id = $1', [chainId]);
  const rec = Object.fromEntries(rows.map((r) => [r.name, r]));
  const [safeOk, deployerOk, ...implCode] = await Promise.all([
    hasCode(chainId, SAFE), hasCode(chainId, CREATE2_DEPLOYER), ...IMPLS.map((c) => hasCode(chainId, c.address)),
  ]);

  const items = IMPLS.map((c, i) => ({
    key: c.key, label: c.label, role: c.role, kind: c.kind, address: c.address, runtimeSize: c.runtimeSize,
    status: implCode[i] ? 'deployed' : rec[c.key]?.status === 'proposed' ? 'proposed' : 'ready',
    blocked: [],
  }));
  for (const it of items) {
    if (it.status === 'deployed') continue;
    if (it.runtimeSize > MAX_RUNTIME) it.blocked.push(`Too large to deploy: ${(it.runtimeSize / 1024).toFixed(1)} KB, the limit is 24 KB. The contract must be split or slimmed first.`);
    if (!safeOk) it.blocked.push(`The Safe does not exist on ${chain.name} yet.`);
    if (!deployerOk) it.blocked.push(`The CREATE2 deployer is not on ${chain.name}.`);
  }

  // Factory proxy: the address depends on its settings, so it is known once the portal has prepared it.
  const f = rec.factory;
  const envFactory = process.env[`FACTORY_${chainId}`]?.trim()?.toLowerCase() || null;
  const fAddr = f?.address ?? envFactory;
  const fCode = fAddr ? await hasCode(chainId, fAddr) : false;
  const factory = {
    key: 'factory', label: 'Market Factory', kind: 'proxy', role: 'Creates each coin\'s Hedge and Short sides (reserve, fund, manager) in one Safe transaction.',
    address: fAddr, runtimeSize: null, status: fCode ? 'deployed' : f?.status === 'proposed' ? 'proposed' : 'ready', blocked: [], config: f?.config ?? null,
  };
  if (factory.status !== 'deployed') {
    const missing = items.filter((i) => i.status !== 'deployed').map((i) => i.label);
    if (missing.length) factory.blocked.push(`Deploy first: ${missing.join(', ')}.`);
    if (!chain.stable) factory.blocked.push(`Reserve stablecoin on ${chain.name} is not chosen yet (RESERVE_STABLE_${chainId}).`);
  }
  if (fCode) {
    try { factory.markets = Number(decodeUint(await ethCall(chainId, fAddr, MARKET_COUNT))); } catch { factory.markets = null; }
  }

  // Staking (Robinhood Chain only): its address follows from the Tanks contract and the stable, so it waits for both.
  const sc = stakingConfig(chainId);
  if (sc) {
    const code = sc.address ? await hasCode(chainId, sc.address) : false;
    items.push({
      key: 'staking', label: '$GAZZ staking', kind: 'core', address: sc.address ?? null, runtimeSize: sc.runtimeSize ?? null,
      role: `Stake $GAZZ and Gazz Tanks (locked 3 months), earn the Treasury's holder share in USDC (streamed continuously, each fee over 24 h).${sc.tankPoints ? ` One Tank counts as ${Number(sc.tankPoints).toLocaleString('en-US')} $GAZZ.` : ''} After deploy, the Safe points the Treasury at it (setHolders).`,
      status: code ? 'deployed' : rec.staking?.status === 'proposed' ? 'proposed' : 'ready',
      blocked: code ? [] : [...(sc.missing ?? []), ...(!safeOk ? [`The Safe does not exist on ${chain.name} yet.`] : [])],
    });
  }

  // Remember what is live (read-only bookkeeping; the chain stays the source of truth).
  const live = [...items, factory].filter((i) => i.status === 'deployed' && i.address && rec[i.key]?.status !== 'deployed');
  for (const i of live) {
    await db.query(
      `insert into core_contracts (chain_id, name, address, status, created_by, deployed_at) values ($1, $2, $3, 'deployed', 'chain', now())
       on conflict (chain_id, name) do update set status = 'deployed', address = excluded.address, deployed_at = now()`,
      [chainId, i.key, i.address]);
  }

  return {
    chainId, name: chain.name, explorer: chain.explorer, stable: chain.stable, safePrefix: chain.safePrefix,
    safe: safeOk, deployer: deployerOk, items: [...items, factory],
    // DEX pools (Uniswap v4 / PancakeSwap Infinity hook): designed, not written yet. Shown so the gap is visible.
    planned: [{ key: 'dexHook', label: 'DEX pool hook', role: 'Uniswap v4 / PancakeSwap Infinity hook for issued liquidity pools.', note: 'Not written yet: no contract to deploy.' }],
  };
}

/** One Safe Transaction Builder file: a single call to the CREATE2 deployer with salt ++ init code. */
export function safeBatch(chainId, label, initcode) {
  return {
    version: '1.0', chainId: String(chainId), createdAt: Date.now(),
    meta: { name: `backx: deploy ${label} on ${CHAINS[chainId].name}`, description: `CREATE2 via ${CREATE2_DEPLOYER}, salt backx.v1. Owned by the Safe from the first block.`, createdFromSafeAddress: SAFE },
    transactions: [{ to: CREATE2_DEPLOYER, value: '0', data: '0x' + SALT + initcode.replace(/^0x/, ''), contractMethod: null, contractInputsValues: null }],
  };
}
