# backx.trade: design kit (2026-10-18)

Del A er alt vi har lært på gazz.fun som skal gjelde her også. Del B er den nye
visuelle identiteten. backx.trade skal se ut som en **trading-terminal**, ikke
som gazz.fun. Del C er en startpakke med tokens som kan limes rett inn.

---

## A. Standarder fra gazz.fun som gjelder

### A1. Kvalitet og tilgjengelighet
- **Skeleton loaders på alt som venter på data.** Aldri tom flate, aldri bare
  «Loading…», aldri en død «—» på første last. Skeleton i innholdets form,
  `aria-busy="true"` på containeren, shimmer stopper under
  `prefers-reduced-motion`. Siste kjente verdi (snapshot) ved returbesøk.
- **Semantiske tokens for status:** `--success`, `--warning`, `--danger`,
  `--info` med `-bg`-varianter for begge temaer. Aldri ny hardkodet hex for
  status. Opp/ned har egne tokens (`--up`/`--down`).
- **WCAG 2.1 AA, 0 axe-violations på hovedrutene.** Skip-link først,
  `<main id="main">`, global `:focus-visible`, `aria-label` på ikonknapper,
  `inert` på skjulte fokuserbare elementer, `role` når en div har `aria-label`.
  Mønster: `web/scripts/a11y-scan.mjs` i gazz.fun.
- **Kort tekst:** sideintro = én setning. Undertekster og legend-noter = én kort
  setning. Detaljer bor i Docs.

### A2. Tema
- **Mørk er standard, men følger nettleseren:** brukerens toggle vinner alltid
  (lagres). Uten lagret valg: nettleser satt til light → lys, alt annet → mørk,
  og endringen følges live. Bootstrap-script i `index.html` før første paint
  (mønster: gazz.fun `web/index.html` + `web/src/lib/theme.tsx`).
- **`<select>` arver temaet:** `color-scheme` + mørk `option`-bakgrunn globalt.
  Aldri nettleserens hvite liste.
- Alle farger via tokens på `:root`, redefinert for mørk/lys. `body` har alltid
  eksplisitt bakgrunn.

### A3. Penger og tall
- **Rund alltid NED** når en saldo blir et beløp som sendes (Max, «bruk alt»,
  lukk alt, uttak): `Math.floor` på minste enhet. Aldri `toFixed`/`Math.round`.
  Lærepenge: $4,8669 rundet til $4,87 ble avvist av banken. Visning kan runde
  vanlig.
- `font-variant-numeric: tabular-nums` på alle tall som står i kolonner eller
  oppdateres live, så sifrene ikke hopper.
- Store beløp: `$12.4K`, `$3.1M` i lister. Fullt beløp i tooltip/detalj.

### A4. Login og betalingskilde (backx-avvik fra gazz.fun)
- **backx.trade har KUN social login** (Privy: e-post-kode, Google, Apple, X).
  Ingen eksterne wallets, ingen WalletConnect, ingen «Connect wallet»-knapp.
- Hver bruker får en **Privy embedded wallet som de selv eier** (kan eksporteres
  fra Settings). All handel signeres fra den.
- **Innskudd går direkte til brukerens egen wallet:** vis adresse + QR på
  Robinhood Chain. Ingen Relay, ingen bro, ingen bank/escrow-pool i mellom.
  Saldo = det som ligger on-chain i walleten.
- **Uttak:** brukeren skriver selv inn mottakeradressen (som gazz.fun-regelen for
  social logins). Aldri en fast mottaker.
- **Privy-login skal være sømløs:** når Privy har bekreftet, skal brukeren ikke
  måtte trykke «Sign in» igjen. gazz.fun løste det med et `pending login`-flagg
  i sessionStorage (10 min). Se `web/src/lib/emailAuthContext.tsx`.
- Sikkerhetsmodellen for login og sesjoner står i `SECURITY-AUTH.md`.

### A5. Mobil
- 16 px gutter, aldri horisontal sidescroll. Brede tabeller får egen
  `overflow-x: auto`.
- Input-felt ≥ 16 px skrift (ellers zoomer iOS inn).
- Bunnark (bottom sheets) for valg som ikke får plass. Nedtrekk som flyter over
  kanten på mobil blir et fullbredde-ark.
- Trykkflater ≥ 44 px.

### A6. Bevegelse
- UI-animasjoner under 300 ms. Ease-out inn, ease-in-out for flytting. Aldri
  ease-in. `cubic-bezier(0.22, 1, 0.36, 1)` som standard.
- Ingen animasjon på tastatur-handlinger. Knapper: `scale(0.97)` på `:active`.
- Prisflash ved endring (opp/ned-farge i ~400 ms) uten layout-skift.
- Alt har `prefers-reduced-motion`-fallback.
- Skills i gazz.fun-repoet: `impeccable`, `emil-design-eng`,
  `design-taste-frontend`, `motion-video`, `ct-post`. Kopier `.claude/skills/`
  over. `apple-design` er en bruker-skill og er tilgjengelig uansett.

