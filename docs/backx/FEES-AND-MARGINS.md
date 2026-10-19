# backx.trade: gebyrer, issuer-margin og Reserve Security Fund (2026-10-18)

> **Gjeldende modell: v4** (eier 2026-10-18, `sim/sim4.py`, kontraktene, `web/src/lib/hedge.ts`):
> - Posisjonen er **nøyaktig m × innsats** (5× på $100 = $500), og gebyrene **betales i tillegg** til innsatsen.
> - Holders (gazz.fun) 2 % av innsatsen, uendret. Lånegebyr til issuers **0,25 %** av lånt (før 0,2 %).
>   Reserve Security Fund 0,5 % av innsatsen + 0,03 % av lånt, uendret.
> - **Keeper-gas** (2026-10-19): et fast beløp per posisjon (standard $0,10, `keeperGasUsd`, maks $5) betales ved åpning
>   rett til keeper-walleten. Settes til ca. 2× gassen for én lukking/likvidering: halvparten dekker gassen, halvparten
>   bygger keeperens saldo. Billetten viser bare «Gas» og «You pay»; de andre gebyrene er bakt inn i «You pay».
>   **ÅPEN:** beløpet settes fra målt gass på Robinhood Chain ved deploy.
> - Issuers' andel av en gevinst **p = 10 %** flatt (før 15–30 %). Hedge 1× låner ingenting: 0 %.
> - e, s og buffere er uendret (v3). I tillegg har hver coin en likvideringsmargin og lavere maks m (§2b, 2026-10-19).
> - Fondet stopper **ikke** nye posisjoner (§3b). Issuers' reserver brukes fullt ut, og fondet er siste utvei.
>
> Hvorfor: på ekte priser (sim4, begge retninger) kommer issuers' forventede inntekt fra lånegebyret og
> likvideringer, ikke fra gevinstandelen. 5× Short: issuers $1,38 → **$1,42** per posisjon, mens traderen
> ved +10 % riktig vei får **+$40,63** (før +$33,47). Tabellene i §1–2 under er fra v3 og viser hvorfor
> gebyrene ble høye. Oppdaterte $100-tall står i `SCENARIOS-100.md`.

| Dyp pool, per $100 | Traderen ved 10 % riktig vei, v3 → **v4** | Issuers' forventede inntekt per posisjon, v3 → **v4** |
|---|---|---|
| Hedge 5× | +$34,23 → **+$40,84** | $1,22 → **$1,17** |
| Short 5× | +$33,47 → **+$40,63** | $1,38 → **$1,42** |
| Hedge 10× | +$65,56 → **+$83,79** | $2,86 → **$2,62** |
| Short 10× | +$64,16 → **+$83,67** | $3,12 → **$3,03** |
| Short 30× | +$195,21 → **+$255,00** | $14,90 → **$14,43** |

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

## 2b. Likvideringsmargin mot treg keeper og prisavvik (2026-10-19)

Spørsmålet: får issuers alltid pengene tilbake hvis salget går tregt, eller prisen i poolen avviker fra oraklet?
`sim/sim5.py` (Hedge, v4) tester det **pessimistisk**: når likvideringen utløses, selges posisjonen til den
**verste** prisen i løpet av de neste D minuttene, og deretter **0,5 % lavere** (avvik mellom orakel og pool,
ekstra slippage). «Gap» betyr at salget ikke dekker det issuers lånte ut.

Andel posisjoner med gap (uten fondet), ved margin på posisjonsverdien:

| Pool | m | Forsinkelse | 0 % | 0,5 % | **1 %** | 1,5 % | 2 % |
|---|---|---|---|---|---|---|---|
| Dyp (BTC) | 10× | 5 min | 0 | 0 | **0** | 0 | 0 |
| Dyp (BTC) | 20× | 5 min | 0,45 % | 0,40 % | **0** | 0 | 0 |
| Dyp (BTC) | 30× | 3–5 min | 1,9–2,1 % | 0,4–0,65 % | 0,12 % | 0 | 0 |
| Meme (DOGE/PEPE/WIF) | 5× | 5 min | 0 | 0 | **0** | 0 | 0 |
| Meme | 10× | 3 min | 0,5–2,1 % | 0,3–1,2 % | 0,07–0,85 % | 0–0,6 % | 0–0,2 % |
| Meme | 10× | 5 min | 0,5–3,4 % | | 0,07–1,6 % | | 0,05–0,7 % |

Konklusjon (bygget inn):
- Hver coin har en **likvideringsmargin** (`Market.liqMarginBps`): likvideringen kommer så mye tidligere,
  målt på posisjonens verdi. Grensen er at netto salgsverdi ≤ lånt·(1+buffer) + e·innsats + **margin·posisjon**.
