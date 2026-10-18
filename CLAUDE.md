# backx.trade

Hedge & Issuer trading on Robinhood Chain. Spec and rules live in `docs/backx/`:
`HEDGE-ISSUER-SPEC.md` (product), `DESIGN-KIT.md` (design), `SECURITY-AUTH.md` (login/sessions).
The owner is not a developer: explain briefly, in Norwegian.

## Layout
- `web/` React 18 + Vite + TypeScript trading terminal (Vercel). Landing page IS the terminal.
  A "Coming soon" overlay covers it for everyone while `VITE_COMING_SOON` is not `"false"`.
- `brand/` logo, X profile picture and banner (4K sources + SVG).
- `server/` API on Railway at `api.backx.trade` (Express, Postgres, Redis). Setup: `docs/DEPLOY.md`.
- `docs/backx/` spec, design kit, security, simulations.

## Design rules (DESIGN-KIT part A)
- Colours only via tokens in `web/src/styles/tokens.css`; dark default, follows browser, saved toggle wins.
- Direction uses `--price-up`/`--price-down` and is never colour alone: always ▲/▼ and +/−.
- Skeletons for anything waiting on data, never an empty panel or bare "Loading…".
- WCAG 2.1 AA: skip link, `<main id="main">`, `:focus-visible`, `aria-label` on icon buttons.
- Money: round DOWN (`floorTo`) for any amount that is sent. Tabular mono numbers.
- Mobile: 16px gutter, no horizontal scroll, inputs ≥16px, touch targets ≥44px, bottom sheets.
- Motion < 300ms, ease-out, `prefers-reduced-motion` fallback.
- Copy: "multiplication", never "leverage". Never "zero risk". No yield promises.
- Brand mark: racing yellow `#FFD100` on black.

## Login and money (locked)
- Social login only (Privy: email, Google, Apple, X). Own Privy app for backx, not gazz.fun's.
  No external wallets, no WalletConnect, no "Connect wallet".
- Each user has their own Privy embedded wallet. Deposits go straight to it. No Relay, no bank, no escrow.
- Withdrawals: user types the recipient address. Never a fixed recipient.

## Security
- Web CSP is enforced in `web/vercel.json` (Privy base policy minus WalletConnect, plus Google Fonts and `api.backx.trade`).
  No inline scripts, no `unsafe-eval`. New external hosts (RPC, price feeds) must be added to `connect-src` deliberately.
  `X-Frame-Options: DENY` + `frame-ancestors 'none'`. Re-test the CSP after every Privy SDK upgrade.
- Never commit `.env`, keys or keypair files. `VITE_*` ends up in the browser: no secrets there.
- Owner keys are never handled by a server or script. Safe `0xfa408F75490C0412d4a5F45FA7553Aff03249BE4` owns the contracts.
- On-chain access is read-only unless the owner explicitly asks otherwise.
- Contracts are not written until the open decisions in the spec (§11) are settled with the owner.

## API (server/) — closed by default
- Only `/health` is open, and it returns only `{ ok }`. Everything else lives under `/api`.
- CORS + Origin/Referer guard: exact allowlist from `ALLOWED_ORIGINS` (https only, no wildcards, no preview domains). Fail closed.
- The origin guard only stops other websites. Every route that reads or writes user data MUST require a verified session; there are no public write routes, ever.
- Sessions: HttpOnly + Secure + SameSite=Lax cookie, only the SHA-256 hash stored in Postgres. Never tokens in query or body.
- Rate limit every `/api` route in Redis; stricter limits on money routes. Redis down = 503, never "let it through".
- Body limit 64 KB, validate every address and number, never return stack traces or internal details.
- Postgres and Redis never get public networking. Keepers/workers run as separate Railway services without a public domain.
- Secrets live only in Railway variables. Never in `VITE_*`, never in git. Server refuses to boot without required env (no fallback values).
- Login: Privy access token (Authorization header) → verified with `jose` → embedded wallet read from Privy's API
  with the app secret, never from the client → session cookie. `ADMIN_WALLETS` (Railway) lifts the coming-soon
  overlay for those addresses. The overlay is cosmetic: never ship anything secret in the web bundle.
- Server never decides outcomes from client-sent numbers; on-chain state is the source of truth for balances.
