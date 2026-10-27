// Validator key rotation store (owner 2026-10-27, docs/KEEPERS.md "Key rotation"). Each server makes its own new gas
// keys; a private key never leaves the server it was made on. The keys live in one file per validator in KEY_DIR (a
// persistent disk or volume), encrypted with AES-256-GCM under KEY_SECRET (this server's own 32-byte secret, from its
// secret settings), so the file alone is useless. State: the active key and the previous one (the last batch), whose
// late rewards and gas are forwarded to the active key until the next rotation replaces it.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { join } from 'node:path';

export function makeKeyStore({ dir, secret, id }) {
  const key = Buffer.from(secret, 'base64');
  if (key.length !== 32) throw new Error('KEY_SECRET must be 32 bytes, base64');
  if (!/^[a-z0-9-]{1,32}$/.test(id)) throw new Error('KEEPER_ID: bad id');
  const file = join(dir, `${id}.key`);
  const aad = Buffer.from(`backx-keeper:${id}`);

  const seal = (state) => {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(aad);
    const data = Buffer.concat([c.update(JSON.stringify(state), 'utf8'), c.final()]);
    return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') });
  };
  const unseal = (text) => {
    const f = JSON.parse(text);
    if (f.v !== 1) throw new Error('key file: unknown version');
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(f.iv, 'base64'));
    d.setAAD(aad);
    d.setAuthTag(Buffer.from(f.tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(f.data, 'base64')), d.final()]).toString('utf8'));
  };
  const fsyncDir = () => { try { const fd = openSync(dir, 'r'); fsyncSync(fd); closeSync(fd); } catch { /* not every filesystem allows it */ } };

  return {
    file,
    /** The saved state, or null when this validator has never rotated on this disk. A wrong secret throws. */
    load() { return existsSync(file) ? unseal(readFileSync(file, 'utf8')) : null; },
    /** Writes the state durably (temp file, fsync, rename, fsync dir) and reads it back before returning: money is
     *  only ever moved to a key that is provably on disk. */
    save(state) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const tmp = `${file}.tmp`;
      const fd = openSync(tmp, 'w', 0o600);
      try { writeSync(fd, seal(state)); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(tmp, file);
      fsyncDir();
      const back = this.load();
      if (back?.active?.key !== state.active.key) throw new Error('key file did not read back: not rotating');
    },
  };
}
