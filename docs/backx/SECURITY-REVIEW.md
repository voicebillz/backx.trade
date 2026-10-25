# backx.trade: sikkerhetsgjennomgang av kontraktene (2026-10-20)

> Intern gjennomgang, **ikke** en ekstern audit. Kontraktene er ikke deployet. En ekstern audit og fork-tester mot
> ekte pooler er fortsatt et krav før ekte penger (se §5). `forge test`: 55 tester grønne, hvorav 8 angrepstester
> (`test/Security.t.sol`).

Målet fra eier: **issuers skal kunne sette inn USDC uten å bekymre seg for å tape.** Ingen finansiell kontrakt kan
love null risiko, men designet skal gjøre tap for issuers så usannsynlig som mulig, og fondet skal ta det først.

## 1. Funn og hva som er gjort

| # | Alvorlighet | Funn | Status |
|---|---|---|---|
| 1 | **Høy** | **Likvidering kunne «sandwiches».** Salget ved likvidering kunne fylles opptil 15 % under oraklets pris. En angriper (eller noen rundt keeperens transaksjon) kunne dumpe poolen i samme blokk, la kontrakten selge billig og kjøpe tilbake: tapet ville gått inn i issuers' penger. | **Rettet.** Maks 2 % fra TWAP (`liqMaxGapBps` 200), og så lenge TWAP viser at coinsene dekker lånet + 2 %, **må salget gi hele lånet tilbake**, ellers avvises det og validator prøver igjen. Testet: angrep i samme blokk feiler, issuers får alt tilbake etterpå. |
| 2 | Middels | **Swap-beløp ble tatt fra adapterens svar.** En feil i adapteren, eller et token med avgift ved overføring, kunne fått bøkene til å vise flere coins/USDC enn som faktisk kom inn. | **Rettet.** Alt måles på kontraktens egen saldo før/etter. Testet med en «lyvende» adapter: avvist. |
| 3 | Middels | **Safe kunne bytte reserve under åpne posisjoner.** Lånet ville blitt betalt tilbake til feil pool, og posisjonene kunne låst seg. | **Rettet.** `setMarket` nekter å bytte reserve mens det finnes åpne posisjoner, og krever adapter, orakel og reserve. |
| 4 | Lav | Gebyrmottaker kunne settes til 0-adressen (alle åpninger ville feilet). | **Rettet.** |
| 5 | Lav | Fabrikken godtok USDC selv som «coin», og multiplikator/margin uten grenser. | **Rettet.** |
| 6 | Krav fra eier | **Større margin for prissvingninger.** | **Gjort.** Likvideringsmargin: Major 1,5 %, Large 2 %, Mid 3 %, Small 4 % (var 1 / 1 / 1,5 / 2 %). Se §2. |

Sjekket og **i orden** (med test der det gir mening):
- Bare trading-kontrakten kan låne ut, betale tilbake, skrive av og hente fra fondet. Ingen andre kan flytte issuers' penger.
- Ingen kan initialisere kontraktene på nytt eller ta over implementasjonene.
- «Første innskyter»-angrep på en ny reserve virker ikke (virtuelle andeler; testet med $1M donasjon).
- En sunn posisjon kan ikke likvideres, heller ikke ved å flytte bare spot-prisen (både pool og TWAP må si ja).
- Belønning går inn i poolen og opptjenes over 24 t, så en «snik»-innskyter tar nesten ingenting (test: under 3 %).
- Re-entrancy: alle inngangspunkter har `nonReentrant`. Godkjenninger til adapter/reserve er eksakte og nullstilles.
- En trader kan aldri lukke selv med mindre enn lånet tilbake (`Underwater`). Da tar validator over.
- Pause stopper bare nye posisjoner. Lukking og likvidering virker alltid.
- Nok USDC i reserven styrer maks multiplikator. Kontrakten låner aldri ut mer enn 90 % av reserven.

## 2. Hvor trygge er issuers nå?

Issuers kan bare tape hvis prisen faller **videre** forbi likvideringspunktet **før** salget går gjennom, mer enn
«buffer» under, **og** Reserve Security Fund ikke dekker resten.

