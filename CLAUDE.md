# backx.trade

Hedge & Issuer trading on Robinhood Chain. Spec and rules live in `docs/backx/`:
`HEDGE-ISSUER-SPEC.md` (product), `DESIGN-KIT.md` (design), `SECURITY-AUTH.md` (login/sessions).
The owner is not a developer: explain briefly, in Norwegian.

## Layout
- `web/` React 18 + Vite + TypeScript (Vercel), one build, two hosts (owner 2026-10-22, `src/lib/host.ts`):
  `backx.trade` = public front page (`pages/HomePage.tsx`: circuit hero, motto, Participate, speed before/after
  wipe (`SpeedCompare`: divider rests in the middle and only moves left; BackX steps fill in green, targets: trade issuing 0.25 / buy 0.3 / sell 0.3 s, liquidation position 0.05 + planning 0.1 + execution 0.35 = 0.5 s), chain carousel, steps Wallet → Issue → Hedge with moving visuals (`HowVisuals`); login chips use the real Outlook/Google/X logos and Passkey with Android/Windows/Apple, files in `web/public/logins/`, $GAZZ, theme toggle) + `/whitepaper`; `app.backx.trade` = the trading/issuing app, ADMIN_WALLETS only for now (`AppGate`
  for everyone else). The old coming-soon / venture overlays are gone. Locally `?app` previews the app.
- `brand/` logo, X profile picture and banner (4K sources + SVG).
- `server/` API on Railway at `api.backx.trade` (Express, Postgres, Redis). Setup: `docs/DEPLOY.md`.
  Built from `server/Dockerfile` with an exact Node.js tag (24.22.1, Oct 2026 security release), non-root; bump the tag on
  every Node.js security release.
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
- Backgrounds stay clean and flat (owner 2026-10-22): no light circles, radial glows, spotlights or coloured
  light behind content, in the app, images and videos alike. No dark drop shadows behind logos or coins either.
  Only exception: the front-page hero has a hint of navy as a flat top-to-bottom linear gradient (owner 2026-10-22).

## Login and money (locked)
- Privy login: email, SMS, Google, X, Discord, Twitch, Telegram, Farcaster, passkey
  (Apple once our Apple OAuth credentials exist; owner 2026-10-18). Own Privy app for backx, not gazz.fun's.
  External wallets ON (owner 2026-10-25, for agents): `wallet` login + WalletConnect in Privy's modal (detected,
  MetaMask, Robinhood Wallet, Rainbow, WalletConnect). The external wallet is only the login: every account still gets
  its own embedded wallet (`createOnLogin: 'all-users'`), which the session, deposits and ADMIN_WALLETS use.
  WalletConnect hosts are in the CSP. Each method must also be on in the Privy dashboard.
- Each user has their own Privy embedded wallet. Deposits go straight to it. No Relay, no bank, no escrow.
- Withdrawals: user types the recipient address. Never a fixed recipient.

## Security
- Web CSP is enforced in `web/vercel.json` (Privy base policy incl. WalletConnect, plus Telegram login, Google Fonts and `api.backx.trade`).
  No inline scripts, no `unsafe-eval`. New external hosts (RPC, price feeds) must be added to `connect-src` deliberately.
  `X-Frame-Options: DENY` + `frame-ancestors 'none'`. Re-test the CSP after every Privy SDK upgrade.
- Never commit `.env`, keys or keypair files. `VITE_*` ends up in the browser: no secrets there.
- Owner keys are never handled by a server or script. Safe `0xfa408F75490C0412d4a5F45FA7553Aff03249BE4` owns the contracts.
- On-chain access is read-only unless the owner explicitly asks otherwise.
- Contracts live in `contracts/` (Foundry, OpenZeppelin v5.1.0 + contracts-upgradeable v5.1.0, owner = the Safe from
  initialisation). Written at the owner's request 2026-10-18; NOT audited, NOT deployed. Deploying needs owner sign-off on
  the open decisions, the swap adapter + TWAP oracle per pool, fork tests and an external audit. `forge test` must stay green.
