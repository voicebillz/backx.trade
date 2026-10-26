# MCP and other AI connections (plan, owner 2026-10-26)

Status: **planned, not built.** On-chain access for agents works today without any of this (`/skill.md`,
`/agents.json`, `docs/backx/AGENTS.md`). This plan covers the extra, optional path: a user connects their own AI
assistant (Claude, ChatGPT, Cursor, their own agent …) to **their own BackX account** through MCP.

## Goals
- A user's agent sees and acts only on that user's account. Never anyone else's, never admin.
- No private keys anywhere outside the user's own wallet. MCP never signs on its own by default.
- A break-in on the MCP server cannot move money and cannot reach Postgres, Redis or the main API's secrets.
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
- Dynamic client registration allowed but every client starts with read scopes only.
- Scopes:
  - `account:read` positions, orders, rewards, staking, balances of the user's own wallet.
  - `trade:prepare` / `issue:prepare` / `stake:prepare` / `claim:prepare` build unsigned transactions.
  - (later, opt-in) `trade:execute` see "Signing" below.

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

Every prepared transaction is built for the user's own address only, simulated with `eth_call` first, uses exact
approvals and only targets addresses from `agents.json` / `factory.setOf`. The user signs it in their own wallet
(app.backx.trade opens a "Sign this" link, or their agent's own wallet if the login wallet is the agent's).

## Signing (later, opt-in only)
If owners want agents to act without a click each time: Privy session signers / server-side wallet policies on the
user's embedded wallet, set up by the user, with hard limits enforced by Privy (allowed contracts = BackX only,
max amount per day, no transfers to other addresses, expiry). Off by default, revocable any time. Needs owner
sign-off and a security review before it is built.

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
4. Only after sign-off: optional policy-limited signing.
