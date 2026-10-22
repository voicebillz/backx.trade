import { readFileSync } from 'node:fs';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { db } from './db.js';
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
const FACTORY_INIT = sel('initialize(address,address,address,address,address,address,address,address)');
const MARKET_COUNT = '0x' + sel('marketCount()');

/** The implementations: identical on every chain, so they get the same address everywhere. */
export const IMPLS = [
  { key: 'vaultImpl', artifact: 'BackxReserveVault', label: 'Issue Reserve', role: 'Holds issuers\' USDC and lends it to hedges (ERC-4626, withdrawal queue).' },
  { key: 'fundImpl', artifact: 'BackxReserveSecurityFund', label: 'Reserve Security Fund', role: 'Last-resort cover when a crash cannot be liquidated in time.' },
  { key: 'managerImpl', artifact: 'BackxPositionManager', label: 'Position Manager', role: 'Opens, closes and liquidates hedges; keeper batches, limits.' },
  { key: 'factoryImpl', artifact: 'BackxMarketFactory', label: 'Market Factory (code)', role: 'Code behind the factory proxy (UUPS).' },
].map((c) => ({ ...c, kind: 'implementation', initcode: ART[c.artifact].initcode, runtimeSize: ART[c.artifact].runtimeSize, address: create2Address(ART[c.artifact].initcode) }));

/** ERC1967Proxy(factoryImpl, initialize(safe, usd, impls…, feeCollector, keeper, keeperWallet)). */
export function factoryInitcode(usdAddr, cfg) {
  const a = Object.fromEntries(IMPLS.map((c) => [c.key, c.address]));
  const init = FACTORY_INIT + padAddr(SAFE) + padAddr(usdAddr) + padAddr(a.vaultImpl) + padAddr(a.fundImpl) + padAddr(a.managerImpl)
    + padAddr(cfg.feeCollector) + padAddr(cfg.keeper) + padAddr(cfg.keeperWallet);
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
  const { rows } = await db.query(`select address from core_contracts where chain_id = $1 and name = 'factory' and status = 'deployed'`, [chainId]);
  return rows[0]?.address ?? null;
}

/** Status of every core contract on one chain, read from the chain (and remembered once deployed). */
export async function chainStatus(chainId) {
  const chain = CHAINS[chainId];
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
    key: 'factory', label: 'Market Factory', kind: 'proxy', role: 'Creates each coin\'s reserve, fund and position manager in one Safe transaction.',
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
