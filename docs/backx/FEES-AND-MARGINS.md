# backx.trade: gebyrer, issuer-margin og Reserve Security Fund (2026-10-18)

> Grunnlag: `sim/sim3.py` (Hedge og Short opp til 30×, samme ekte minuttpriser som før, begge
> prisretninger, 1 500 utvalg per tidshorisont, treg keeper som lukker på minuttets slutt) og
> kontraktene i `contracts/` (20 tester inkl. 30×, gap og fuzz, alle grønne). **Ikke auditert.**

## 1. Hvorfor gebyrene ble høye

Per $100 innsats, Hedge (Short er nesten likt):

| | Holders 2 % | Lån 0,2 % av lånt | Reserve Security Fund | Swap begge veier (pool-fee + impact) | **Totalt** |
|---|---|---|---|---|---|
| Dyp pool 0,05 %, 10× | $2,00 | $1,80 | $0,77 | $1,19 | **$5,76** |
| Dyp pool 0,05 %, 30× | $2,00 | $5,80 | $1,37 | $4,78 | **$13,95** |
| Meme-pool 0,3 %, 10× | $2,00 | $1,80 | $0,77 | $7,95 | **$12,52** |
| Meme-pool 0,3 %, 30× | $2,00 | $5,80 | $1,37 | $35,84 | **$45,01** |

- **Det store er pool-gebyret til DEX-ene**, ikke våre gebyrer. Ekte tokens betyr at hele posisjonen
  (m × innsats) kjøpes og selges: 30× på en 0,3 %-pool er $3 000 gjennom poolen to ganger.
- **Demo-siden overdrev** på små coins: den lot en posisjon være mye større enn poolen, så price impact
  eksploderte (eks. $21 i gebyr på 3×). Løsning: **maks posisjonsstørrelse per coin** = 0,5 % av
  pool-dybden (impact ≤ ca. 0,5 % per vei). Kontrakten håndhever det (`maxNotionalUsd`), og
  billetten viser det.
- Lånegebyret (0,2 % av lånt) er vårt største gebyr på høy m. Det går til issuers.

Tiltak (anbefalt rekkefølge):
1. Høy m bare på dype pooler med lav fee (0,05 %). Det er det caps i §4 gjør.
2. Maks posisjonsstørrelse per coin (gjort).
3. Senere: egne PCS Infinity-pooler med hook, så en del av pool-gebyret går til issuers/holders
   i stedet for eksterne LP-er (spec §5, idé).
4. **ÅPEN:** lavere lånegebyr på dype pooler ved høy m (f.eks. 0,1 % over 10×). Issuers tjener
   uansett mest på p- og s-andelene.

## 2. Margin for issuers («liten sjanse for feil»)

Issuer taper bare ved **gap**: prisen hopper forbi likvideringspunktet før salget/tilbakekjøpet
går gjennom. Tre lag beskytter issuers:

1. **Cushion (e):** traderen må ha minst e av egenkapitalen igjen ved likvidering. Ny tabell (v3)
   holder e på minst ca. 12 % også ved 30× (før: 8 %).
2. **Buffer på principal:** likvideringen utløses før issuers' principal er truet: Hedge 0,3 %,
   Short 0,6 %, og +0,02 % per steg over 10× (30× = +0,4 %).
3. **Reserve Security Fund** (nytt navn på safety fund): dekker gap først. Én per side.

Resultat (gap-rate = andel posisjoner der issuers ville tapt uten fondet):

| | Gammelt oppsett | **v3 (i kontraktene)** |
|---|---|---|
| Dyp Hedge 30× | gap 0,3 %, likv. ved −2,37 % | **gap 0 %**, likv. ved −1,84 % |
| Dyp Short 30× | gap 0 %, likv. ved +1,70 % | **gap 0 %**, likv. ved +1,55 % |
| Meme Hedge 20× | gap 0,81 % | **gap 0,43 %** |
| Meme Hedge 30× | gap 0,91 % | **gap 0,20 %** |
| Meme Short 20× | gap 0,16 % | gap 0,21 % (fondet dekker med god margin) |
| Meme 10× begge sider | gap 0 % | **gap 0 %** |

Prisen for marginen: likvideringen kommer litt tidligere for traderen på høy m.

## 3. Reserve Security Fund

