# backx.trade: $100-scenarier for Hedge, Short og issuers (v4, 2026-10-18)

> Laget med `sim/scenarios.py` (samme tall som `web/src/lib/hedge.ts` og kontraktene, **v4**).
> Én prisbevegelse, ingen tidsbane. **(L)** = likvidert av keeper akkurat på likvideringspunktet.
> Ikke auditert, ikke deployet. Ingen lovnader om avkastning: dette er regneeksempler.

## 1. Hva v4 endret (eier 2026-10-18)

| | v3 (før) | **v4 (nå)** |
|---|---|---|
| Posisjon ved 5× på $100 | $487,50 (gebyrer trukket fra innsatsen først) | **$500,00** (nøyaktig m × innsats) |
| Gebyrene | trukket fra innsatsen | **betales i tillegg** til innsatsen (5×: $100 + $3,90) |
| Issuers' andel av gevinst (p) | 15–30 % | **10 %** flatt (Hedge 1×: 0 %) |
| Lånegebyr til issuers | 0,2 % av lånt | **0,25 %** av lånt |
| Holders (gazz.fun) | 2 % av innsatsen | 2 % av innsatsen (uendret) |
| Reserve Security Fund | 0,5 % + 0,03 % av lånt | uendret |
| Fondet stopper nye posisjoner | ja | **nei** (kan slås på av Safe); fondet er siste utvei |

Resultat, dyp pool, 5×, prisen beveger seg 10 % riktig vei: **Short +$40,63** (før +$33,47), Hedge +$40,84 (før +$34,23).
Det er $50 brutto, minus 10 % til issuers og $4,45 i gebyrer. Issuers' **forventede** inntekt per posisjon er nesten
uendret (sim4 på ekte priser: 5× Short $1,38 → $1,42), fordi den kommer fra lånegebyret og likvideringer, ikke fra
gevinstandelen. Se `FEES-AND-MARGINS.md`.

## 2. Hvor pengene i en short kommer fra (eksempel: $100, 5×, PONS til $0,50, meme-pool)

| Steg | Hva skjer | Tall |
|---|---|---|
| 1 | **Issuer** har satt inn PONS i token-reserven («Issue PONS») | f.eks. 100 000 PONS |
| 2 | **Traderen** betaler $100 innsats + gebyrer: holders $2,00, fondet $0,65, lån $1,25 | **$103,90** totalt |
| 3 | Kontrakten **låner 1 000 PONS** fra token-reserven (5 × $100 = $500) | q = 1 000 PONS |
| 4 | De 1 000 PONS **selges med en gang** for USDC (pool-gebyr + impact 0,35 %) | ca. $498,25 |
| 5 | Posisjonen holder nå **$598,25 USDC, låst** i kontrakten (innsatsen $100 + salget) | C = $598,25 |
| 6a | **Prisen faller 10 % (til $0,45):** kontrakten kjøper tilbake nøyaktig 1 000 PONS for $451,58 | rest $146,67 |
|    | → issuer får **1 000 PONS tilbake først**, pluss lånegebyret og 10 % av gevinsten (kjøpt som PONS) | issuer +$5,92 i PONS |
|    | → traderen får resten i USDC: $142,01 | **+$38,11** netto |
| 6b | **Prisen stiger 10 % (til $0,55):** tilbakekjøpet koster $551,93 | traderen får $46,32 (**−$57,58** netto) |
| 6c | **Prisen stiger 12,58 %:** keeper likviderer, kjøper tilbake 1 000 PONS | traderen $10,02, issuer +$24,62 |
| 7 | **Gap** (prisen hopper så langt at USDC-en ikke holder til 1 000 PONS): **Reserve Security Fund kjøper resten**. Først når fondet er tomt, taper issuers pro rata. | |

Kort sagt: **short-pengene er issuers' tokens, solgt.** Traderen låner ikke dollar, men PONS, og må
levere samme antall PONS tilbake. Issuer får alltid **antall tokens** tilbake, pluss inntekt i PONS.

## 3. Når fondet brukes (dyp pool, prisen hopper 10 % i ett hopp før keeper rekker å handle)

| Posisjon | Fondet fikk inn | Fondet betaler ut | Issuers |
|---|---|---|---|
| Hedge 10× | $0,77 | $1,08 | hele |
| Short 10× | $0,80 | $1,26 | hele |
| Hedge 30× | $1,37 | $204,32 | hele, hvis fondet har nok |
| Short 30× | $1,40 | $205,04 | hele, hvis fondet har nok |

