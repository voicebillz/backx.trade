# backx.trade: Hedge & Issuer, spesifikasjon (utkast 2026-10-18)

> Status: **designet og simulert, IKKE bygget, IKKE auditert.** Tallene under
> kommer fra simuleringene 2026-10-15 på ekte minuttpriser (skriptene ligger i
> `docs/backx/sim/`). Punkter merket **ÅPEN** må eieren avgjøre før kontraktene
> skrives. Ekstern sikkerhetsreview er obligatorisk før ekte TVL.

> **Tillegg 2026-10-18 (eier):** Short-siden og token-reserven er spesifisert i
> `SHORT-SPEC.md`. Hedge tillater nå også **1×** (ingenting lånes, ingen likvidering, issuer 0 %).
> Hver coin har to reserver: USD (backer Hedge) og selve tokenet (backer Short).

## 1. Produktet i én setning
To sider av samme marked: **Hedger** tar en posisjon med multiplikator (2× og
oppover) på en coin, og **Issuer** fyller multiplikatoren med egen kapital og
tjener på hver hedge.

- Utad sier vi **«multiplication»**, ikke «leverage» (eier 2026-10-15).
- Alt er dekket av **ekte tokens**: posisjonen kjøper og selger faktisk coinen.
  Ingen hus-likviditet, ingen syntetiske kontrakter (eier: «faktisk holdings
  begge sider»).
- Eget nettsted: **backx.trade**, eget design (se `DESIGN-KIT.md`). Koblet til
  gazz.fun via GUSD og fee-rutingen til $GAZZ- og TANKS-holdere.
- Markeder: memecoins på Robinhood Chain, tokenized stocks og native tokens
  (ETH, og BTC hvis det finnes en dyp pool).

## 2. Rollene

| | Hedger | Issuer |
|---|---|---|
| Gjør | Åpner posisjon med innsats X og multiplikator m | Setter inn GUSD i en Issuer Vault per coin |
| Risiko | Kan tape innsatsen (likvidering) | Lav risiko: får lånet tilbake **først**. Eneste reelle risiko er et brått fall forbi likvideringsprisen før salget går gjennom (gap) |
| Tjener | Gevinsten minus issuer-andelen | Lånegebyr + andel av gevinst + andel av restverdien ved likvidering |
| Ser | Posisjon, PnL, likvideringspris | Saldo i dollar (GUSD), opptjent, utnyttelse |

Copy-regel: **aldri «zero risk» / «0 risk»**. Eier har godkjent «Low-risk».
«Your principal comes back first» er riktig å si.

## 3. Pengeflyt

### 3.0 Konto og innskudd (eier 2026-10-18, LÅST)
- **KUN social login** på backx.trade (Privy: e-post-kode, Google, Apple, X).
  Ingen eksterne wallets, ingen WalletConnect.
- Hver bruker får en **Privy embedded wallet som de eier selv** (selvforvaring,
  kan eksporteres i Settings). Det er kontoen.
- **Innskudd går direkte til brukerens egen wallet** på Robinhood Chain: vis
  adresse + QR, brukeren sender USDG/GUSD/ETH fra børs eller annen wallet.
  **Ingen Relay, ingen bro, ingen bank- eller escrow-pool i mellom.** Saldoen er
  det som ligger on-chain i walleten (les `balanceOf`, ikke en database).
- **Uttak:** brukeren skriver selv inn mottakeradresse og sender fra egen wallet.
  Aldri en fast mottaker.
- All handel (åpne/lukke hedge, sette inn/ta ut av vault) **signeres fra
  brukerens egen wallet** mot kontraktene. Serveren holder aldri brukerpenger.
- **Gass:** embedded wallets trenger litt ETH. **ÅPEN:** Privy gas sponsorship
  (paymaster) eller gjenbruk av gazz.fun sitt gas-topup-endepunkt. Aldri nye
  gaver utenfor det.
- Dette erstatter gazz.fun-regelen «social = Cash-first» for backx: på backx er
  det ingen Cash, bare egen wallet.

### 3.1 Issuer setter inn
1. Issuer setter inn GUSD (eller USDG) **fra egen wallet** i vaulten for en
   coin, for eksempel PONS. Eksakt approve (eller permit) som nullstilles.
2. Vaulten holder **USDG** internt (GUSD unwrappes én gang inn og wrappes én
   gang ut). Da slipper vi wrap-gebyret på 0,2 % ved hver posisjon.
3. Issuer får vault-andeler (ERC-4626-stil) **i sin egen wallet**. Saldoen
   vises alltid i dollar.

