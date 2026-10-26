# MCP and other AI connections (plan, owner 2026-10-26)

Status: **v1 built 2026-10-26** (read tools, prepare tools, consent, sign page with the API's own check; code in
`voicebillz/mcp.backx.trade`, Railway recipe in its README). **Signing by MCP via Privy policies: not built yet**
(needs owner sign-off on the default limits). On-chain access for agents works today without any of this (`/skill.md`,
`/agents.json`, `docs/backx/AGENTS.md`). This plan covers the extra, optional path: a user connects their own AI
assistant (Claude, ChatGPT, Cursor, their own agent …) to **their own BackX account** through MCP. Only for
accounts that log in with a social method; MCP may sign within limits but never holds a private key.

## Goals
- A user's agent sees and acts only on that user's account. Never anyone else's, never admin.
- MCP **can sign transactions** for the user (owner 2026-10-26), but never sees or holds a private key: signing
  goes through Privy's policy-limited signing on the user's embedded wallet (below). The key stays inside Privy.
- **Only social-login accounts can connect MCP** (owner 2026-10-26): email, SMS, Google, X, Discord, Twitch,
  Telegram, Farcaster, passkey. Accounts that log in with their own external wallet (MetaMask, WalletConnect …)
  cannot connect: their agent already has its own wallet and uses the plain on-chain path (`/skill.md`).
- A break-in on the MCP server can at most do what the user's Privy policy allows (BackX contracts only, daily cap,
  never a transfer out), and cannot reach Postgres, Redis or the main API's secrets.
- Easy: one URL, `https://mcp.backx.trade/mcp`, log in with the same BackX login, approve, done.

## Architecture

```
AI client ──OAuth 2.1 + MCP (Streamable HTTP)──▶ mcp.backx.trade  (separate project, separate server)
                                                    │  only: signed, allow-listed calls
                                                    ▼
                                             api.backx.trade /internal/mcp/*  (narrow, read-mostly)
                                                    │
                                             Postgres / Redis (never reachable from MCP)
Chain RPCs ◀── read-only calls (positions, rewards, prices) ── mcp.backx.trade
```

- **Separate project and server** (own Railway project or other cloud, own domain `mcp.backx.trade`, own secrets).
  It has no database password, no Privy app secret and no ADMIN_WALLETS. Its own Redis only for rate limits.
- **Limited link to the main API**: a small set of `/internal/mcp/*` routes on api.backx.trade, reachable only with
  a request signed by the MCP server's own key (ed25519, like the validator heartbeat) + timestamp + nonce (replay
  guard in Redis), plus an IP allow list if the host has a fixed egress IP. Every route takes the user id from the
  verified MCP token, never from the request body. Allowed routes (first version): who am I (wallet address), my
  balances, my participation, my Tanks. Everything else is read straight from the chain.
- **Never public writes**: the internal routes are read-only. Money actions are prepared, never executed (below).

## Login and scopes (MCP authorization spec, OAuth 2.1)
- mcp.backx.trade is an OAuth resource server. The authorization server is BackX's login (Privy) behind a small
  consent page on `app.backx.trade/connect`: the user logs in, sees which assistant asks for what, and approves.
- PKCE required, short-lived access tokens (15 min) bound to the MCP audience (`resource` indicator), refresh
  tokens rotated, revocable from Profile → Connected apps (planned). Only hashes stored, like sessions.
- Eligibility is checked at consent and on every token refresh, from Privy's API with the app secret (never from the
  client): the account must have logged in with a social method and have its BackX embedded wallet. An account whose
  login is an external wallet (`wallet` linked account used as the login method) gets "MCP is for social-login
  accounts; your agent can use backx.trade/skill.md with its own wallet" and no token.
- Dynamic client registration allowed but every client starts with read scopes only.
- Scopes:
  - `account:read` positions, orders, rewards, staking, balances of the user's own wallet.
  - `trade:prepare` / `issue:prepare` / `stake:prepare` / `claim:prepare` build unsigned transactions.
  - `trade:sign` / `issue:sign` / `stake:sign` / `claim:sign` sign and send, within the user's limits ("Signing" below).
    Each is a separate tick on the consent page; off unless the user turns it on.