### A7. Drift og bygg
- Vercel: ingen preview-bygg for `claude/**`-grener, `ignoreCommand` som hopper
  over bygg når `web/` er uendret. Push til main i bolker. Mønster:
  gazz.fun `web/vercel.json` + `web/scripts/vercel-ignore.sh`.
- Aldri commit `.env`/nøkler. Owner-nøkler håndteres aldri av server/skript.

### A8. Grafikk, video og X
- Bilder: 4K-kilde minimum (banner 4500×1500, PFP 2000×2000). Sjekk skarphet
  med 1:1-utsnitt. Canvas: sett width/height til full oppløsning, `ctx.scale()`.
- Video: alltid MP4 (h264, `-preset slow -crf 14–16 -pix_fmt yuv420p`). GIF bare
  på forespørsel (`palettegen` + `paletteuse=dither=sierra2_4a`).
- X-poster: engelsk, ingen emoji, ingen hashtags, ingen tankestreker, lenke i
  første svar, ingen ubekreftede partnerskap, ingen avkastningsløfter, aldri
  «zero risk». Skill: `ct-post` + `motion-video`.

---

## B. Ny identitet: backx.trade som trading-terminal

### B1. Retning
Presis, rolig og tett: et instrumentpanel for folk som handler, med fargene
tradisjonell finans har brukt i tiår for å signalisere trygghet. Grafen er
helten, ordrebilletten er den eneste store knappen, og alt annet er stille tall
i rutenett.

**Skal IKKE ligne gazz.fun:** ingen Instrument Serif-titler, ikke Geist som
hovedfont, ingen lime-merkevare, ingen casino-gull, ingen store marketing-heroer
inne i appen, ingen lilla-til-blå gradienter, ingen neon/glød.

### B2. Farger som stoles på i tradisjonell finans (research 2026-10-18)

Hva vi fant:
- **Blått og marineblått er finansens trygghetsfarge.** Det er bransjestandarden
  (JPMorgan nær-marine, Schwab dyp cyan + marine, Goldman «Action blue» i
  produkt-UI). En kontrollert studie på en fiktiv bank fant at blå identitet ga
  høyere tillit, mens oransje ble oppfattet som mer innovativt; tillit predikerte
  lojalitet. Én studie, men den peker samme vei som hele bransjen.
- **Problemet med blått:** alle bruker det, så merker flyter sammen. Fintech
  bryter det med én tydelig aksent. Konsistens over tid bygger tillit mer enn
  fargen i seg selv (HSBC bygde rødt til tillit over tiår).
- **Terminal-arven:** Bloomberg-terminalen er nær-svart med amber/oransje
  tekst og tette tabeller. Mørkt + amber leses som «profesjonelt verktøy».
- **Grønn opp / rød ned** er vestlig standard. Bloomberg anslår ca. 20 000 av
  sine brukere har fargesvakhet, og tilbyr alternative skjemaer. FxPro la i 2026
  inn valg som Orange·Green, Yellow·Blue og Monochrome. **Fargen skal aldri være
  eneste signal:** alltid ▲/▼ og +/−.
- **Lokale konvensjoner:** Fastlands-Kina (og Taiwan, ofte Japan) bruker **rødt
  for opp og grønt for ned**. Hong Kong bruker grønt opp. Gjør retning til en
  innstilling.

Oppskriften vår ut fra dette:
1. **Marineblå er grunnmuren** (merkevare, logo, lys header), **handlingsblå** er
   eneste knappefarge. Det er «bank-tryggheten».
2. **Gull/amber er issuer-fargen**: kapital, «backing», terminal-arven. Brukes
   sparsomt: issuer-fanen, vault-tall, issuer-CTA.
3. **Grønn/rød kun for retning og PnL**, alltid med ▲/▼ og fortegn.
4. **Kalde, nøytrale grafitt-/skifergrå** for flater. Ingen rene grå: alle har
   et lite blåstikk mot merkevaren.
5. **Innstilling «Price colors»:** Green up / Red up (Asia) / Blue·Orange
   (fargesvakhet) / Monochrome.