### 3.2 Hedger åpner (eksempel: $100, 2×, PONS)
1. Fra innsatsen trekkes åpningsgebyrer (se §5): 2 % holders + 0,5 % safety
   fund. Resten er hedgers egenkapital E.
2. Vaulten låner ut L = (m − 1) × X = $100, og betaler 0,2 % av L i lånegebyr
   til issuer.
3. E + L byttes til PONS i én transaksjon via rute-motoren (PCS Infinity +
   Uniswap v4, best execution per leg; samme motor som fondene).
4. Coinene ligger låst i posisjonskontrakten. Verken hedger eller issuer kan
   flytte dem.

### 3.3 Hedger lukker (eller likvideres)
1. Coinene selges tilbake til USDG i samme transaksjon.
2. **Fossefall (waterfall), alltid i denne rekkefølgen:**
   1. Issuer får **lånet L tilbake først**.
   2. Gevinst: issuer får andelen p av gevinsten, hedger resten.
   3. Likvidering: av hedgers rest får issuer andelen s, hedger (1 − s).
3. Hedgers utbetaling går **rett tilbake til hedgers egen wallet** (USDG eller
   GUSD). Ingen Cash-saldo, ingen «Pay with»-velger.
4. **Rund alltid NED** på alle beløp som sendes (Math.floor på enheter).

### 3.4 Hedger betaler alle swap-kostnader
Issuer skal alltid få nøyaktig sitt dollarbeløp tilbake. Swap-fee og price
impact på hele posisjonen (E + L) trekkes fra hedgers del. Det er det som
begrenser høy multiplikator (se §6).

## 4. Likvidering

- **Formel:** likvideringsfall ≈ (1 − e) / m, der e er andelen av hedgers
  egenkapital som er igjen når vi likviderer.
- **Måles på netto salgsverdi** (det coinene faktisk kan selges for etter fee og
  impact), ikke på skjermkursen. Trigger: netto exit ≤ L × (1 + buffer) + e × E,
  buffer 0,3 % av L.
- **Pris mot manipulasjon:** Issuer tjener på likvideringer. Derfor TWAP eller
  oracle-vakt + minimum-out på hvert bytte, så ingen kan presse prisen i én
  blokk for å utløse en likvidering.
- **Keeper:** rask likvidator (sekunder). Simuleringen antok en treg keeper som
  selger ved slutten av minuttet. Det er et forsiktig anslag. **ÅPEN:** bare vår
  keeper, eller permissionless likvidering med liten belønning?
- **Gap-risiko:** faller prisen forbi likvideringspunktet før salget går
  gjennom, kan issuer tape. Dette dekkes av safety fund (§5).

### Parametertabell (fra simuleringen, sim2.py)

| m | e (hedgers rest ved likv.) | s (issuers andel av resten) | p (issuers andel av gevinst) |
|---|---|---|---|
| 2× | 40 % | 50 % | 15 % |
| 3× | 35 % | 60 % | 20 % |
| 5× | 30 % | 70 % | 25 % |
| 7× | 25 % | 80 % | 30 % |
| 10× | 20 % | 85 % | 30 % |
| 15× | 15 % | 90 % | 30 % |
| 20× | 12 % | 90 % | 30 % |
| 25× | 10 % | 90 % | 30 % |
| 30× | 8 % | 90 % | 30 % |

## 5. Gebyrer (per $100 innsats)

| Gebyr | Sats | Går til |
|---|---|---|
| Holders | **2 % av innsatsen** ved åpning (aldri av hele posisjonen) | 30 % $GAZZ / 30 % TANKS / 40 % treasury-middleman (se §8) |
| Lånegebyr | **0,2 % av lånt beløp L** ved åpning | Issuer-vaulten |
| Safety fund | **0,5 % av innsatsen** ved åpning | Dekker issuer ved gap. Simulert: dekket alle gap med overskudd på likvide coins |
| Swap + price impact | pool-fee per vei | LP-ere (ikke oss). Idé: kjør gjennom våre egne PCS Infinity-pooler med hook, så tilfaller en del issuers og holders |

Simulert total kostnad for hedger per $100 (meme-pool 0,3 %, $1M dybde):

| m | Holders | Lån | Safety | Swap/LP | Totalt |
|---|---|---|---|---|---|
| 2× | $2 | $0,20 | $0,50 | $1,30 | $4,00 |
| 5× | $2 | $0,80 | $0,50 | $3,50 | $6,80 |
| 10× | $2 | $1,80 | $0,50 | $7,90 | $12,20 |
| 15× | $2 | $2,80 | $0,50 | $13,40 | $18,70 |
| 20× | $2 | $3,80 | $0,50 | $19,90 | $26,20 |