## Tools (first version)
| Tool | Scope | What it does |
|---|---|---|
| `markets_list`, `market_get` | none / `account:read` | coins, caps, max leverage now, prices (from chain) |
| `positions_list`, `orders_list` | `account:read` | the user's own positions and orders |
| `rewards_get` | `account:read` | pending issuer rewards per pool + staking earned |
| `prepare_open`, `prepare_close`, `prepare_order` | `trade:prepare` | unsigned tx (to, data, value) + simulation result |
| `prepare_issue`, `prepare_withdraw` | `issue:prepare` | same for vaults |
| `prepare_stake`, `prepare_unstake` | `stake:prepare` | same for staking, incl. the one-time approvals |
| `prepare_claim_all` | `claim:prepare` | one Multicall3 tx with `claimRewardsFor` + `claimFor` |
| `send_prepared` | the matching `*:sign` | signs and sends a transaction prepared above, via Privy, within the policy |

Every prepared transaction is built for the user's own address only, simulated with `eth_call` first, uses exact
approvals and only targets addresses from `agents.json` / `factory.setOf`. Without a `*:sign` scope the user signs it
on app.backx.trade ("Sign this" link); with it, `send_prepared` signs it through Privy (below).

## Signing (owner 2026-10-26: MCP may sign, never holds a key)
How: Privy server-side signing on the user's **embedded** wallet (Privy "session signers" / authorization keys with
wallet policies). The private key stays split inside Privy's secure enclave; neither mcp.backx.trade nor
api.backx.trade ever sees it. MCP holds only an authorization key that Privy accepts for that one wallet, and only
for requests that pass the policy.

- **Opt-in per account**: the user turns it on in Profile → Connected apps (planned) and confirms with their own
  login. That adds the MCP signer to their wallet; "Disconnect" removes it at once (and revokes the tokens).
- **Policy enforced by Privy, not by our code** (so a bug or break-in on MCP cannot widen it):
  - allowed chains: the launch chains; allowed `to`: BackX contracts from `agents.json` / `factory.setOf`, the
    stable and coin contracts only for `approve` to those, Multicall3 only with `claimRewardsFor` / `claimFor`;
  - allowed methods: open, close, setLimit, setStop, placeOrder, cancelOrder, deposit, withdraw, requestRedeem,
    cancelRequest, stake, unstake, claim*, approve (exact amount, spender = a BackX contract);
  - never: plain transfers of USDC/ETH/coins/Tanks to any address, `setApprovalForAll` except to staking,
    withdrawals to another address (`withdraw(…, receiver ≠ own wallet)` denied);
  - limits the user sets: max USD per transaction and per day, max leverage, expiry (default 30 days).
- Every signed transaction is simulated first, logged (user, client, tool, tx hash) and shown in Profile.
- External-wallet accounts never get a signer (they cannot connect at all, see Goals).
- Needs owner sign-off on the default limits and a security review of the policy before launch.

## Other AI connection methods (same rules)
- **Plain on-chain** (works now): `/skill.md` + `/agents.json` + ABIs. Best for autonomous agents with their own wallet.
- **llms.txt** (works now): summary for search and assistants.
- **OpenAPI for GPT actions etc.** (later): generated from the same read-only tool set, same OAuth, served by
  mcp.backx.trade, never by api.backx.trade directly.

## Security checklist before launch
- Separate project, separate secrets, no DB/Redis networking from MCP; main API only via signed internal routes.
- Rate limits per user and per client in Redis (MCP's own), Redis down = 503.
- Every tool input validated (addresses, amounts, chain ids); outputs never include other users' data.
- Prompt-injection guard: tool results that contain on-chain text (token names, symbols) are returned as data,
  never as instructions; amounts and addresses are always re-read from the chain before preparing a transaction.
- Audit log of every token issue, consent and prepared transaction (user id, client, tool, time).
- CSP on app.backx.trade: add `https://mcp.backx.trade` to `connect-src` only if the consent page calls it.
- External review of the OAuth flow and the internal API before going live.

## Build order
1. `/internal/mcp/*` read routes + signed-request middleware on api.backx.trade.
2. mcp.backx.trade: MCP server (TypeScript MCP SDK, Streamable HTTP), OAuth with Privy login + consent page.
3. Read tools → prepare tools → Profile → Connected apps (revoke).
4. Signing: Privy signer + policy per account, consent ticks, limits in Profile, then `send_prepared`
   (after sign-off on the default limits and a policy review).
