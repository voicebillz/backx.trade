import pg from 'pg';
import { config } from './config.js';

export const db = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
db.on('error', (e) => console.error('postgres:', e.message));

// Idempotent schema. Balances are never stored here: they live on-chain.
export async function migrate() {
  await db.query(`
    create table if not exists users (
      privy_did      text primary key,
      wallet_address text not null unique,
      created_at     timestamptz not null default now(),
      last_login_at  timestamptz not null default now()
    );
    create table if not exists sessions (
      token_hash   bytea primary key,               -- SHA-256 of the cookie value, never the value itself
      privy_did    text not null references users(privy_did) on delete cascade,
      privy_sid    text,
      created_at   timestamptz not null default now(),
      expires_at   timestamptz not null,
      revoked_at   timestamptz
    );
    create index if not exists sessions_did on sessions(privy_did);

    -- Beta sign-ups: every account created before launch. Only the method type is stored
    -- (email, phone, google, ...), never the email address or phone number itself.
    alter table users add column if not exists signup_method     text;
    alter table users add column if not exists last_login_method text;
    alter table users add column if not exists beta_signup_at    timestamptz not null default now();

    -- Profile: a random avatar picked at sign-up, and the user's Solana embedded wallet.
    alter table users add column if not exists avatar_seed    integer not null default floor(random() * 2147483647)::int;
    alter table users add column if not exists solana_address text;
  `);
}