| Coin-type | Maks | Trader likvideres ved | Prisen kan falle **ytterligere** før issuers er i fare |
|---|---|---|---|
| Major (BTC/ETH) | 20× | −2,2 % | **2,7 %** (10×: 3,8 %) |
| Large | 5× | −11,1 % | **8,2 %** |
| Mid | 3× | −17,7 % | **14,9 %** |
| Small | 2× | −24,9 % | **24,2 %** |

Simulering på ekte minuttpriser med en treg validator (verste pris innen 5 minutter + 0,5 % avvik): **null tap for issuers**
på alle tillatte nivåer, allerede med de lavere marginene. De nye marginene gir ekstra luft. Hvis tapet likevel skjer
(f.eks. en coin faller 30 % på sekunder), betaler **fondet** først; issuers deler bare det fondet ikke dekker.

## 3. Risikoer som gjenstår (ærlig)

| Risiko | Hva vi gjør / anbefaler |
|---|---|
| **Flash-krasj større enn bufferen** (rug, børsnyhet) | Fondet dekker først. Lav maks m på små coins. Fyll fondet før lansering (**ÅPEN:** beløp). |
| **Validator nede** | Kjør to keepere på ulik infrastruktur. Slå på `permissionlessLiquidation` som reserve: etter fiks #1 er det trygt for issuers at hvem som helst likviderer. |
| **Orakel (TWAP) for tregt** | TWAP-vinduet må være kort (1–5 min) eller kombineres med en rask feed, ellers kommer likvideringen sent i et krasj. Krav til hver coin før deploy. |
| **Adapter/orakel er betrodd** | Settes kun av Safe. Må gjennomgås i auditen for hver pool. |
| **Oppgraderbart uten begrensning** | Safe-signerne kan bytte koden som holder pengene. **Anbefaling:** 48 t tidslås foran oppgraderinger når det er TVL, så issuers rekker å ta ut. |
| **Uttak kan vente** | Issuers kan bare ta ut ledig USDC. Er 90 % lånt ut, kommer resten når posisjoner lukkes. Penger er ikke tapt, men kan være bundet en stund. |
| **Uttak før et kjent tap** | En issuer som ser et gap komme, kan ta ut før avskrivningen og la de andre bære tapet. Lite sannsynlig med marginene over. **Mulig tiltak senere:** uttak med kort ventetid. |
| **Ikke-standard tokens** | Tokens med avgift ved overføring, rebasing eller svartelisting støttes ikke. Sjekkes per coin før listing (fiks #2 stopper feil bokføring). |

## 4. Kontraktene i korte trekk

| Kontrakt | Hva den gjør | Hvem styrer |
|---|---|---|
| **BackxMarketFactory** | Én per chain. Lager hele settet for en coin i én transaksjon (reserve + fond + trading). Register over alle coins. | Safe (oppgraderbar, UUPS) |
| **BackxReserveVault** (Issue Reserve) | Issuers setter inn USDC og får andeler. Låner ut til Hedges (maks 90 %). Lånet kommer tilbake først. Belønning går rett inn i poolen (24 t opptjening). Bare ledig USDC kan tas ut. | Bare trading-kontrakten kan låne ut/betale tilbake. Safe eier. |
| **BackxReserveSecurityFund** | Får 0,5 % + 0,03 % av hver posisjon. Betaler **bare** ut for å dekke et gap til issuers. Ingen kan ta ut. | Bare trading-kontrakten kan hente. Safe eier. |
| **BackxPositionManager** (trading) | Åpner Hedge (beløp inn = beløp betalt), regner margin og posisjon, låner fra reserven, kjøper coinen. Lukker, likviderer (TWAP-bekreftet, med pris-vakt), fyller limit-ordre, keeper-bunter. Fosse: issuers først, så trader. | Safe: innstillinger innenfor harde grenser, pause, keepere. |
| Beacons (3 stk.) | Peker på gjeldende kode for alle coins på chainen. `upgradeTo` = oppgradering uten redeploy. | Safe |

## 5. Før ekte penger (uendret liste, nå med punktene over)
1. Ekstern audit av kontraktene + adapter + orakel per pool.
2. Fork-tester mot ekte pooler på hver chain.
3. Keeper-tjeneste (to stykker), `permissionlessLiquidation` på som reserve.
4. Tidslås foran oppgraderinger (anbefalt).
5. Fyll Reserve Security Fund (beløp **ÅPEN**).
6. Velg stablecoin på Robinhood Chain (**ÅPEN**).
