# Oppsett: Vercel, Railway, Postgres, Redis

Kort: **ja, bruk både Postgres og Redis**, begge i samme Railway-prosjekt som API-et.

| | Hva den brukes til | Hva den IKKE brukes til |
|---|---|---|
| **Postgres** | Brukere (Privy-id ↔ wallet-adresse), sesjoner (kun SHA-256-hash av token), «Log out everywhere», siste gyldige Privy-JWKS, admin-revisjonslogg, keeper-status | Saldoer. Saldo er alltid det som ligger on-chain i brukerens wallet |
| **Redis** | Rate limits, engangsverdier (nonces/idempotency), låser per bruker, cache av priser | Noe som må overleve en omstart |

## 1. Railway (api.backx.trade)

Prosjektet skal ha tre tjenester: **api** (fra GitHub), **Postgres**, **Redis**.

1. **+ New → Database → PostgreSQL** og **+ New → Database → Redis**.
   - Ikke slå på «Public Networking / TCP Proxy» på noen av dem. De skal bare nås internt av api.
2. **api-tjenesten** (GitHub-repoet `voicebillz/backx.trade`):
   - Settings → Source → **Root Directory:** `server`
   - Settings → **Config file path:** `/server/railway.json` (gir start-kommando, healthcheck `/health` og at den bare bygger når `server/` endres)
   - Bygges med `server/Dockerfile` (låst Node-versjon, kjører som ikke-root). Ved en Node.js-sikkerhetsoppdatering: bytt taggen øverst i Dockerfile (`FROM node:…`) og push.
   - Settings → Branch: `main`
   - Settings → Networking → Custom domain: `api.backx.trade` (det har du gjort). Ingen andre offentlige domener; slett den automatiske `*.up.railway.app` hvis du vil ha alt bak eget domene.
3. **Variables på api-tjenesten** (lim inn i «Raw Editor»):

```
NODE_ENV=production
ALLOWED_ORIGINS=https://backx.trade,https://www.backx.trade,https://app.backx.trade
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
PRIVY_APP_ID=<app-id fra Privy-dashbordet for backx>
PRIVY_APP_SECRET=<app-secret fra Privy-dashbordet>
ADMIN_WALLETS=<din backx-wallet-adresse, flere skilles med komma>
RATE_LIMIT_PER_MIN=120
```

- `ADMIN_WALLETS`: adressene som ser hele siden før lansering (overlayet forsvinner for dem). Første gang:
  logg inn på backx.trade, trykk «Copy» ved adressen i overlayet, lim den inn her og redeploy. Kan stå tom.

- `${{Postgres.DATABASE_URL}}` og `${{Redis.REDIS_URL}}` skrives akkurat slik: Railway fyller inn de interne adressene selv. Heter tjenestene noe annet enn «Postgres»/«Redis», bytt navnet i klammene.
- `PORT` settes av Railway automatisk. Ikke sett den selv.
- Serveren **nekter å starte** hvis noe mangler, eller hvis `ALLOWED_ORIGINS` ikke er https. Det er med vilje.

Valgfritt (har offentlige standardverdier, bytt til egne nøkkel-RPC-er ved mer trafikk):

```
RPC_ETHEREUM=
RPC_BASE=
RPC_BSC=
RPC_SOLANA=
RPC_ROBINHOOD=
RPC_ARBITRUM=
RPC_OPTIMISM=
RPC_POLYGON=
RPC_AVALANCHE=
```

Swap (`/api/swap/*`) bruker LI.FI (`li.quest`) og CoinGecko fra serveren; ingen nøkkel trengs.
Saldo (`/api/wallet/balances`) og markedslista (`/api/markets`, demo fra CoinGecko) krever innlogging og caches i Redis.

Settes **senere**, ikke nå (vi sier fra når koden trenger dem):

| Variabel | Når | Merk |
|---|---|---|
| `RPC_URL` | Når vi leser priser/saldo on-chain | Kan inneholde API-nøkkel, derfor kun på serveren |
| `FACTORY_<chainId>` (f.eks. `FACTORY_4663`, `FACTORY_8453`) | Etter engangs-`Deploy.s.sol` på den chainen | Adressen til BackxMarketFactory. Uten den sier «Deploy contracts» i adminportalen hva som mangler |
| `OPENSEA_API_KEY` | Senere, når vi har en OpenSea-nøkkel | Raskere oppslag av hvilke Gazz Tanks en lommebok har (Profil → Staking). Uten nøkkel leser serveren eierne direkte fra kjeden hvert 5. minutt |
| `GAZZ_TANKS`, `STAKING_TANK_POINTS` | Valgfritt | Tanks-kontrakten (standard 0x2613…a9f4) og hvor mange $GAZZ én Tank teller som (standard 10 000, **ÅPEN**) |
| `RESERVE_STABLE_4663`, `RESERVE_STABLE_SYMBOL_4663`, `RESERVE_STABLE_DECIMALS_4663` | Når eier har valgt stablecoin på Robinhood Chain | Robinhood Chain har ingen USDC hos LI.FI ennå (USDG finnes). **ÅPEN** |
| Keeper-/fee-collector-nøkler | Når kontraktene finnes | Egen Railway-tjeneste uten offentlig domene, én nøkkel per rolle. Aldri Safe-/owner-nøkler |

