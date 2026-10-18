# backx.trade: login- og sesjonssikkerhet (2026-10-18)

Basert på en gjennomgang av hvordan gazz.fun gjør det i dag (server/src/index.js,
web/src/lib/emailAuthContext.tsx, privyBridge.tsx, cashGuard.js). Del 1 er det
som skal tas med. Del 2 er det backx skal gjøre **bedre** enn gazz.fun. Del 3 er
sjekklisten før lansering.

backx har **kun social login** (Privy) og **brukerens egen embedded wallet**.
Ingen eksterne wallets, ingen signatur-login. Det fjerner en hel klasse feil.

---

## 0. Egen Privy-app for backx (anbefalt 2026-10-18)
Vurdert å dele Privy-app med gazz.fun, men **frarådet** etter kodesjekk:
1. **gazz.fun auto-sweeper ETH** fra embedded wallets inn i GUSD-banken
   (web/src/components/CashflowWatcher.tsx og PredictWalletUI.tsx, «social
   wallets never park money»). Samme app = samme wallet, så backx-innskudd i ETH
   ville forsvunnet inn i gazz.fun-Cash når brukeren besøker gazz.fun.
2. **Delt risiko:** gazz.fun signerer stille (`showWalletUIs: false`). En XSS på
   én side kunne signert fra wallet-en brukeren bruker på den andre.
3. **Ulike prinsipper:** gazz.fun er «Cash-first» for social, backx er «egen
   wallet, ingen bank».

Derfor: egen Privy-app, kun social-metoder slått på i dashbordet, Allowed
origins = kun `backx.trade` (+ `www`). Serveren avviser likevel alt som ikke er
en social-konto med embedded wallet i det verifiserte tokenet. Egen sesjon på
backx-serveren, ingen deling av gazz.fun-tokens. Brukeren logger inn med samme
Google/e-post, men får en egen wallet-adresse på backx.

Hvis eier likevel vil dele app: da MÅ gazz.fun først slutte å auto-sweepe
wallets som også brukes på backx, og begge sider må ha håndhevet CSP.

---

## 1. Ta med fra gazz.fun

### 1.1 Privy-verifisering på serveren
- Klienten sender Privys **identity token** (ES256 JWT). Serveren verifiserer:
  `alg = ES256`, `iss = "privy.io"`, `aud` = vår app-id, `exp` (30 s slingring),
  `iat` ikke i fremtiden, signatur mot Privys JWKS
  (`auth.privy.io/api/v1/apps/<id>/jwks.json`). JWKS caches 6 t, hentes på nytt
  ved ukjent `kid`.
- Walleten må finnes i tokenets `linked_accounts` som `type: wallet`,
  `wallet_client_type` = privy (embedded). **Embedded-status utledes KUN fra
  verifiserte Privy-data, aldri fra noe klienten sier.**
- Siste gyldige JWKS lagres i databasen, så en Privy-glipp under deploy ikke
  låser alle ute.

### 1.2 Klient-flyten (lærepenger som er løst på gazz.fun)
- **«Pending login»-flagg** i sessionStorage (10 min) som overlever OAuth-
  redirect. Da trenger brukeren ikke trykke «Sign in» to ganger etter Google.
- **Ingen løkke på feil:** aldri POST login på nytt etter en 409/401 i samme
  økt (det ga 429 fra auth.privy.io).
- **Ingen doble prompts:** én global «login busy»-lås.
- **Aldri** `logout()` rett før `login()`, og aldri `login()` når brukeren
  allerede er autentisert. Fast-låst login: fallback etter ~6,5 s som rydder og
  starter på nytt.
- **Ikke logg ut ved forbigående feil:** prøv `fetchMe` igjen ved nettverksfeil
  eller serverrestart.
- Privy-broen skal ikke nullstille seg før Privy er `ready`.
- Privy-config: `embeddedWallets.ethereum.createOnLogin: "users-without-wallets"`,
  `showWalletUIs: false` bare der vi viser egen bekreftelse, `externalWallets: {}`.
  Login-metodene må også slås på i Privy-dashbordet.

### 1.3 Penge-stier
- Hver penge-handling har **per-bruker-lås, idempotency-nøkkel og
  hold-før-send** (mønster: `cashGuard.guardedSpend`).
- Rate limit på penge-ruter: f.eks. 6 per 10 min per wallet, 20 per IP.
- På backx signerer brukeren selv fra egen wallet mot kontraktene. Serveren
  sender aldri brukerpenger. Det er tryggere enn gazz.fun-banken.
- **Gass-hjelp** (hvis vi kopierer gas-topup): krev at adressen faktisk har en
  posisjon eller saldo, 1 per 90 s og maks 4 per dag per adresse, et globalt
  dagsbudsjett, og en reserve på relay-walleten. Foretrekk Privy gas
  sponsorship / paymaster.

