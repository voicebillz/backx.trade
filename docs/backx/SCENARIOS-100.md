# backx.trade: $100-scenarier for Hedge, Short og issuers (v4, oppdatert 2026-10-19)

> Laget med `sim/scenarios.py` (samme tall som `web/src/lib/hedge.ts` og kontraktene).
> **Beløpet du skriver inn er det du betaler** (eier 2026-10-19): gebyrer og keeper-gas ($0,10) trekkes fra det,
> resten er marginen, og posisjonen er multiplikator × margin. $100 inn = $100 betalt.
> Én prisbevegelse, ingen tidsbane. **(L)** = likvidert av validator akkurat på likvideringspunktet.
> Short er pauset i produktet; tallene står her for senere. Ikke auditert, ikke deployet. Ingen lovnader om avkastning.

## 1. Modellen

| | Verdi |
|---|---|
| Du betaler | nøyaktig beløpet du skriver inn ($100) |
| Gebyrer, trukket fra beløpet | holders 2 % av margin (gazz.fun), Reserve Security Fund 0,5 % + 0,03 % av lånt, lån 0,25 % av lånt (issuers), keeper-gas $0,10 |
| Margin ved 5× Hedge | $96,41 (posisjon $482,05) |
| Margin ved 20× Hedge | $92,65 (posisjon $1 853) |
| Issuers' andel av gevinst | 10 % (Hedge 1×: 0 %) |

Dyp pool, 5×, prisen beveger seg 10 % riktig vei: **Hedge +$39,27**, Short +$38,97, netto etter alt du betalte.

## 2. Hvor pengene i en short kommer fra (eksempel: $100, 5×, PONS til $0,50, meme-pool)

| Steg | Hva skjer | Tall |
|---|---|---|
| 1 | **Issuer** har satt inn PONS i token-reserven | f.eks. 100 000 PONS |
| 2 | **Traderen** betaler $100. Gebyrer: holders $1,92, fondet $0,62, lån $1,20, gas $0,10 | margin **$96,15** |
| 3 | Kontrakten **låner 961,5 PONS** (5 × $96,15 = $480,75) | q = 961,5 PONS |
| 4 | PONS-ene **selges med en gang** for USDC (pool-gebyr + impact 0,35 %) | ca. $479,08 |
| 5 | Posisjonen holder **$575,23 USDC, låst** (margin + salget) | C = $575,23 |
| 6a | **Prisen faller 10 %:** kontrakten kjøper tilbake nøyaktig 961,5 PONS for $434,18 | rest $141,05 |
|    | → issuer får **PONS-ene tilbake først**, pluss lånegebyr og 10 % av gevinsten (kjøpt som PONS) | issuer +$5,69 |
|    | → traderen får resten i USDC: $136,56 | **+$36,56** netto |
| 6b | **Prisen stiger 10 %:** tilbakekjøpet koster $530,67 | traderen får $44,56 (**−$55,44**) |
| 6c | **Prisen stiger 12,58 %:** validator likviderer | traderen $9,63, issuer +$23,67 |
| 7 | **Gap:** Reserve Security Fund kjøper PONS-ene som mangler; først når fondet er tomt, taper issuers pro rata | |

## 3. Når fondet brukes (dyp pool, prisen hopper 10 % i ett hopp før validator rekker å handle)

| Posisjon | Fondet fikk inn | Fondet betaler ut | Issuers |
|---|---|---|---|
| Hedge 10× | $0,73 | $1,02 | hele |
| Short 10× | $0,76 | $1,19 | hele |
| Hedge 30× | $1,24 | $184,38 | hele, hvis fondet har nok |
| Short 30× | $1,26 | $184,53 | hele, hvis fondet har nok |

Fondet er **siste utvei**: normale likvideringer koster det ingenting.

Les tabellene slik: rad = multiplikator, kolonne = prisbevegelse. Traderens tall er netto gevinst/tap etter alt som er
betalt ($100). Issuers' tall er hva **den ene posisjonen** gir issuers totalt. Liquidasjonsmargin per coin (§2b i
FEES-AND-MARGINS) er ikke med her; den flytter likvideringen litt tidligere.