Sjekk etter deploy: `https://api.backx.trade/health` skal vise `{"ok":true}`. Alle andre adresser fra nettleserens adressefelt skal gi `forbidden`, det er riktig.

## 2. Vercel (backx.trade + app.backx.trade)

- Settings → General → **Root Directory:** `web` · Framework: Vite · Node 24 (bare for byggingen)
- Settings → Git → Production Branch: `main`
- Domener: `www.backx.trade` (forside) med `backx.trade` → redirect, **og `app.backx.trade`** (appen). Samme prosjekt og bygg:
  nettsiden ser på adressen. Legg til `app.backx.trade` under Settings → Domains, og hos DNS-leverandøren en
  CNAME-post `app` → `cname.vercel-dns.com` (Vercel viser nøyaktig verdi).
- **Environment Variables** (Production):

```
VITE_API_URL=https://api.backx.trade
VITE_PRIVY_APP_ID=<samme app-id som PRIVY_APP_ID på Railway>
```

- Alt som starter med `VITE_` havner synlig i nettleseren. **Aldri** hemmeligheter, app-secret eller RPC-URL med nøkkel her.
- Appen åpnes for alle ved lansering i koden (AppGate i `web/src/App.tsx`); i dag slipper bare `ADMIN_WALLETS` inn.

## 3. Privy (egen app for backx)

- Login methods: **Email, SMS, Google, X, Discord, Twitch, Telegram, Farcaster, Passkeys**. Ingen «Wallet».
  Apple først når egne Apple-nøkler er satt opp. Telegram krever en egen bot (se nedenfor).
- Embedded wallets: Ethereum, «Create on login: users without wallets».
- **Telegram:** lag en bot hos @BotFather (`/newbot`), sett domenet med `/setdomain` → `backx.trade`,
  og lim inn bot-navn og bot-token i Privy. Bot-tokenet er hemmelig: bare i Privy.
- **SMS:** koster per melding hos Privy, og er utsatt for SMS-svindel. Slå på Captcha (Cloudflare Turnstile) samtidig.
- **Passkeys:** «Enable passkeys for sign up» av = passkey kan bare legges til etter første innlogging (anbefalt).
- **Allowed origins:** kun `https://backx.trade`, `https://www.backx.trade` og `https://app.backx.trade`. Ikke `api.backx.trade` (serveren kaller ikke Privy fra en nettleser),
  ikke Vercel-preview-adresser og ikke `localhost` i produksjonsappen. Trenger vi lokal testing, lager vi en egen Privy-testapp.
- App-id er offentlig. App-secret er hemmelig og går kun i Railway.
- «Secure your app»: begge punktene er gjort i koden. CSP og X-Frame-Options sendes fra `web/vercel.json`
  på alle sider. Huk av begge og trykk Continue. Sjekk: `curl -sI https://backx.trade | grep -i content-security`.

## 4. Hvorfor API-et ikke er åpent
- CORS og origin-sjekk: kun `backx.trade` og `www.backx.trade` får svar. Andre nettsider får 403.
- Rate limit per IP i Redis, felles for alle instanser. Er Redis nede, stenger API-et (503) i stedet for å slippe alt gjennom.
- Maks 64 KB per forespørsel, ingen stack traces i svar, `/health` sier bare ok/ikke ok.
- Postgres og Redis har ingen offentlig adresse.
- Viktig: origin-sjekken stopper andre nettsider, men ikke skript (de kan forfalske headere). Derfor må **alle** ruter som leser eller endrer brukerdata kreve en verifisert innlogging. Det står i reglene i `CLAUDE.md`.

## 5. Se beta-påmeldinger
Railway → Postgres → **Data** (eller «Query») og kjør:

```sql
select wallet_address, signup_method, last_login_method, beta_signup_at
from users order by beta_signup_at desc;
```

Antall per innloggingsmåte:

```sql
select signup_method, count(*) from users group by 1 order by 2 desc;
```


## Validators (2026-10-23)
Railway variable `KEEPERS` (optional): `id:gasAddress:reportPublicKey,...` from `npm run keygen` in `keeper/`. Setup per host: `docs/KEEPERS.md`.