- **0,5 % av innsatsen + 0,03 % av beløpet som lånes** går til fondet ved hver åpning.
  Ved $100 og 30× er det $1,37 (før: $0,50).
- Simulert dekning på alle tillatte multiplikatorer: fondet tar inn mange ganger mer enn gap-tapene
  (meme 20×: $1,07 inn mot $0,03 snitt-tap per posisjon). Tynne pooler er unntaket (§4).
- Kontrakten (`BackxReserveSecurityFund`): én for Hedge og én for Short. Penger går **bare ut for å
  dekke et gap**, aldri til eier. Er fondet tomt, deles tapet pro rata av issuers (skrives av).
- **ÅPEN:** hva som skjer med overskudd over et visst nivå (til issuers, holders, eller bli stående).

## 4. Maks multiplikator (v3)

| Pool | Hedge | Short | Grunn |
|---|---|---|---|
| Dyp, 0,05 %, ~$10M (ETH/BTC-type) | **30×** | **30×** | 0 gap i begge retninger |
| Meme, 0,3 %, ~$1M | **10×** | **10×** | 0 gap; fra 15× sjeldne gap, og gebyrene spiser traderen |
| Mellomstor | **5×** | **5×** | |
| Tynn, ~$56k (GAZZ og de fleste GazzPad-coins) | **2×** | **av** | Short: fondet dekker bare ca. 1×. Hedge 2×: dekning ca. 7× |

Demo-siden setter dette etter markedsverdi (Major 30/30, Large 10/10, Mid 5/5, Small 2/av).
Ved lansering settes caps per coin med faktisk pool-dybde og fee.

## 5. Kontraktene (contracts/)

| Kontrakt | Gjør |
|---|---|
| `BackxReserveVault` | ERC-4626 Issue Reserve, én per coin per side (USDC for Hedge, coinen for Short). Bare ledige midler kan tas ut, maks 90 % utlånt, vern mot «første innskyter»-angrep. |
| `BackxReserveSecurityFund` | Mottar fond-andelen, betaler bare ut for å dekke gap. Én per side. |
| `BackxPositionManager` | Åpne/lukke/likvidere Hedge og Short, gebyrer, fossefall (issuers først), caps per coin, maks størrelse og maks samlet utlån, pause som bare stopper nye posisjoner. |

Sikkerhet i koden:
- Eier er Safe `0xfa40…9BE4` fra konstruktøren (Ownable2Step). Deployer-nøkkelen blir aldri eier.
- Likvidering krever at **både** pool-prisen **og** TWAP sier ja (toleranse 0,25 %), så en manipulert
  pris i én blokk ikke kan likvidere noen. Testet.
- En likvidering kan ikke selge mer enn 15 % under (eller kjøpe 15 % over) TWAP, så en «sandwich»
  rundt keeperen ikke kan tappe issuers.
- Eksakte approvals som nullstilles etter hver swap. ReentrancyGuard. SafeCast. Ingen udekket mint.
- Eier kan endre parametere bare innenfor harde grenser (e ≥ 5 %, holders ≤ 3 %, buffer ≤ 5 % …).
- Lukking og likvidering virker alltid, også når nye posisjoner er pauset.

Tester (`forge test`): Hedge og Short 5× med gevinst (issuers først), 1× uten lån, likvideringsnivå
30× og 10× = simuleringen (±0,06 %), likvidering 30× uten tap, gap 30× dekket av fondet (begge sider),
tomt fond → avskrivning, eier kan ikke lukke under null, TWAP-vern, caps, pause, tilgang,
uttaksgrense, parametergrenser, og fuzz (3 000 tilfeldige posisjoner 1–30×, ±30 %): alltid
principal tilbake, ingenting fast i kontrakten, issuers aldri i minus.

## 6. Gjenstår før ekte penger
1. `ISwapAdapter` for PCS Infinity / Uniswap v4 på Robinhood Chain (rute-motoren fra fondene).
2. `IPriceOracle`: TWAP per pool (vindu og observasjoner avgjøres per coin).
3. Keeper-tjeneste (egen Railway-tjeneste uten offentlig domene, egen nøkkel).
4. Fork-tester mot Robinhood mainnet, deretter **ekstern audit**.
5. Åpne beslutninger: §1.4, §3, permissionless likvidering, oppgraderbar vs immutable, feeExempt for
   GUSD, juridisk sjekk.