## 4. Dyp pool (BTC/ETH-type, 0,05 %, $10M)

### Hedge (tjener når prisen stiger): traderens gevinst/tap på $100

| m | Likv. ved | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | aldri | −$22.11 | −$12.37 | −$7.50 | −$2.64 | +$2.23 | +$7.10 | +$16.84 |
| 2× | -29.78 % | −$41.84 | −$22.42 | −$12.71 | −$3.00 | +$5.75 | +$14.49 | +$31.97 |
| 3× | -21.38 % | −$61.47 | −$32.42 | −$17.90 | −$3.37 | +$9.73 | +$22.80 | +$48.95 |
| 5× | -13.67 % | −$90.98 (L) | −$52.27 | −$28.19 | −$4.12 | +$17.60 | +$39.27 | +$82.61 |
| 10× | -7.62 % | −$96.76 (L) | −$96.76 (L) | −$53.51 | −$6.01 | +$36.86 | +$79.62 | +$165.13 |
| 20× | -3.69 % | −$97.82 (L) | −$97.82 (L) | −$97.82 (L) | −$9.88 | +$73.64 | +$156.92 | +$323.47 |
| 30× | -2.11 % | −$97.08 (L) | −$97.08 (L) | −$97.08 (L) | −$13.87 | +$108.28 | +$230.01 | +$473.47 |

### Issuers' inntekt fra den samme hedge-posisjonen

| m | Lånegebyr | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 |
| 2× | +$0.24 | +$0.24 | +$0.24 | +$0.24 | +$0.24 | +$1.19 | +$2.16 | +$4.11 |
| 3× | +$0.48 | +$0.48 | +$0.48 | +$0.48 | +$0.48 | +$1.91 | +$3.36 | +$6.26 |
| 5× | +$0.96 | +$22.02 | +$0.96 | +$0.96 | +$0.96 | +$3.32 | +$5.73 | +$10.54 |
| 10× | +$2.14 | +$20.49 | +$20.49 | +$2.14 | +$2.14 | +$6.78 | +$11.53 | +$21.03 |
| 20× | +$4.40 | +$24.00 | +$24.00 | +$24.00 | +$4.40 | +$13.40 | +$22.65 | +$41.16 |
| 30× | +$6.55 | +$32.80 | +$32.80 | +$32.80 | +$6.55 | +$19.66 | +$33.18 | +$60.23 |

### Short (tjener når prisen faller): traderens gevinst/tap på $100

| m | Likv. ved | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | +58.91 % | +$14.61 | +$5.86 | +$1.48 | −$2.90 | −$7.76 | −$12.63 | −$22.35 |
| 2× | +29.11 % | +$31.67 | +$14.21 | +$5.48 | −$3.27 | −$12.97 | −$22.66 | −$42.06 |
| 3× | +20.82 % | +$48.63 | +$22.51 | +$9.45 | −$3.64 | −$18.14 | −$32.65 | −$61.67 |
| 5× | +13.20 % | +$82.26 | +$38.97 | +$17.32 | −$4.38 | −$28.43 | −$52.48 | −$90.37 (L) |
| 10× | +7.23 % | +$164.73 | +$79.29 | +$36.57 | −$6.26 | −$53.72 | −$96.24 (L) | −$96.24 (L) |
| 20× | +3.33 % | +$323.06 | +$156.60 | +$73.37 | −$10.12 | −$97.18 (L) | −$97.18 (L) | −$97.18 (L) |
| 30× | +1.76 % | +$473.15 | +$229.74 | +$108.04 | −$14.08 | −$96.17 (L) | −$96.17 (L) | −$96.17 (L) |

### Issuers' inntekt fra den samme short-posisjonen