Fondet er **siste utvei**: det brukes bare når en krasj eller pumpe går fortere enn kontrakten rekker å
likvidere (f.eks. PONS −90 % i ett hopp). Normale likvideringer koster fondet ingenting.

Les tabellene slik: rad = multiplikator, kolonne = prisbevegelse. Traderens tall er netto gevinst/tap etter
alt som er betalt (innsats + gebyrer). Issuers' tall er hva **den ene posisjonen** gir issuers totalt.

## 4. Dyp pool (BTC/ETH-type, 0,05 %, $10M)

### Hedge (tjener når prisen stiger): traderens gevinst/tap på $100

| m | Likv. ved | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | aldri | −$22.58 | −$12.59 | −$7.60 | −$2.60 | +$2.39 | +$7.39 | +$17.38 |
| 2× | -29.78 % | −$42.95 | −$22.97 | −$12.98 | −$2.99 | +$6.02 | +$15.01 | +$33.00 |
| 3× | -21.38 % | −$63.31 | −$33.35 | −$18.36 | −$3.38 | +$10.14 | +$23.63 | +$50.60 |
| 5× | -13.67 % | −$94.26 (L) | −$54.11 | −$29.14 | −$4.17 | +$18.36 | +$40.84 | +$85.79 |
| 10× | -7.62 % | −$101.62 (L) | −$101.62 (L) | −$56.16 | −$6.22 | +$38.85 | +$83.79 | +$173.68 |
| 20× | -3.69 % | −$105.47 (L) | −$105.47 (L) | −$105.47 (L) | −$10.62 | +$79.53 | +$169.41 | +$349.16 |
| 30× | -2.10 % | −$107.39 (L) | −$107.39 (L) | −$107.39 (L) | −$15.42 | +$119.85 | +$254.63 | +$524.20 |

### Issuers' inntekt fra den samme hedge-posisjonen

| m | Lånegebyr | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 |
| 2× | +$0.25 | +$0.25 | +$0.25 | +$0.25 | +$0.25 | +$1.23 | +$2.23 | +$4.23 |
| 3× | +$0.50 | +$0.50 | +$0.50 | +$0.50 | +$0.50 | +$1.97 | +$3.47 | +$6.46 |
| 5× | +$1.00 | +$22.84 | +$1.00 | +$1.00 | +$1.00 | +$3.44 | +$5.94 | +$10.93 |
| 10× | +$2.25 | +$21.54 | +$21.54 | +$2.25 | +$2.25 | +$7.12 | +$12.12 | +$22.11 |
| 20× | +$4.75 | +$25.90 | +$25.90 | +$25.90 | +$4.75 | +$14.46 | +$24.44 | +$44.41 |
| 30× | +$7.25 | +$36.32 | +$36.32 | +$36.32 | +$7.25 | +$21.75 | +$36.72 | +$66.67 |

### Short (tjener når prisen faller): traderens gevinst/tap på $100

| m | Likv. ved | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | +58.91 % | +$15.14 | +$6.13 | +$1.63 | −$2.88 | −$7.88 | −$12.89 | −$22.89 |
| 2× | +29.11 % | +$32.77 | +$14.76 | +$5.76 | −$3.27 | −$13.27 | −$23.28 | −$43.29 |
| 3× | +20.82 % | +$50.40 | +$23.39 | +$9.88 | −$3.66 | −$18.67 | −$33.67 | −$63.69 |
| 5× | +13.20 % | +$85.65 | +$40.63 | +$18.12 | −$4.45 | −$29.46 | −$54.48 | −$93.88 (L) |
| 10× | +7.23 % | +$173.73 | +$83.67 | +$38.65 | −$6.50 | −$56.53 | −$101.33 (L) | −$101.33 (L) |
| 20× | +3.33 % | +$349.63 | +$169.51 | +$79.44 | −$10.90 | −$105.05 (L) | −$105.05 (L) | −$105.05 (L) |
| 30× | +1.75 % | +$525.21 | +$255.00 | +$119.89 | −$15.70 | −$106.64 (L) | −$106.64 (L) | −$106.64 (L) |

### Issuers' inntekt fra den samme short-posisjonen

