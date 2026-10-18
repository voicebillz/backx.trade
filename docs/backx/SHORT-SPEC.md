# backx.trade: Short & Token-reserve, spesifikasjon (utkast 2026-10-18)

> Status: **designet og simulert, IKKE bygget, IKKE auditert.** Speilbildet av Hedge
> (`HEDGE-ISSUER-SPEC.md`). Tallene kommer fra `sim/short_sim.py` på de samme ekte
> minuttprisene som `sim2.py` (30 dager BTC/DOGE/PEPE/WIF fra Binance + 77 dager GAZZ fra
> GeckoTerminal), kjørt 2026-10-18. Punkter merket **ÅPEN** avgjøres av eier før kontraktene skrives.

## 1. Produktet i én setning
Hver coin har **to reserver**:

| Reserve | Issuer setter inn | Låner ut til | Trader tjener når |
|---|---|---|---|
| **USD-reserve** | USDC | **Hedge** (pris opp) | prisen stiger |
| **Token-reserve** | selve coinen, f.eks. PONS | **Short** (pris ned) | prisen faller |

Issuer velger på **Issue Reserve**-siden: «Issue USD» (USDC-logo) eller «Issue PONS»
(coinens logo). Traderen velger Hedge eller Short i ordrebilletten. Begge sider er ekte
tokens: en short **låner og selger ekte PONS** og kjøper dem tilbake ved lukking.

Copy: «Issue» og «Short», aldri «leverage», aldri «zero risk».

## 2. Pengeflyt for en short (eksempel: $100, 5×, PONS)

Med ekte tall per steg og $100-tabeller for alle nivåer: `SCENARIOS-100.md`.

### 2.1 Åpning
1. Traderen setter inn innsatsen X i **USDC** (samme som Hedge).
2. Åpningsgebyrer av innsatsen: 2 % holders + 0,5 % Reserve Security Fund → E₀.
3. Notional **N = m · E₀** (ved 5× og $100: N ≈ $487,50).
   - Forskjell fra Hedge: på Hedge kjøper traderens egne penger også coinen, så bare
     (m − 1)·X lånes. På Short er traderens penger **sikkerhet i USD**, og *hele*
     eksponeringen er lånte tokens. Derfor lånes m·E, ikke (m − 1)·X.
4. Token-reserven låner ut **q = N / P₀ PONS**. Lånegebyr 0,2 % av N trekkes fra innsatsen → E.
5. Posisjonskontrakten **selger q PONS** til USDC i én transaksjon (rute-motoren, `minOut`,
   TWAP-vakt). Posisjonen holder nå **C = E + N·(1 − kost)** USDC, låst.

### 2.2 Lukking
1. Kontrakten **kjøper tilbake nøyaktig q PONS** (exact-output-swap) med USDC fra C.
2. **Fossefall, alltid i denne rekkefølgen:**
   1. Issuer får **q PONS tilbake først** (samme antall tokens som ble lånt ut).
   2. Gevinst (prisen falt): issuer får andelen **p** av gevinsten, traderen resten.
   3. Likvidering: av traderens rest får issuer **s**, traderen (1 − s).
3. Traderens utbetaling går i **USDC** rett til egen wallet. Rund alltid NED.
4. Issuers andeler (lånegebyr, p, s) **kjøpes som PONS i samme transaksjon** og legges i
   token-reserven. Da er reserven ren PONS, og «opptjent» vises i PONS.
   **ÅPEN:** alternativt utbetale issuer-andeler i USDC. Anbefaling: i tokenet (enklere regnskap,
   «ditt PONS forblir PONS»).

### 2.3 Hvem bærer hva
- **Traderen** kan aldri tape mer enn innsatsen (likvideres før).
- **Issuer** har pris-eksponering i coinen hele tiden (de eier PONS uansett), men får alltid
  samme **antall** tokens tilbake. Eneste reelle risiko: **gap** (se §4).
- Swap-gebyr og price impact begge veier betales av traderen.

## 3. Formler

```
E₀ = X − 0,02·X − 0,005·X
N  = m · E₀                         (USD-verdi av lånte tokens)
lån-gebyr = 0,002 · N               E = E₀ − lån-gebyr
kost = pool-fee + N / pool-dybde    (per vei)
C  = E + N·(1 − kost)               (USDC i posisjonen etter salget)
tilbakekjøp(x) = N · x · (1 + kost) x = P / P₀
Likvidering når  C − tilbakekjøp(x)·(1 + buffer) ≤ e·E
  ⇒ x_L = (C − e·E) / (N·(1 + kost)·(1 + buffer))
Likvideringsstigning ≈ (1 − e) / m  (minus kostnader)
```

Samme parametertabell (e, s, p) som Hedge (§4 i hovedspesifikasjonen), og 1× bruker
2×-raden. **Buffer 1 %** for Short (Hedge bruker 0,3 %), fordi pumper gapper hardere enn fall
på tynne coins. 1 % halverte gap-raten på memecoins ved 15–25× i simuleringen.

| m | Likvideres ved (meme 0,3 %, $1M) | Hedge til sammenligning |
|---|---|---|
| 1× | +57,5 % | ingen likvidering (ingenting lånes) |
| 2× | +27,9 % | −29 % |
| 5× | +12,0 % | −13 % |
| 10× | +6,0 % | −6,7 % |
| 20× | +2,2 % | −2,9 % |

Merk: Short 1× **låner** fortsatt tokens (hele eksponeringen er lånt), så den kan likvideres.
Hedge 1× låner ingenting.