## 6. Maks multiplikator per coin (automatisk)

Maks m settes **per coin** ut fra poolens fee, dybde og hvor mye prisen hopper
per handel. Posisjonsstørrelsen begrenses også, så kjøp + salg aldri flytter
prisen mer enn ca. 1 %.

| Coin-type | Anbefalt maks | Hvorfor (simulering 2026-10-15) |
|---|---|---|
| Tynne coins (GAZZ, ~$56k pool, de fleste GazzPad-coins) | **3×** | Fra 5× er gap-tapene større enn safety fund dekker |
| Memecoins med 0,3 %-pool og ~$1M dybde | **10×** (15× maks) | 0 gap ved 10×, sjeldne ved 15× |
| Dype pooler, 0,05 % fee (ETH/BTC-type, store aksjer) | **25×** (30× hvis per-coin-sim holder) | 0,03 % gap, 8 % likvidert |
| Alt over ~40× med ekte kjøp | **ikke mulig** | Swap-kostnaden gjør posisjonen likvidert idet den åpnes |

Merk: lanseringsvideoen viser 30× på PONS. Det krever en dyp pool. **ÅPEN:**
hvilke coins som lanseres, og en per-coin-sim før hver listing.

Parkert alternativ: **Turbo** (syntetisk, gevinsttak, oracle-pris, ingen ekte
kjøp) for 100×–3000× på de mest likvide coinene. Issuer simulert +2,8 til
+5,8 % per posisjon med tak 3–5× og 40 % andel. Bryter «ekte tokens»-prinsippet,
så det er IKKE valgt. Krever egen eierbeslutning og juridisk sjekk.

## 7. Hva issuer tjener (simulert, 30 000 posisjoner per m, holdt 5 min–3 døgn)

| m | Likvideres ved | Andel likvidert | Hedger beholder ved likv. | Issuer per likv. | Issuer snitt per posisjon |
|---|---|---|---|---|---|
| 2× | −29 % | 0,1 % | $19,70 | $19,90 | +$0,44 |
| 5× | −13 % | 3,3 % | $8,90 | $22,10 | +$2,57 |
| 10× | −6,7 % | 12 % | $3,10 | $20,50 | +$6,48 |
| 15× | −4,3 % | 19 % | $1,70 | $17,90 | +$9,29 |
| 20× | −2,9 % | 26 % | $1,50 | $16,90 | +$11,40 |

(Per $100 hedger-innsats, meme-pool 0,3 %. Snitt av DOGE, PEPE og WIF, begge
prisretninger.)

Salgsargumenter som stemmer:
- «Liquidated? You still keep up to 20%.» Gjelder **ved likvideringsprisen**.
  Ved gap kan det bli mindre, så det står i Docs.
- «No funding fees. One fee at open.»
- «Real tokens behind every position.»
- «Users back users, not the house.»

## 8. Kobling til gazz.fun

- **GUSD:** issuers og hedgers bruker GUSD (`0x9096116e558524413cFC1bA10A58587CC88f3fc6`,
  bank `GazzCashBank` proxy `0x657688F60105C945e3311e4A162935CcbaA98F66`). Se
  `docs/gusd/DESIGN.md` + `DEPLOYED.md`. Wrap/unwrap koster 0,2 % hver vei med
  mindre adressen er `feeExempt`. **ÅPEN:** gjøre vault-kontraktene feeExempt
  (Safe-beslutning).
- **Login: EGEN Privy-app for backx** (anbefalt 2026-10-18, erstatter «samme app»).
  Grunnen er verifisert i koden: gazz.fun **flytter automatisk ETH** fra en
  social-brukers embedded wallet inn i GUSD-banken (CashflowWatcher.tsx og
  PredictWalletUI.tsx: «social wallets never park money», etter ~60 s, over en
  minimumsgrense). Med samme Privy-app er det samme wallet, så ETH en bruker
  setter inn for backx ville blitt sugd inn i gazz.fun-Cash så snart de åpner
  gazz.fun. Det bryter backx-prinsippet om at pengene blir i egen wallet.
  - Egen app: brukeren logger inn med samme Google/e-post, men får en **egen
    wallet-adresse** på backx. Ingen automatikk fra gazz.fun kan røre den.
  - En XSS-feil på den ene siden kan heller ikke signere fra den andre sidens wallet.
  - backx-klienten: `loginMethods: ["email", "google", "apple", "twitter"]`
    (ingen `"wallet"`), `externalWallets: {}`. Kun disse metodene slått på i
    backx-appens dashbord. Allowed origins = kun backx.trade.
  - Valgfritt senere: Privy cross-app («Fund from your gazz.fun wallet»), der
    brukeren selv godkjenner en overføring. gazz.fun har allerede
    `@privy-io/cross-app-connect` som avhengighet.
  - Fee-koblingen til holdere påvirkes ikke; den går via kontrakter og
    collector-walleten, ikke via brukernes wallets.
