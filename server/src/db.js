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

    -- Privy sessions ended by "Sign out" / "Log out everywhere". Another device still holding that
    -- Privy session cannot exchange it for a new backx session (else it would log itself back in).
    create table if not exists revoked_privy_sids (
      privy_sid  text primary key,
      privy_did  text not null,
      revoked_at timestamptz not null default now()
    );

    -- Beta sign-ups: every account created before launch. Only the method type is stored
    -- (email, phone, google, ...), never the email address or phone number itself.
    alter table users add column if not exists signup_method     text;
    alter table users add column if not exists last_login_method text;
    alter table users add column if not exists beta_signup_at    timestamptz not null default now();

    -- Profile: a random avatar picked at sign-up, and the user's Solana embedded wallet.
    alter table users add column if not exists avatar_seed    integer not null default floor(random() * 2147483647)::int;
    alter table users add column if not exists solana_address text;
    -- Uploaded profile picture (small, resized in the browser). Null = generated avatar.
    alter table users add column if not exists avatar_mime text;
    alter table users add column if not exists avatar_data bytea;

    -- Admin portal: coins listed for trading on Robinhood Chain (owner 2026-10-19). Config only: the contracts
    -- are configured by the Safe; this is the list the team prepares and the app will read.
    create table if not exists listed_assets (
      id              serial primary key,
      chain_id        integer not null,
      symbol          text not null,
      name            text not null,
      token_address   text not null,
      decimals        smallint not null,
      pool_address    text,
      oracle_address  text,
      pool_fee_bps    integer not null,
      max_m           smallint not null,
      liq_margin_bps  integer not null,
      logo_url        text,
      enabled         boolean not null default false,
      notes           text,
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now(),
      updated_by      text not null,
      unique (chain_id, token_address)
    );
    -- Multi-chain + deploy from the portal (owner 2026-10-19).
    alter table listed_assets add column if not exists adapter_address  text;
    alter table listed_assets add column if not exists max_position_usd integer not null default 50000;
    alter table listed_assets add column if not exists max_open_usd     integer not null default 2000000;
    alter table listed_assets add column if not exists deploy_status    text not null default 'draft';
    alter table listed_assets add column if not exists deployed         jsonb;
    -- Every admin write is logged: who, what, when. Never deleted by the app.
    create table if not exists admin_audit (
      id      bigserial primary key,
      at      timestamptz not null default now(),
      admin   text not null,
      action  text not null,
      target  text,
      detail  jsonb
    );

    -- Accounts created before sign-up methods were recorded: best known value is the latest login.
    update users set signup_method = last_login_method where signup_method is null and last_login_method is not null;
  `);
}