## 4. Likvidering og gap
- Måles på **netto tilbakekjøpskost** (exact-output-quote inkl. fee og impact), ikke skjermkurs.
- **Gap:** stiger prisen forbi likvideringspunktet før tilbakekjøpet går gjennom, holder ikke C
  til å kjøpe alle q PONS. Da kjøpes så mange som mulig, og **Reserve Security Fund kjøper resten**.
  Først når fondet er tomt taper issuers, pro rata.
- **Pris mot manipulasjon:** issuer tjener på likvidering, og en pumpe i én blokk kunne
  likvidert shorts. Derfor TWAP- eller oracle-vakt + `minOut`/`maxIn` på hver swap, akkurat
  som Hedge. **ÅPEN:** permissionless likvidering eller bare vår keeper (samme beslutning som Hedge).
- **Squeeze-tak:** samlet åpen short per coin begrenses så tilbakekjøpet av alle shorts aldri
  flytter prisen mer enn ca. 1 % (samme regel som posisjonsstørrelse på Hedge).

## 5. Simulering (`sim/short_sim.py`, 1 % buffer, per $100 innsats)

| Coin-type | m | Likvidert | Gap-rate | Issuer per posisjon | Fond netto |
|---|---|---|---|---|---|
| Dyp, 0,05 %, $10M (BTC-type) | 10× | 1,3 % | 0 % | +$2,94 | +$0,50 |
| | 20× | 7,3 % | 0 % | +$7,34 | +$0,50 |
| | 25× | 12,0 % | 0 % | +$10,23 | +$0,50 |
| Meme 0,3 %, $1M (snitt DOGE/PEPE/WIF) | 5× | ~4 % | 0 % | ~+$2,8 | +$0,50 |
| | 10× | ~14 % | 0 % | ~+$7,4 | +$0,50 |
| | 15× | ~23 % | 0,01–0,10 % | ~+$11 | +$0,50 |
| | 25× | ~42 % | 0,1–0,3 % | ~+$20 | +$0,48–0,50 |
| Tynn, 0,3 %, $56k (GAZZ) | 1× | 8,9 % | 0,60 % | +$1,94 | **+$0,12** |
| | 2× | 19,7 % | 0,77 % | +$4,31 | **−$0,02** |
| | 5× | 32,2 % | 5,05 % | +$7,89 | **−$1,36** |
| | 15×+ | ikke mulig | | | |

«Fond netto» = 0,5 % safety-bidrag minus gap-tap. Positivt betyr at fondet dekker alle gap
med overskudd. Begge prisretninger er testet (ekte bane + speilbilde).

## 6. Maks multiplikator for Short (automatisk per coin)

| Coin-type | Hedge maks | **Short maks** | Hvorfor |
|---|---|---|---|
| Dype pooler, 0,05 % (ETH/BTC-type) | 25× | **20×** | 0 gap opp til 25×, holder margin |
| Memecoins 0,3 %, ~$1M dybde | 10× | **10×** | 0 gap ved 10×, sjeldne ved 15× |
| Mellomstore | 5× | **5×** | |
| Tynne coins (GAZZ, ~$56k, de fleste GazzPad-coins) | 3× | **1×** | fondet går i minus fra 2× |

Demo-siden setter dette etter markedsverdi (Major 20 / Large 10 / Mid 5 / Small 1). Ekte
lansering: per-coin-sim med faktisk pool-dybde og fee, som for Hedge. **ÅPEN:** hvilke coins
som får Short ved lansering.

## 7. Kontrakter (forslag, i tillegg til Hedge-settet)

| Kontrakt | Ansvar |
|---|---|
| `BackxTokenVault` (én per coin, ERC-4626 i coinen) | Issuer-innskudd i tokenet, andeler, utlån av tokens til shorts, mottar q tokens + issuer-andeler (i tokenet) tilbake |
| `BackxPositionManager` (utvides) | `openShort` / `closeShort` / `liquidateShort`, holder USDC per short, fossefall §2.2, maks m og maks samlet short per coin |
| `BackxRouterAdapter` (utvides) | Exact-output-kjøp (tilbakekjøp av nøyaktig q) med `maxIn` og TWAP-vakt |
| `BackxSafetyFund` | Dekker gap på begge sider. **ÅPEN:** ett felles fond eller ett per side. Anbefaling: separat regnskap per side, så Short-gap aldri spiser Hedge-issuers' buffer |

Prinsipper som gjelder (som Hedge):
- Issuer kan alltid ta ut ledige (ikke-utlånte) tokens. Utlånte kommer tilbake når shorts lukkes.
- Ingen udekket mint, pro-rata, serveren avgjør aldri utfall fra klientens tall.
- Fork-tester mot Robinhood mainnet, ekstern review før TVL.
- Tokens med fee-on-transfer eller rebase støttes **ikke** i token-reserven (tilbakebetaling av
  «nøyaktig q» blir feil). Sjekkes per coin før listing.

## 8. Åpne beslutninger (Short)
1. Issuer-andeler fra shorts utbetales i tokenet (anbefalt) eller i USDC.
2. Reserve Security Fund felles eller per side (anbefalt: per side).
3. Short-maks per coin ved lansering (tabell §6 er utgangspunkt).
4. Permissionless likvidering eller kun vår keeper (felles med Hedge).
5. Squeeze-tak: maks samlet short per coin som andel av pool-dybde.