| m | Lånegebyr | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | +$0.24 | +$2.18 | +$1.21 | +$0.72 | +$0.24 | +$0.24 | +$0.24 | +$0.24 |
| 2× | +$0.48 | +$4.34 | +$2.40 | +$1.43 | +$0.48 | +$0.48 | +$0.48 | +$0.48 |
| 3× | +$0.73 | +$6.50 | +$3.60 | +$2.15 | +$0.73 | +$0.73 | +$0.73 | +$0.73 |
| 5× | +$1.20 | +$10.77 | +$5.96 | +$3.55 | +$1.20 | +$1.20 | +$1.20 | +$23.68 |
| 10× | +$2.37 | +$21.24 | +$11.75 | +$7.01 | +$2.37 | +$2.37 | +$23.69 | +$23.69 |
| 20× | +$4.62 | +$41.36 | +$22.86 | +$13.62 | +$4.62 | +$30.03 | +$30.03 | +$30.03 |
| 30× | +$6.76 | +$60.43 | +$33.38 | +$19.86 | +$6.76 | +$41.25 | +$41.25 | +$41.25 |


## 5. Meme-pool (0,3 %, $1M)

### Hedge (tjener når prisen stiger): traderens gevinst/tap på $100

| m | Likv. ved | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | aldri | −$22.51 | −$12.83 | −$7.98 | −$3.14 | +$1.70 | +$6.55 | +$16.23 |
| 2× | -29.40 % | −$42.67 | −$23.36 | −$13.70 | −$4.04 | +$4.77 | +$13.47 | +$30.85 |
| 3× | -20.95 % | −$62.76 | −$33.87 | −$19.42 | −$4.98 | +$8.21 | +$21.21 | +$47.21 |
| 5× | -13.16 % | −$90.98 (L) | −$54.81 | −$30.88 | −$6.94 | +$14.94 | +$36.48 | +$79.56 |
| 10× | -7.00 % | −$96.76 (L) | −$96.76 (L) | −$59.56 | −$12.38 | +$30.84 | +$73.31 | +$158.25 |

### Issuers' inntekt fra den samme hedge-posisjonen

| m | Lånegebyr | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 |
| 2× | +$0.24 | +$0.24 | +$0.24 | +$0.24 | +$0.24 | +$1.08 | +$2.05 | +$3.98 |
| 3× | +$0.48 | +$0.48 | +$0.48 | +$0.48 | +$0.48 | +$1.74 | +$3.18 | +$6.07 |
| 5× | +$0.96 | +$22.02 | +$0.96 | +$0.96 | +$0.96 | +$3.02 | +$5.42 | +$10.20 |
| 10× | +$2.14 | +$20.49 | +$20.49 | +$2.14 | +$2.14 | +$6.11 | +$10.83 | +$20.26 |

### Short (tjener når prisen faller): traderens gevinst/tap på $100

| m | Likv. ved | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | +58.25 % | +$14.21 | +$5.43 | +$1.04 | −$3.40 | −$8.28 | −$13.15 | −$22.90 |
| 2× | +28.50 % | +$30.83 | +$13.32 | +$4.57 | −$4.30 | −$14.03 | −$23.75 | −$43.20 |
| 3× | +20.22 % | +$47.33 | +$21.14 | +$8.05 | −$5.24 | −$19.79 | −$34.33 | −$63.43 |
| 5× | +12.58 % | +$79.97 | +$36.56 | +$14.85 | −$7.20 | −$31.32 | −$55.44 | −$90.37 (L) |
| 10× | +6.54 % | +$159.57 | +$73.85 | +$30.99 | −$12.62 | −$60.24 | −$96.24 (L) | −$96.24 (L) |

### Issuers' inntekt fra den samme short-posisjonen

| m | Lånegebyr | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | +$0.24 | +$2.13 | +$1.16 | +$0.67 | +$0.24 | +$0.24 | +$0.24 | +$0.24 |
| 2× | +$0.48 | +$4.25 | +$2.31 | +$1.33 | +$0.48 | +$0.48 | +$0.48 | +$0.48 |
| 3× | +$0.73 | +$6.35 | +$3.44 | +$1.99 | +$0.73 | +$0.73 | +$0.73 | +$0.73 |
| 5× | +$1.20 | +$10.52 | +$5.69 | +$3.28 | +$1.20 | +$1.20 | +$1.20 | +$23.67 |
| 10× | +$2.37 | +$20.67 | +$11.15 | +$6.38 | +$2.37 | +$2.37 | +$23.68 | +$23.68 |