| Token | Mørk | Lys | Bruk |
|---|---|---|---|
| `--bg` | `#0A0F1A` | `#F5F7FA` | Side |
| `--panel` | `#0F1626` | `#FFFFFF` | Paneler (graf, billett, tabeller) |
| `--raised` | `#162036` | `#EEF2F7` | Hover, aktiv rad, input |
| `--line` | `rgba(255,255,255,.07)` | `rgba(11,31,58,.09)` | Hårlinjer |
| `--ink` | `#E6EBF2` | `#0B1526` | Hovedtekst |
| `--ink-2` | `#9CA8BA` | `#45526A` | Sekundær |
| `--ink-3` | `#7E8BA0` | `#5E6A81` | Labels |
| `--navy` | `#0B1F3A` | `#0B1F3A` | Merkevare: logo, lys topbar, OG-bilder |
| `--action` | `#4D8BFF` (mørk tekst på) | `#1D4ED8` (hvit tekst på) | Primærknapper, aktiv fane, lenker |
| `--gold` | `#E3B341` | `#806208` | Issuer-siden |
| `--up` | `#22C38E` | `#0A774F` | Opp/PnL+ (alltid med ▲ og +) |
| `--down` | `#F2555F` | `#C8283A` | Ned/PnL−/likvidering (alltid med ▼ og −) |
| `--info` | `#6AA8FF` | `#1D5FD1` | Info |
| `--warning` | `#F0A83A` | `#A85A00` | Advarsel |

Kontrast er målt (WCAG): all tekst ≥ 4,5:1 mot `--bg` og `--panel` i begge
temaer. Knapp: mørk tekst på `#4D8BFF` = 5,9:1, hvit på `#1D4ED8` = 6,7:1.

- Hedger-siden bruker `--action` + `--up`/`--down`, issuer-siden bruker `--gold`.
  Da ser man med en gang hvilken side man er på.
- Tillitssignaler i UI (TradFi-praksis): kontraktadresser med «Verified»-lenke
  til explorer, «Audited by …» bare når det er sant, tydelige gebyrer før
  signering, og en status-side.

### B3. Typografi
- **UI:** IBM Plex Sans (400/500/600). **Tall/data:** IBM Plex Mono
  (tabular). Begge fra Google Fonts, med system-fallback.
- Skala (px): 11 labels (uppercase, +0.06em) · 12 tabell · 13 brødtekst ·
  15 paneltitler · 20 pris i header · 28 posisjonsverdi · 40 hero-tall på
  issuer-siden.
- Negativ tracking (−0.02em) på tall ≥ 20 px.

### B4. Layout (desktop ≥ 1200 px)
```
┌───────────────────────────────────────────────────────────────┐
│ Topbar: logo · marked-søk (⌘K) · Trade | Issue | Portfolio ·  │
│         GUSD-saldo · Deposit · konto                           │
├──────────┬──────────────────────────────────┬─────────────────┤
│ Markeder │ Header: coin, pris, 24h, likv.   │ Ordrebillett    │
│ (søk,    │ dybde, maks m                    │ Hedge | Issue   │
│ favoritter,├────────────────────────────────┤ beløp + Max     │
│ 24h %)   │ Graf (lightweight-charts v5)     │ m-slider        │
│          │ likv.-linje + entry-linje        │ likv.-pris live │
│          │                                  │ gebyr-oversikt  │
│          │                                  │ [Open hedge]    │
├──────────┴──────────────────────────────────┴─────────────────┤
│ Bunnpanel: Positions · History · My vaults (tabeller)          │
└───────────────────────────────────────────────────────────────┘
```
- Paneler skilles med hårlinjer, ikke kort med skygger. Radius 6 px.
- Tetthet: radhøyde 32 px i tabeller, 8 px grunnenhet.

### B5. Mobil (< 900 px)
- Øverst coin-header og pris. Grafen under (40 % høyde).
- **Sticky bunnbar** med «Hedge» og «Issue». Trykk åpner billetten som bunnark.
- Posisjoner som kort-liste under grafen, ikke tabell.

### B6. Nøkkelkomponenter
1. **Multiplikator-slider:** merker på 2×, 3×, 5×, 10× opp til coinens maks.
   Sporet farges gradvis fra `--ink-3` mot `--down` jo nærmere maks. Under
   slideren står likvideringsprisen og «Liquidation at −6.7 %» live.
2. **Fossefall-forhåndsvisning i billetten:** «If it rises 10 %: you +$X,
   issuers +$Y» og «If liquidated: you keep $Z». Tall, ikke prosa.
3. **Gebyr-oversikt:** én sammenleggbar linje «Fees $6.80», som åpner til
   Holders / Borrow / Safety / Swap.
4. **Bekreftelsesark:** innsats, m, likvideringspris, gebyrer, én knapp. Ved
   signering: stegvis status (Swap → Locked → Open), aldri spinner uten tekst.
5. **Issuer-vault-kort** (i `--gold`): innskudd, utlånt (utnyttelse i %), opptjent hittil
   (realisert, ikke projisert APY), safety fund-nivå, Deposit/Withdraw.
6. **Graf:** candles 1m/5m/1h/1d, entry- og likvideringslinje for egne
   posisjoner, crosshair-tooltip med mono-tall.