### 1.4 Transport
- Origin-vakt: alle `/api/*` krever Origin/Referer fra egne domener.
- `trust proxy = 1`, Cloudflare-IP bare med eksplisitt flagg.
- Body-grense (64 KB holder for backx), `isAddr`-validering på alle adresser.
- Sikkerhets-headere via Vercel: HSTS, nosniff, X-Frame-Options, Referrer-
  Policy, Permissions-Policy.

### 1.5 Hemmeligheter
- Aldri `.env`/nøkler i git (`.gitignore` også `*-keypair.json`; gazz.fun lekket
  en gang en Solana-nøkkelfil). Owner-nøkler håndteres aldri av server/skript.
- `VITE_*` havner i nettleserbundlen: aldri RPC-URL-er med API-nøkkel der.
- Hver keeper/collector har **sin egen** nøkkel (aldri gjenbruk mellom roller).

---

## 2. Gjør bedre på backx (svakheter funnet på gazz.fun)

| # | gazz.fun i dag | backx skal |
|---|---|---|
| 1 | Sesjons- og admin-tokens lagres i klartekst i databasen | Lagre **SHA-256-hash** av tokenet. En databasedump gir ingen aktive sesjoner |
| 2 | Token godtas også i body og query (`?token=`) | **Kun `Authorization`-header** (eller cookie, se 3). Query-tokens lekker til logger og Referer |
| 3 | 30-dagers token i localStorage, CSP bare «Report-Only» med `unsafe-inline/eval` | **HttpOnly + Secure + SameSite=Lax-cookie** på backx-domenet + origin-sjekk, ELLER bearer med **håndhevet nonce-basert CSP**. Ingen `unsafe-eval` |
| 4 | 30 dager, ingen fornyelse, ingen «logg ut alle» | **7 dager glidende**, ny Privy-verifisering for penge-handlinger, liste over sesjoner + «Log out everywhere», tilbakekall når Privy-brukeren slettes |
| 5 | Privy sjekkes bare ved innlogging | Knytt sesjonen til Privy `sid`, verifiser ferskt access token på sensitive ruter |
| 6 | Nonces og rate limits i minnet per prosess | **Redis** for rate limits og engangsverdier, så det holder med flere servere |
| 7 | `link-wallet` lagrer `provider` som klienten sender (verifisert 2026-10-18), så en bruker kan merke sin egen eksterne wallet som «embedded» | Ingen wallet-linking. Embedded = kun fra verifisert `linked_accounts` |
| 8 | Hjemmesnekret JWT-parsing, hardkodet app-id som fallback | Bruk `jose` med `algorithms: ["ES256"]`, `issuer`, `audience`, `clockTolerance`. **Ingen fallback-app-id:** start ikke uten env |
| 9 | CORS standard `*` + auto-tillatte preview-domener | Eksplisitt allowlist, **fail closed** |
| 10 | Admin: wallet-signatur → 24 t token, ingen 2FA | Wallet-signatur **+ passkey (WebAuthn)**, maks 4 t, bundet til enhet, logg over alle admin-handlinger |
| 11 | Døde TOTP/passkey-ruter og noen uautentiserte skrive-ruter | Ikke port døde eller uautentiserte flater |
| 12 | Skrivevern bak et av/på-flagg (`STRICT_WRITE_AUTH`) | Håndhevet fra dag én, uten flagg |
| 13 | Gas-topup gir ETH | Privy gas sponsorship / paymaster med policy |

Anbefalt: **egen Privy-app** (se §0).

---

## 3. Sjekkliste før lansering
- [ ] Egen Privy-app: kun social-metoder, Allowed origins = backx.trade, server avviser ikke-social/ikke-embedded
- [ ] `jose`-verifisering med eksplisitt alg/issuer/audience, ingen fallback-id
- [ ] Sesjonstoken hashet i DB, kun header/cookie, 7 dager glidende
- [x] «Log out everywhere» + tilbakekall: avslutter alle backx-sesjoner, og Privy-sesjonene deres (`sid`) blokkeres
  (`revoked_privy_sids`), så en annen enhet ikke logger seg inn igjen av seg selv. Gjelder også vanlig «Sign out».
- [ ] Håndhevet CSP (ingen `unsafe-eval`), HSTS, frame-ancestors none
- [ ] CORS allowlist, origin-vakt, Redis rate limits
- [ ] Penge-handlinger: lås + idempotency + ny Privy-sjekk
- [ ] Admin: signatur + passkey, kort TTL, revisjonslogg
- [ ] Ingen `VITE_*` med hemmeligheter, `.gitignore` for nøkkelfiler
- [ ] Ekstern review av login + kontrakter før ekte TVL
