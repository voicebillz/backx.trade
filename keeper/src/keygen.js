// Makes the two keys a keeper needs: a gas wallet (pays transactions, receives keeper rewards) and an ed25519 report
// key (signs health reports to api.backx.trade). Run once per keeper on the machine that will run it; keep both
// private keys in that host's secret settings only. Paste the public lines into the admin/Railway settings.
import { generateKeyPairSync } from 'node:crypto';
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';

const id = process.argv[2] || 'keeper-1';
const gas = generatePrivateKey();
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pub = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const priv = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

console.log(`# --- secret: this keeper's host only ---
KEEPER_ID=${id}
KEEPER_KEY=${gas}
REPORT_KEY=${priv}

# --- public: add to Railway KEEPERS (id:gasAddress:reportPublicKey) ---
${id}:${privateKeyToAddress(gas)}:${pub}`);