7. **Ticker-flash:** pris flasher `--up`/`--down` bakgrunn i 400 ms ved endring,
   med ▲/▼ ved siden av tallet.
8. **Toasts:** øverst til høyre, sier nøyaktig hva som skjedde («Hedge opened:
   PONS 5×, $100»).
9. **Tomme tilstander:** én setning + én handling («No positions yet. Open
   your first hedge»).

### B7. Copy
- «Multiplication», ikke «leverage». «Hedge» og «Issue» som verb på knappene.
- Issuer: «Low-risk yield», «Your principal comes back first». Aldri «zero risk».
- Ingen avkastningsløfter. Historiske tall merkes «last 7 days, realized».

---

## C. Startpakke: tokens (lim inn i `src/styles/tokens.css`)

```css
:root {
  --bg:#F5F7FA; --panel:#FFFFFF; --raised:#EEF2F7; --line:rgba(11,31,58,.09);
  --ink:#0B1526; --ink-2:#45526A; --ink-3:#5E6A81;
  --navy:#0B1F3A; --action:#1D4ED8; --on-action:#FFFFFF; --gold:#806208;
  --up:#0A774F; --down:#C8283A; --info:#1D5FD1; --warning:#A85A00;
  --success:var(--up); --danger:var(--down);
  --radius:6px; --u:8px;
  --font:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace;
  --ease-out:cubic-bezier(0.22,1,0.36,1);
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg:#0A0F1A; --panel:#0F1626; --raised:#162036; --line:rgba(255,255,255,.07);
    --ink:#E6EBF2; --ink-2:#9CA8BA; --ink-3:#7E8BA0;
    --action:#4D8BFF; --on-action:#0A0F1A; --gold:#E3B341;
    --up:#22C38E; --down:#F2555F; --info:#6AA8FF; --warning:#F0A83A;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg:#0A0F1A; --panel:#0F1626; --raised:#162036; --line:rgba(255,255,255,.07);
  --ink:#E6EBF2; --ink-2:#9CA8BA; --ink-3:#7E8BA0;
  --action:#4D8BFF; --on-action:#0A0F1A; --gold:#E3B341;
  --up:#22C38E; --down:#F2555F; --info:#6AA8FF; --warning:#F0A83A;
  color-scheme: dark;
}
/* Komponenter bruker --price-up/--price-down for retning.
   «Price colors»-innstillingen settes som data-price på <html>. */
:root { --price-up:var(--up); --price-down:var(--down); }
:root[data-price="red-up"] { --price-up:var(--down); --price-down:var(--up); }
:root[data-price="blue-orange"] { --price-up:var(--info); --price-down:var(--warning); }
:root[data-price="mono"] { --price-up:var(--ink); --price-down:var(--ink-2); }
body { background:var(--bg); color:var(--ink); font:13px/1.45 var(--font); }
.num { font-family:var(--mono); font-variant-numeric:tabular-nums; }
.btn-primary { background:var(--action); color:var(--on-action); }
select, option { color-scheme:inherit; background:var(--panel); color:var(--ink); }
```

Mørk som standard: bootstrap-scriptet i `index.html` setter `data-theme="dark"`
når det ikke finnes et lagret valg og nettleseren ikke ber om lys. Da vinner
mørk også i «ingen preferanse»-tilfellet, slik gazz.fun gjør.

### Teknisk stack (samme som gazz.fun, så kode kan gjenbrukes)
React 18 + Vite + TypeScript, react-router, wagmi 3 + viem 2.55, Privy
(`@privy-io/react-auth` + `@privy-io/wagmi`), `@tanstack/react-query`,
`lightweight-charts` v5. Hosting: Vercel (web) + Railway (server).

### Kilder for fargeresearch
- Bank-identitet og tillit (studie, fiktiv bank): https://repositorio.ulisboa.pt/entities/publication/5c2ad3c1-be35-4ada-97c1-303b67190fb3
- Finans og blått som bransjekonvensjon: https://alphafmc.com/?p=7860 · https://madegooddesigns.com/?p=5764
- Goldman Sachs designsystem (farger): https://design.gs.com/foundation/color-system
- Bloomberg, fargetilgjengelighet i terminalen: https://www.bloomberg.com/company/?p=20491
- FxPro «Colour Adjust» (2026): https://fxpro.com/press-releases/fxpro-launches-new-colour-accessibility-feature
- Rødt opp i Kina/Taiwan/Japan: https://www.benzinga.com/general/education/21/10/23258001/did-you-know-you-dont-want-to-be-in-the-green-if-youre-trading-in-china-japan-or-taiwan
- Fargeblindhet i UI: https://think.design/blog/inclusive-ui-design-for-colorblindness/
