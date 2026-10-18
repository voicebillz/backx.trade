# backx.trade

Hedge & Issuer Trading. Hedge with multiplication, issue and earn on every hedge. Real tokens behind every position.

- `web/` trading terminal (React + Vite). `cd web && npm install && npm run dev`
- `brand/` logo, X profile picture and X banner in 4K
- `docs/backx/` product spec, design kit, security notes, simulations

## Deploy
- **Vercel:** import the repo, set Root Directory to `web`. Env: `VITE_COMING_SOON=true` (overlay on), later `VITE_PRIVY_APP_ID`.
- **Railway:** server/keeper comes later (see `docs/backx/HEDGE-ISSUER-SPEC.md` §9).
- **Privy:** create a separate app for backx, enable only email/Google/Apple/X, allowed origins `backx.trade` + `www.backx.trade`.
