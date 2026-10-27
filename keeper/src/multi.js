// Runs every keeper in KEEPER_SET (made by src/setup.js) as its own child process, restarting any that stop
// (5 s, doubling to 2 min). One container per server, so hosts with only one or two services can run many keepers.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raw = process.env.KEEPER_SET?.trim();
if (!raw) throw new Error('Missing KEEPER_SET (run src/setup.js)');
const set = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
const script = join(dirname(fileURLToPath(import.meta.url)), 'index.js');

function run(env, wait = 5000) {
  // Contract addresses can be added later as a plain server variable MANAGERS_<chainId>, without a new KEEPER_SET
  // (a new set would mean new keys, and a new KEY_SECRET that cannot open the rotated keys on disk).
  env = { ...env, MANAGERS: env.MANAGERS || process.env[`MANAGERS_${env.CHAIN_ID}`] || '' };
  if (!env.MANAGERS) { console.log(`${env.KEEPER_ID}: no MANAGERS yet, idle`); return; }
  const started = Date.now();
  const child = spawn(process.execPath, [script], { env: { ...process.env, KEEPER_SET: '', ...env }, stdio: 'inherit' });
  child.on('exit', (code) => {
    const next = Date.now() - started > 600_000 ? 5000 : Math.min(wait * 2, 120_000);   // ran 10 min: reset back-off
    console.log(`${env.KEEPER_ID} exited (${code}), restart in ${next / 1000} s`);
    setTimeout(() => run(env, next), next);
  });
}
for (const env of set) run(env);
console.log(`backx keeper set: ${set.length} keeper(s)`);
setInterval(() => {}, 1 << 30);   // keep the launcher alive even when every keeper is idle
