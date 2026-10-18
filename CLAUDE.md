# backx.trade

Hedge & Issuer trading on Robinhood Chain. Spec and rules live in `docs/backx/`:
`HEDGE-ISSUER-SPEC.md` (product), `DESIGN-KIT.md` (design), `SECURITY-AUTH.md` (login/sessions).
The owner is not a developer: explain briefly, in Norwegian.

## Layout
- `web/` React 18 + Vite + TypeScript trading terminal (Vercel). Landing page IS the terminal.
  A "Coming soon" overlay covers it for everyone while `VITE_COMING_SOON` is not `"false"`.
- `brand/` logo, X profile picture and banner (4K sources + SVG).
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
- Never commit `.env`, keys or keypair files. `VITE_*` ends up in the browser: no secrets there.
- Owner keys are never handled by a server or script. Safe `0xfa408F75490C0412d4a5F45FA7553Aff03249BE4` owns the contracts.
- On-chain access is read-only unless the owner explicitly asks otherwise.
- Contracts are not written until the open decisions in the spec (§11) are settled with the owner.