- **Holder-gebyret (2 %)** rutes som de andre airdrop-strømmene
  (mønster: `server/src/gusdFeeAirdrop.js`):
  1. En **egen backx-fee-collector-wallet** (egen nøkkel på workeren, ALDRI
     samme som FUND_FEE_KEY eller GUSD_FEE_KEY).
  2. Den swapper USDG → ETH ≥ $10.
  3. Splitt: **30 % → pott BACKX_HOLDERS, 30 % → BACKX_TANKS** i
     GazzPadDistributor (`0x5dfDdEA823386016859B6cfE24B35458B8F42CD3`),
     airdroppet av GazzPad-keeperen. **40 % → treasury-middleman**
     `0xb029BD373805247647127fBFbbf9f97716eE5876` (= 20 % burn + 20 % treasury).
  4. Holders får ETH, ikke en kurv. Én overføring per holder.
- **Eierskap:** Safe `0xfa408F75490C0412d4a5F45FA7553Aff03249BE4` eier alt som
  har eier. Owner-nøkler håndteres ALDRI av server eller skript.
- **Ruting:** gjenbruk rute-motoren fra fondene (PCS Infinity + Uniswap v4, best
  execution per leg, `minOut > 0` via balanse-delta, eksakte approvals som
  nullstilles).

## 9. Kontrakter (forslag)

| Kontrakt | Ansvar |
|---|---|
| `BackxIssuerVault` (én per coin, eller én med per-coin-bøtter) | Issuer-innskudd i USDG, andeler, utlån til posisjoner, mottar lån + gebyr + andeler tilbake |
| `BackxPositionManager` | Åpne/lukke/likvidere, holder coinene per posisjon, fossefallet i §3.3, maks m + maks størrelse per coin |
| `BackxRouterAdapter` | Swaps via PCS/Uniswap med minOut + TWAP/oracle-vakt |
| `BackxSafetyFund` | Mottar 0,5 %, dekker issuer-tap ved gap, overskudd til issuers (**ÅPEN:** eller holders) |
| `BackxFeeCollector` | Mottar 2 % holders-gebyr (tynn, som GazzPadFeeCollector) |
| Keeper (server) | Likvidering, fee-swap + airdrop-handoff, helsesjekk |

**ÅPEN:** oppgraderbar (UUPS/Beacon, Safe eier, som Fund V3) eller immutable
(som GazzPadFactory). Anbefaling: oppgraderbar i starten, timelock, Safe eier.

Prinsipper fra gazz.fun som SKAL gjelde:
- Pro-rata, ingen udekket mint. Issuer kan alltid ta ut ledig (ikke-utlånt) kapital.
- Server avgjør aldri utfall basert på klientens tall.
- Tester + fork-tester mot Robinhood mainnet før deploy. Ekstern review før stor TVL.
- `evm_version`: følg det gazz.fun bruker for kjeden (cancun på mainnet 4663).

## 10. Byggerekkefølge
1. Låse de ÅPNE punktene med eier.
2. Per-coin-simulering for de første 5–10 coinene (`sim/sim2.py` med ekte pool-dybde og fee).
3. Kontrakter + enhetstester + fork-tester.
4. Server: keeper (likvidering), prisvakt, fee-ruting til gazz.fun.
5. Web: backx.trade (se `DESIGN-KIT.md`), først med testbeløp og maks-cap.
6. Ekstern review → lansering med lave caps → øk gradvis.

## 11. Åpne beslutninger (samlet)
1. Hvilke coins og hvilken maks m per coin ved lansering.
2. Safety fund-overskudd: til issuers eller holders.
3. Permissionless likvidering eller bare vår keeper.
4. Oppgraderbar eller immutable.
5. Privy-app: **egen app anbefalt** (gazz.fun auto-sweeper ETH fra embedded wallets til GUSD). Eier bekrefter.
9. Gass for embedded wallets: Privy gas sponsorship eller gazz.fun gas-topup.
6. feeExempt for vaultene i GazzUSD.
7. Juridisk sjekk på multiplikator mot tokenized stocks (derivat-lignende).
8. Navn på rollene utad: «Hedger / Issuer» (som i videoen) er standard.
