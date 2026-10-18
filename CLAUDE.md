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
- Colours only via tokens in `web/src/styles/tokens.css`; dark is the standard for everyone (owner 2026-10-18),
  the user's saved toggle wins. Browser preference is not followed.
- Direction uses `--price-up`/`--price-down` and is never colour alone: always ▲/▼ and +/−.
- Skeletons for anything waiting on data, never an empty panel or bare "Loading…".
- WCAG 2.1 AA: skip link, `<main id="main">`, `:focus-visible`, `aria-label` on icon buttons.
- Money: round DOWN (`floorTo`) for any amount that is sent. Tabular mono numbers.
- Mobile: 16px gutter, no horizontal scroll, inputs ≥16px, touch targets ≥44px, bottom sheets.
- Motion < 300ms, ease-out, `prefers-reduced-motion` fallback.
- Copy: "multiplication", never "leverage". Never "zero risk". No yield promises.
- Brand mark: racing yellow `#FFD100` on black.

## Login and money (locked)
- Privy login without wallets: email, SMS, Google, X, Discord, Twitch, Telegram, Farcaster, passkey
  (Apple once our Apple OAuth credentials exist; owner 2026-10-18). Own Privy app for backx, not gazz.fun's.
  No external wallets, no WalletConnect, no "Connect wallet". Each method must also be on in the Privy dashboard.
- Each user has their own Privy embedded wallet. Deposits go straight to it. No Relay, no bank, no escrow.
- Withdrawals: user types the recipient address. Never a fixed recipient.

## Security
- Web CSP is enforced in `web/vercel.json` (Privy base policy minus WalletConnect, plus Telegram login, Google Fonts and `api.backx.trade`).
  No inline scripts, no `unsafe-eval`. New external hosts (RPC, price feeds) must be added to `connect-src` deliberately.
  `X-Frame-Options: DENY` + `frame-ancestors 'none'`. Re-test the CSP after every Privy SDK upgrade.
- Never commit `.env`, keys or keypair files. `VITE_*` ends up in the browser: no secrets there.
- Owner keys are never handled by a server or script. Safe `0xfa408F75490C0412d4a5F45FA7553Aff03249BE4` owns the contracts.
- On-chain access is read-only unless the owner explicitly asks otherwise.
- Contracts live in `contracts/` (Foundry, OpenZeppelin v5.1.0, owner = the Safe from the constructor). Written at the
  owner's request 2026-10-18; NOT audited, NOT deployed. Deploying needs owner sign-off on the open decisions, the
  swap adapter + TWAP oracle per pool, fork tests and an external audit. `forge test` must stay green.
- Web math (`web/src/lib/hedge.ts`) must match the contract defaults (fees, e/s/p per m, buffers): change both together.

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
  overlay for those addresses. Behind the overlay only a static blurred image is shown; the terminal is a
  separate chunk loaded only after `/api/auth/me` says admin. Its file is still public, so never ship secrets in
  the web bundle: real protection is the server requiring a session on every `/api` route.
- Read-only data routes: `/api/wallet/balances` (user's own EVM + Solana wallets via RPC, CoinGecko prices) and
  `/api/markets` (demo universe from CoinGecko until Robinhood Chain markets list). Both need a session, cached in Redis.
- Swap page (`/swap`, `/api/swap/*`): same-chain swaps on Ethereum, Base, BNB Chain routed by LI.FI, no bridges.
  The server builds every quote for the signed-in user's own address and rejects any route whose tx or approval
  does not target the LI.FI Diamond `0x1231…4EaE`; approvals are for the exact amount. User signs with Privy.
  Solana swaps not built yet. Listed coins map to contracts via CoinGecko platforms (cached daily).
  MEV protection: Privy sends Ethereum txs via MEV Blocker and BNB Chain via PancakeSwap MEV Guard (private RPCs,
  chain overrides in privyBridge.tsx; also used by withdrawals). Base has no public mempool. Every swap is re-quoted
  right before signing (and again after an approval is mined); a worse minimum stops it. Routes losing >10 % of
  USD value are refused server-side; >3 % needs explicit confirmation.
- Withdrawals are signed by the user's own Privy wallet with Privy's confirm screen (EVM: ETH/Base/BNB, native + USDC).
  Amounts are parsed to base units and rounded down. Solana withdrawals not built yet.
- Multiplication 1× is allowed for Hedge: nothing is borrowed, no liquidation, issuers get 0 % (owner 2026-10-18).
- Two sides per coin (owner 2026-10-18): Hedge (price up) is backed by the coin's USD reserve (USDC); Short
  (price down) is backed by its token reserve (the coin itself, lent and sold, bought back first on close).
  Math and caps: `docs/backx/SHORT-SPEC.md` (short notional m·E, 1 % liquidation buffer, lower max m on thin
  pools). The ticket has Hedge | Short; issuing only happens on the Issue Reserve page.
- Server never decides outcomes from client-sent numbers; on-chain state is the source of truth for balances.