| m | Lånegebyr | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | +$0.25 | +$2.24 | +$1.24 | +$0.74 | +$0.25 | +$0.25 | +$0.25 | +$0.25 |
| 2× | +$0.50 | +$4.48 | +$2.48 | +$1.48 | +$0.50 | +$0.50 | +$0.50 | +$0.50 |
| 3× | +$0.75 | +$6.72 | +$3.72 | +$2.22 | +$0.75 | +$0.75 | +$0.75 | +$0.75 |
| 5× | +$1.25 | +$11.20 | +$6.20 | +$3.70 | +$1.25 | +$1.25 | +$1.25 | +$24.63 |
| 10× | +$2.50 | +$22.39 | +$12.39 | +$7.38 | +$2.50 | +$2.50 | +$24.97 | +$24.97 |
| 20× | +$5.00 | +$44.75 | +$24.73 | +$14.73 | +$5.00 | +$32.49 | +$32.49 | +$32.49 |
| 30× | +$7.50 | +$67.07 | +$37.04 | +$22.03 | +$7.50 | +$45.80 | +$45.80 | +$45.80 |


## 5. Meme-pool (0,3 %, $1M)

### Hedge (tjener når prisen stiger): traderens gevinst/tap på $100

| m | Likv. ved | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | aldri | −$23.00 | −$13.06 | −$8.09 | −$3.12 | +$1.85 | +$6.82 | +$16.76 |
| 2× | -29.40 % | −$43.80 | −$23.93 | −$13.99 | −$4.06 | +$5.01 | +$13.95 | +$31.84 |
| 3× | -20.95 % | −$64.64 | −$34.84 | −$19.94 | −$5.04 | +$8.57 | +$21.98 | +$48.81 |
| 5× | -13.15 % | −$94.26 (L) | −$56.76 | −$31.94 | −$7.11 | +$15.58 | +$37.92 | +$82.61 |
| 10× | -6.99 % | −$101.62 (L) | −$101.62 (L) | −$62.60 | −$13.00 | +$32.44 | +$77.08 | +$166.36 |

### Issuers' inntekt fra den samme hedge-posisjonen

| m | Lånegebyr | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 |
| 2× | +$0.25 | +$0.25 | +$0.25 | +$0.25 | +$0.25 | +$1.12 | +$2.11 | +$4.10 |
| 3× | +$0.50 | +$0.50 | +$0.50 | +$0.50 | +$0.50 | +$1.79 | +$3.28 | +$6.26 |
| 5× | +$1.00 | +$22.84 | +$1.00 | +$1.00 | +$1.00 | +$3.13 | +$5.62 | +$10.58 |
| 10× | +$2.25 | +$21.54 | +$21.54 | +$2.25 | +$2.25 | +$6.41 | +$11.37 | +$21.29 |

### Short (tjener når prisen faller): traderens gevinst/tap på $100

| m | Likv. ved | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | +58.25 % | +$14.72 | +$5.69 | +$1.18 | −$3.40 | −$8.42 | −$13.43 | −$23.46 |
| 2× | +28.50 % | +$31.90 | +$13.85 | +$4.82 | −$4.34 | −$14.37 | −$24.40 | −$44.47 |
| 3× | +20.22 % | +$49.06 | +$21.97 | +$8.42 | −$5.32 | −$20.37 | −$35.42 | −$65.52 |
| 5× | +12.58 % | +$83.26 | +$38.11 | +$15.53 | −$7.40 | −$32.49 | −$57.58 | −$93.88 (L) |
| 10× | +6.53 % | +$168.22 | +$77.86 | +$32.68 | −$13.30 | −$63.50 | −$101.34 (L) | −$101.34 (L) |

### Issuers' inntekt fra den samme short-posisjonen

| m | Lånegebyr | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | +$0.25 | +$2.19 | +$1.19 | +$0.69 | +$0.25 | +$0.25 | +$0.25 | +$0.25 |
| 2× | +$0.50 | +$4.38 | +$2.38 | +$1.38 | +$0.50 | +$0.50 | +$0.50 | +$0.50 |
| 3× | +$0.75 | +$6.57 | +$3.56 | +$2.06 | +$0.75 | +$0.75 | +$0.75 | +$0.75 |
| 5× | +$1.25 | +$10.93 | +$5.92 | +$3.41 | +$1.25 | +$1.25 | +$1.25 | +$24.62 |
| 10× | +$2.50 | +$21.78 | +$11.74 | +$6.72 | +$2.50 | +$2.50 | +$24.95 | +$24.95 |