- **Maks multiplikator senkes**, fordi 30× og meme-10× ikke kan beskyttes uten at likvideringen kommer nesten
  med en gang:

| Coin-type | Maks (før) | **Maks nå** | Margin | Likvideres ved (eksempel) |
|---|---|---|---|---|
| Major (BTC/ETH, dyp pool) | 30× | **20×** | 1 % | 20×: −2,7 %, 10×: −6,6 % |
| Large (meme-type, 0,3 %) | 10× | **5×** | 1 % | 5×: −12,2 % |
| Mid | 5× | **3×** | 1,5 % | 3×: −19,4 % |
| Small (GAZZ-type) | 2× | 2× | 2 % | 2×: −26,9 % |

Med disse nivåene var det **ingen gap** i noen simulert situasjon, også med 5 minutters forsinkelse og 0,5 % avvik.
Fondet skal da bare brukes ved ekte flash-krasj (prisen hopper mer enn margin + e på sekunder).
Safe kan endre margin (maks 5 %) og maks m per coin. Kontrakttest: 20× med 1 % margin og en keeper som er
1,5 % for sen, gir issuers alt tilbake uten at fondet brukes.

Gebyrene vises ikke lenger som egen seksjon i billetten. De er bakt inn i tallene: «You pay (all fees included)»,
likvideringsprisen (pool-gebyr og impact er med i salgsverdien) og resultatet ved +10 % / ved limit.

## 2c. Multiplikator etter ledig USDC, og issuer-belønning i poolen (2026-10-19)

**Maks multiplikator** er satt per coin i kontrakten (`maxHedgeM`), men det en bruker faktisk kan velge er begrenset
av hva issuers kan låne ut akkurat nå: `(m − 1) · innsats ≤ ledig USDC` (reserven kan låne til 90 % er ute).
`maxHedgeMFor(coin, innsats)` gir svaret (også begrenset av maks posisjonsstørrelse og samlet åpen posisjon), og
`openHedge` avviser med `NotEnoughReserve` hvis lånet er større. Billetten viser samme grense og forklarer hvorfor.
Hedge 1× låner ingenting og er alltid mulig.

**Issuer-belønning** (lånegebyr, 10 % av gevinst, andel ved likvidering) går **inn i reserven**. Hver issuer eier
andeler (ERC-4626), så belønningen fordeles automatisk på alle etter hvor stor del av poolen de eier, og tas ut
sammen med innskuddet. Ingenting å «claime». Hver issuers del = andeler × andelspris (`convertToAssets`).
Ny belønning **opptjenes jevnt over 24 timer** (`vestPeriod`, Safe kan sette 0–7 dager), så den som setter inn rett før
en stor belønning og tar ut rett etter, får nesten ingenting (test: under 3 % etter 1 time). Ved et tap (write-off)
spises belønning som ikke er opptjent ennå først. Testet: to like issuers får like mye, uttak gir innskudd + belønning.

## 3. Reserve Security Fund

- **0,5 % av innsatsen + 0,03 % av beløpet som lånes** går til fondet ved hver åpning.
  Ved $100 og 30× er det $1,37 (før: $0,50).
- Simulert dekning på alle tillatte multiplikatorer: fondet tar inn mange ganger mer enn gap-tapene
  (meme 20×: $1,07 inn mot $0,03 snitt-tap per posisjon). Tynne pooler er unntaket (§4).
- Kontrakten (`BackxReserveSecurityFund`): én for Hedge og én for Short. Penger går **bare ut for å
  dekke et gap**, aldri til eier. Er fondet tomt, deles tapet pro rata av issuers (skrives av).
- **ÅPEN:** hva som skjer med overskudd over et visst nivå (til issuers, holders, eller bli stående).

## 3b. Krasjvern: fondet bestemmer hvor mye som kan være åpent (2026-10-18)

Problemet: en krasj eller pumpe **i ett hopp** (rug, børsnyhet) rekker forbi likvideringen, og da betaler
fondet hullet. Per $100-posisjon er det mye mer enn de $0,50–1,40 fondet får inn
(`SCENARIOS-100.md` og `sim/scenarios.py`):

| m | Hedge: krasj −30 % | −50 % | −70 % | Short: pumpe +30 % | +100 % | +200 % |
|---|---|---|---|---|---|---|
| 2× | $0 | $1 | $41 | $0 | $98 | $293 |
| 5× | $52 | $152 | $251 | $50 | $391 | $879 |
| 10× | $203 | $402 | $601 | $197 | $880 | $1 855 |
| 30× | $806 | $1 405 | $2 003 | $787 | $2 834 | $5 759 |

