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
   - Settings → Branch: `main`
   - Settings → Networking → Custom domain: `api.backx.trade` (det har du gjort). Ingen andre offentlige domener; slett den automatiske `*.up.railway.app` hvis du vil ha alt bak eget domene.
3. **Variables på api-tjenesten** (lim inn i «Raw Editor»):

```
NODE_ENV=production
ALLOWED_ORIGINS=https://backx.trade,https://www.backx.trade
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

Settes **senere**, ikke nå (vi sier fra når koden trenger dem):

| Variabel | Når | Merk |
|---|---|---|
| `RPC_URL` | Når vi leser priser/saldo on-chain | Kan inneholde API-nøkkel, derfor kun på serveren |
| Keeper-/fee-collector-nøkler | Når kontraktene finnes | Egen Railway-tjeneste uten offentlig domene, én nøkkel per rolle. Aldri Safe-/owner-nøkler |

Sjekk etter deploy: `https://api.backx.trade/health` skal vise `{"ok":true}`. Alle andre adresser fra nettleserens adressefelt skal gi `forbidden`, det er riktig.

## 2. Vercel (backx.trade)

- Settings → General → **Root Directory:** `web` · Framework: Vite · Node 22
- Settings → Git → Production Branch: `main`
- Domener: `backx.trade` som hoved, `www.backx.trade` → redirect til `backx.trade`
- **Environment Variables** (Production):

```
VITE_COMING_SOON=true
VITE_API_URL=https://api.backx.trade
VITE_PRIVY_APP_ID=<samme app-id som PRIVY_APP_ID på Railway>
```

- Alt som starter med `VITE_` havner synlig i nettleseren. **Aldri** hemmeligheter, app-secret eller RPC-URL med nøkkel her.
- Fjerne «Coming soon» ved lansering: sett `VITE_COMING_SOON=false` og redeploy.

## 3. Privy (egen app for backx)

- Login methods: kun **Email, Google, Apple, X**. Ingen «Wallet».
- Embedded wallets: Ethereum, «Create on login: users without wallets».
- **Allowed origins:** kun `https://backx.trade` og `https://www.backx.trade`. Ikke `api.backx.trade` (serveren kaller ikke Privy fra en nettleser),
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