- Upgradeable, isolated per coin per chain (owner 2026-10-19): one `BackxMarketFactory` per EVM chain (UUPS, Safe-owned)
  creates each coin's Hedge side (BackxHedgeManager + USDC BackxReserveVault + BackxReserveSecurityFund) and Short side
  (BackxShortManager + the coin's own BackxReserveVault + its own fund) as BeaconProxies in ONE `createMarket` call
  (`addShort` adds the Short side later). Shared code: `BackxManagerBase`. The Safe owns the four beacons and upgrades a
  contract type for every coin on a chain with one `upgradeTo`; no redeploy, balances and positions stay. Storage is
  append-only across versions. Validators settle many per tx (`liquidateBatch`, `executeLimitBatch`, `fillOrderBatch`).
  Contracts v2 (owner 2026-10-25, `docs/backx/VALIDATORS.md`, `AGENTS.md`): execution is OPEN to anyone (no keeper
  allow list); each position escrows its validator gas, paid to whoever settles it + an accuracy bonus
  (max·((W−d)/W)², W 1 %; liquidation max 0.5 %, fills 0.1 %, from the trader's rest/payout, never principal); own
  close refunds the gas. Entry orders (`placeOrder`, buy for Hedge / sell for Short, trigger above/below, expiry,
  cancel; a short order waits until coins are issued). ALL rewards are claimable USDC: validators `claim()/claimTo()`
  per manager; issuers (USDC reserve AND coin reserves) `claimRewards()/claimRewardsTo()` on the vault, streamed over
  24 h, pro rata, queued shares stop earning; the share price is principal only. Fund guardrails: only its manager
  draws, only in a confirmed gap, ≤ 50 % of the position's lent (manager), ≤ 25 % of the fund per payment and ≤ 50 %
  per 24 h (fund; Safe can tune 5–100 %, never off). The admin portal never deploys with a server key: it builds
  the createMarket transaction as a Safe Transaction Builder file, the Safe signs, the portal reads the factory to
  record the new addresses.
- Admin "Contracts" (`/admin/contracts`, owner 2026-10-22): per chain the five core contracts (vault, fund, hedge manager,
  short manager, factory implementations) + the Market Factory proxy (needs only the fee collector). Deploy = Safe Transaction Builder file calling the CREATE2
  deployer 0x4e59…956c (salt `backx.v1`), so addresses are known in advance and identical on every chain; the portal
  reads the chain to mark them deployed (`core_contracts` table, bookkeeping only) and hides the button. Init code lives
  in `server/src/artifacts.json`: after ANY contract change run `forge build && python3 script/export-artifacts.py`.
  Size: the old 29.5 KB BackxPositionManager was split into the Hedge and Short managers (owner 2026-10-25); each must
  stay under 24 KB (EIP-170), check `forge build --sizes`. The DEX pool hook is not written yet (shown as Planned).
  Safe exists on Robinhood, BNB, Base, Ethereum; not yet on Arbitrum, OP, Polygon, Avalanche.
- Issue page: "Issue" opens a choice of Hedge · USDC (USDC reserve), Short · <coin> (the coin itself, owner 2026-10-25) or
  DEX pool (PancakeSwap Infinity / Uniswap v4, price range). "Your rewards" card (claimable USDC; Claim opens at launch).
  Trade ticket (owner 2026-10-25): one Hedge·Buy ⇄ Short·Sell switch at the top, "Limit order" switch (price required;
  warns above/below/at/far from today's price), take-profit (short: not past the roof), Buy/Sell opens a confirm overlay
  (portal; "Opens at launch" until contracts are live). Missing USDC or coin → "Swap" opens SwapOverlay in the same
  window with that coin preselected on the first launch chain that routes it; Back returns. Swap chains: Ethereum, Base,
  BNB Chain, Arbitrum. Coin logos: CoinIcon falls back to the listed market image (LISTED_LOGO). No under-texts (owner):
  keep only errors, warnings and numbers. App header: home icon (no text) before Trade → front page.
  Settings gear (owner 2026-10-25, `lib/layout.ts`, `components/LayoutPanel.tsx`), right of the profile, also signed out: theme
  (dark/light) and candle colours live here (no longer in the header), plus the terminal layout: 10
  presets + side panel / bottom panel (Moving markets, Positions, Off), ticket left/right, coin header on/off; chart and
  ticket are mandatory. Desktop (≥1200 px): drag panel edges and corners (Resizer in Terminal.tsx, arrow keys too);
  saved in localStorage `backx.layout.v1`. Chart timeframes 1m … 1 month (dropdown only). Preset previews are
  real screenshots, `web/public/layouts/0-9.webp` (640 px): retake them when the terminal changes. Live issuing opens at launch; Demo mode (10,000 play USDC, browser-only, nothing sent) works now.
  Until launch: "Coming soon" badge (header stats unblurred, owner 2026-10-25); DEX pool greyed out with "Soon" (`DEX_OPEN = false` in IssuePage).
  Partner plan: `docs/backx/PARTNERS.md`. Whitepaper page `/whitepaper` (admins only until launch: everyone else sees a greyed-out "Coming soon" placeholder, `WhitepaperSite.tsx`; visual gate only, the text ships in the chunk; nav after Swap; timing table from sim/flash.py,
  RSF note: in a 30–60 % flash crash issuers can expect a small loss).
  Motto (owner 2026-10-22): "Future Trading for Agents ⇄ Capital", flips every 2.6 s (`components/Motto.tsx`; app header box; removed from the Whitepaper 2026-10-25, whitepaper has no Draft badge).
  Vercel: `cleanUrls` is on, so SPA rewrites must point to `/` (not `/index.html`, which 404s on refresh).
  Intro video: `brand/marketing/backx-intro-4k.mp4` + `-1080p.mp4`, source `brand/video/` (recipe: beat grid, real Mixkit SFX; no music, calm bubble/swish motion sounds, −16 LUFS).
- Launch chains (owner 2026-10-23, `LAUNCH_CHAIN_IDS` in server/src/chains.js): Robinhood Chain, BNB Chain, Base, Arbitrum;
  the others later. Solana is wanted too but is not EVM (needs its own program); until then SOL lists as a wrapped token.
  The contracts read the stablecoin's decimals (BNB Chain USDC has 18): `USD_DECIMALS=18 forge test` must pass too.
  Listing goes through the best launch chain (Admin → Listed assets → Best chain, `bestChain` in listing.js): find the
  coin's main token per chain (GeckoTerminal search, wrapped majors priced at the underlying's market cap), run the
  listing rules, pick highest tier → cheapest liquidation gas → deepest liquidity. GeckoTerminal allows ~10 calls/min,
  so it runs in the background and is cached 1 h. One validator set per chain (CHAIN_ID).
- Chains (server/src/chains.js): Robinhood Chain, Ethereum, Base, BNB Chain, Arbitrum, Optimism, Polygon, Avalanche.
  Non-EVM coins (BTC, SOL, ADA, XRP, DOGE …) are listed via their wrapped token on one of these chains; the contracts
  are Solidity only. Robinhood Chain's reserve stablecoin is OPEN (no USDC there on LI.FI yet).
- Web math (`web/src/lib/hedge.ts`) must match the contract defaults (fees, e/s/p per m, buffers, limit slip): change both together.
- Fee model v4 (owner 2026-10-18/19): the amount the trader types IS what they pay; fees and validator gas come out of it
  (contract `_stakeFor`, web `marginFor`), the rest is the margin X and the position is m × X (holders 2 % of X to
  gazz.fun, borrow 0.25 % of lent to issuers, RSF 0.5 % of X + 0.03 % of lent), issuers' share of a gain p = 10 %.
  Validator gas: flat `validation.gasUsd` per position (default $0.10, max $5, ≈ 2× one close), escrowed in the position
  and paid to whoever settles it (refunded on an own close). The ticket shows the amount, the position size and "Gas".
- Issuer reserves are used in full; the Reserve Security Fund is the last resort for crashes the contract cannot
  liquidate through. The crash-exposure gate (stressCoverBps) is tracked but OFF by default; only the Safe turns it on.
  Limit (take-profit) orders fill via validator on the TWAP, at most 1 % worse than the limit.
- Multiplication follows the issued USDC (owner 2026-10-19): the market cap (maxHedgeM) is the standard, but a hedge can
  only borrow what the reserve can lend ((m − 1)·stake ≤ availableToLend, 90 % util cap): `maxMFor` in each manager
  (short: the coins issued), `maxHedgeMFor` in web/src/lib/reserves.ts for the ticket. Issuer rewards are claimable USDC
  (owner 2026-10-25, replaces "into the share price"), see the contracts v2 note above.
- Liquidation margin (owner 2026-10-19, raised 2026-10-20): each market has liqMarginBps (server LIQ_MARGIN: Major 1.5 %,
  Large 2 %, Mid 3 %, Small 4 %) and Hedge caps Major 20×, Large 5×, Mid 3×, Small 2×. Issuers are never at risk unless the
  price falls a further 2.7 % (Major 20×) / 8.2 % / 14.9 % / 24 % past the liquidation point before the sale.
- Liquidation price guard (security review 2026-10-20): a liquidation sale fills at most liqMaxGapBps (2 %) from the TWAP,
  and while the TWAP shows the coins cover the principal + 2 %, it must return the FULL principal (sandwiches revert).
  Swaps are booked from balance deltas, never from the adapter's return value. See `docs/backx/SECURITY-REVIEW.md`.
  OPEN FLAW (flash-crash sim 2026-10-22, `docs/backx/EXECUTION.md`, `sim/flash.py`): the 60 s TWAP confirm and the
  2 % TWAP guard lag in a fast crash, so liquidations revert until the crash stops (issuer losses 10–57 % of lent in
  the sim). Fix before audit: fast pull oracle (Pyth chosen 2026-10-22: Robinhood 0x8250f4aF…487a, ≤ 3 s stale) as trigger and
  guard reference, validator posts update+liquidation in one tx; TWAP only for opens/limits. Sim with it: 0 % loss. The ticket shows no fee breakdown: fees are in "You pay", the liquidation price and the outcomes.
  Details: `docs/backx/FEES-AND-MARGINS.md` (v4 box, §3b–3c) and `SCENARIOS-100.md`.
  LIVENESS (owner 2026-10-23, `docs/backx/LIVENESS.md`): nothing that protects money may depend on our servers. Planned
  (needs owner sign-off, with the size fix): liquidate / limit fills / processQueue open to anyone, validator gas escrowed per
  position and paid to whoever executes plus a capped liquidation bonus, Pyth + Chainlink price anyone can post with a TWAP
  fallback, pause never blocks exits, two validators on two clouds, timelocked upgrades, IPFS app mirror.
  Words (owner 2026-10-25): say "validator" everywhere in docs and UI. A validator is anyone who settles or fills
  on-chain and gets that position's gas fee; ours are "our validators". Code/env/contract names keep "keeper".
  Our validators (owner 2026-10-23, `keeper/`, `docs/KEEPERS.md`): 10 per chain on 5 servers, unique ranks (rank r acts
  r × 2 blocks later after a simulation re-check), chain-only, several RPCs, self-balancing gas (richest tops up the
  poorest, excess above the cap swept to the Safe). Optional signed ed25519 heartbeat to `POST /keeper/heartbeat`
  (outside /api, KEEPERS env on Railway); Admin → Validators shows health, balances, latency and builds a Safe file to fund them.
  Servers (owner 2026-10-25): 5 servers × 2 validators per chain (Railway, Oracle Always Free, GCP e2-micro, Northflank
  Sandbox, Azure 12 mo), ranks interleaved (server s runs s−1 and s+4). One image `ghcr.io/voicebillz/backx-keeper`
  (built by .github/workflows/keeper-image.yml), `src/setup.js` makes a server's keys → KEEPER_SET (secret, that server
  only) + public KEEPERS lines, `src/multi.js` runs them. Step-by-step recipe: Admin → Contracts (AdminKeeperRecipe).
- Issuer withdrawal queue (owner 2026-10-20): free money (`freeIdle`) is withdrawn at once; for the rest the issuer calls
  `requestRedeem(shares)`, the shares are parked in the vault and reserved, and every settlement point (`repay`, a new
  deposit, `processQueue`) pays the queue first, FIFO, part-payments, straight to the wallet that asked. Reserved money
  is never lent again. `cancelRequest` returns unpaid shares.
- Listing rules (owner 2026-10-20, `server/src/listing.js`): live GeckoTerminal data + GoPlus token audit. Min market cap
  $10M, liquidity $1M on that chain, 24 h volume $500k, 30 days trading; no honeypot/tax/hidden mint/owner/pause/blacklist.
  Tier (stricter of cap and liquidity) sets max multiplication + min margin; max position 0.5 % and max open 10 % of
  liquidity. A failing coin is rejected (deploy 409, button disabled); the admin listing window shows the recipe.
  Liquidation setup and revenue per $30M volume: `docs/backx/LIQUIDATION.md`. Treasury share is OPEN (all 2 % → feeCollector).

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
  with the app secret, never from the client → session cookie. `ADMIN_WALLETS` (Railway) opens app.backx.trade
  for those addresses; everyone else gets the AppGate. The terminal is a
  separate chunk loaded only after `/api/auth/me` says admin. Its file is still public, so never ship secrets in
  the web bundle: real protection is the server requiring a session on every `/api` route.
- Read-only data routes: `/api/wallet/balances` (user's own EVM + Solana wallets via RPC, CoinGecko prices) and
  `/api/markets` (demo universe from CoinGecko until Robinhood Chain markets list). Both need a session, cached in Redis.
- Investing (Hedge stake, Issue Reserve) is paid in USDC (owner 2026-10-19): the ticket and Issue modal show the user's
  USDC, Max fills all of it (fees come out of the amount), and USDC on another chain is moved to the market's chain
  with `/api/swap/move-usdc` (LI.FI bridge, user signs, own address only, Diamond-only, exact approval, ≤ 3 % loss).
- Swap page (`/swap`, `/api/swap/*`): same-chain swaps on Ethereum, Base, BNB Chain routed by LI.FI (bridging only via move-usdc above).
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
- Short is BACK (owner 2026-10-25, replaces "Hedge only" of 2026-10-19), old-school: borrow the coin from issuers who
  deposited that coin (PONS, BTC …; only Hedge capital is USDC), sell it, buy exactly the same coins back; every swap
  cost is the trader's, issuers earn USDC. Caps as Hedge (Major 20×, Large 5×, Mid 3×, Small 2×), short margin 2/3/4/5 %,
  profit roof (auto-close at a fall of 80/70/60/50 %, `roofBps`, cannot be removed). RSF fee is baked into every short,
  its own Short fund. No coins issued → place a sell order, it fills when they are. Sim: `docs/backx/sim/short_roof.py`,
  spec `docs/backx/SHORT-SPEC.md`. Web Buy/Sell (Hedge/Short) and coin issuing on the Issue page follow the contracts.
- Server never decides outcomes from client-sent numbers; on-chain state is the source of truth for balances.
- Participation (owner 2026-10-20, moved to the front page 2026-10-22): "Participate" on backx.trade logs in (Privy)
  and records one participation per account. "Launch App" (header + hero) goes to app.backx.trade, where the login
  step is (AppGate: log in → admins get the app, others "not open yet"). Front page also has "Buy $GAZZ" (Uniswap,
  Robinhood Chain) + copyable $GAZZ CA 0x08a5d78a4bc7754e8aff87b4509e007baeb685f3. Speed figures on it are the modelled
  flash-crash sim results and launch targets; the owner removed the on-page footnote (2026-10-22), the Whitepaper carries the method. Old app paths on backx.trade redirect to app.backx.trade (vercel.json);
  app.backx.trade sends X-Robots-Tag noindex. `/api/venture/me` + `POST /api/venture/participate`: session required, own Redis
  limit, one row per account (`venture_participants`, primary key privy_did, idempotent). Admin page `/admin/participants`.
- Admin portal (owner 2026-10-19): `/admin` (Listed assets), `/admin/users`, `/admin/contracts`, `/admin/participants`, `/admin/branding` and `/admin/keepers`, button on the profile page for admins.
  Web: own lazy chunk, rendered only when `/api/auth/me` says admin; private pages get noindex. Server `/api/admin/*`:
  session + ADMIN_WALLETS or 404, own Redis rate limit (GET 120/min, writes 30/min), POST must be JSON, strict
  validation (Robinhood Chain 4663, addresses, fee tiers, max 20×, margin ≤ 5 %, logo only from CSP image hosts),
  every write in `admin_audit`. Listed assets are a prepared list only; the Safe configures the contracts.
- SEO / AI search (reviewed 2026-10-23): canonical host is https://www.backx.trade (apex redirects there); every public page's title, description and preview image live in `web/src/lib/seoPages.ts`, and the build (vite.config.ts) writes `dist/whitepaper.html` with its own head. Admin → Branding (`/admin/branding`) shows all brand images, icons, chain and login logos and each page's link preview; brand images are no longer under Profile → Documents. index.html carries full meta, Open Graph, JSON-LD (Organization, WebSite, WebApplication, FAQPage;
  a data block, not executed) and a no-JS text version inside #root. `robots.txt` allows search and AI crawlers
  (blocks /profile, /admin), plus `sitemap.xml`, `llms.txt`, `site.webmanifest`. Keep FAQ/llms.txt in sync with the
  product (no yield promises, multiplication not leverage).