Hedge 1× låner ingenting og koster fondet aldri noe. Et fall stopper på −100 %, mens en pumpe ikke har noe tak.
Derfor er Short den farligste siden.

**Regelen i kontrakten** (`BackxPositionManager`, testet):
- Hver coin har en **krasj** (Hedge) og en **pumpe** (Short) som fondet skal tåle i ett hopp (`crashBps`, `pumpBps`).
- Hver posisjon regner ut sitt verste hull ved åpning: Hedge `L·c − E·(1−c)`, Short `N·c − E`.
  Testet mot det kontrakten faktisk betaler ved et hopp: innenfor 5 %.
- Summen per side vises alltid (`hedgeStressUsd`, `shortStressUsd`), så Safe og dashboardet ser hva en flash-krasj
  ville kostet fondet.
- **Sperren er AV som standard** (eier 2026-10-18): issuers' reserver skal brukes fullt ut, og fondet er siste utvei
  når en krasj går fortere enn kontrakten rekker å likvidere. Safe kan slå den på (`setStressCover`, 20–100 %). Da
  avvises nye posisjoner (`FundTooSmall`) når summen er større enn den andelen av fondet. Åpne posisjoner berøres aldri.
- Risikoen med sperren av: blir fondet tomt i en stor krasj, tar issuers resten pro rata. Det er derfor nivåene
  under, maks multiplikator per coin og maks posisjonsstørrelse fortsatt gjelder.

Anbefalte nivåer (**ÅPEN**, eier bestemmer):

| Coin-type | Krasj (Hedge) | Pumpe (Short) |
|---|---|---|
| Major (BTC/ETH) | 30 % | 30 % |
| Large | 50 % | 100 % |
| Mid / meme | 70 % | 200 % |
| Small (GAZZ-type) | 90 % | av |

Hva det betyr hvis sperren slås på: et fond på **$100 000** tåler ca. 125 Hedge-posisjoner à $100 på 30× i en major
(krasj 30 %), eller ca. 166 på 10× i en memecoin (krasj 70 %). **ÅPEN:** om og hvor mye fondet fylles før lansering.

## 3c. Limit-ordre (take profit)

- Traderen kan sette en **pris** ved åpning eller senere (`setLimit`, 0 = fjern). Hedge: over dagens pris
  («Sell at»). Short: under dagens pris («Buy back at»).
- En keeper lukker posisjonen når **TWAP** har nådd prisen (`executeLimit`). En pris-spike i én blokk kan ikke
  utløse den (testet). Fyllingen er aldri mer enn **1 %** dårligere enn limiten (`limitSlipBps`, maks 5 %).
- Oppgjøret er en vanlig lukking: issuers får principal tilbake først, så p av gevinsten.
- Billetten viser «At your limit …, worst fill» i stedet for «If it rises 10 %» når en limit er satt.
- Det er ingen stop-loss: likvideringen er gulvet.

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

Tester (`forge test`, 28 stk.): v4-gebyrer på toppen og p = 10 %, limit-ordre begge sider (TWAP-vern, regler,
tilgang), krasjvern (av som standard, reservene brukes fullt; når slått på stopper fondet nye posisjoner; estimatet
dekker faktisk gap), Hedge og Short 5× med gevinst (issuers først), 1× uten lån, likvideringsnivå
30× og 10× = simuleringen (±0,06 %), likvidering 30× uten tap, gap 30× dekket av fondet (begge sider),
tomt fond → avskrivning, eier kan ikke lukke under null, TWAP-vern, caps, pause, tilgang,
uttaksgrense, parametergrenser, og fuzz (3 000 tilfeldige posisjoner 1–30×, ±30 %): alltid
principal tilbake, ingenting fast i kontrakten, issuers aldri i minus.

## 6. Gjenstår før ekte penger
1. `ISwapAdapter` for PCS Infinity / Uniswap v4 på Robinhood Chain (rute-motoren fra fondene).
2. `IPriceOracle`: TWAP per pool (vindu og observasjoner avgjøres per coin).
3. Keeper-tjeneste (egen Railway-tjeneste uten offentlig domene, egen nøkkel).
4. Fork-tester mot Robinhood mainnet, deretter **ekstern audit**.
5. Åpne beslutninger: §1.4, §3, §3b (nivåer og hvor mye fondet fylles med), permissionless likvidering, oppgraderbar vs immutable, feeExempt for
   GUSD, juridisk sjekk.
