# backx.trade: $100-scenarier for Hedge, Short og issuers (2026-10-18)

> Laget med `sim/scenarios.py` (samme tall som `web/src/lib/hedge.ts` og kontraktene, v3).
> Én prisbevegelse, ingen tidsbane. **(L)** = likvidert av keeper akkurat på likvideringspunktet.
> Alle tall er **etter alle gebyrer** (holders 2 %, lån 0,2 %, Reserve Security Fund, swap begge veier).
> Ikke auditert, ikke deployet. Ingen lovnader om avkastning: dette er regneeksempler.

## 1. Hvor pengene i en short kommer fra (eksempel: $100, 5×, PONS til $0,50, meme-pool)

| Steg | Hva skjer | Tall |
|---|---|---|
| 1 | **Issuer** har satt inn PONS i token-reserven («Issue PONS») | f.eks. 100 000 PONS |
| 2 | **Traderen** setter inn $100 USDC. Gebyrer: holders $2,00, fondet $0,65, lån $0,97 | igjen: **$96,38** (sikkerhet) |
| 3 | Kontrakten **låner 975 PONS** fra token-reserven (5 × $97,50 = $487,50) | q = 975 PONS |
| 4 | De 975 PONS **selges med en gang** for USDC (pool-gebyr + impact 0,35 %) | ca. $485,80 |
| 5 | Posisjonen holder nå **$582,18 USDC, låst** i kontrakten (traderens $96,38 + salget) | C = $582,18 |
| 6a | **Prisen faller 10 % (til $0,45):** kontrakten kjøper tilbake nøyaktig 975 PONS for $440,28 | rest $141,90 |
|    | → issuer får **975 PONS tilbake først**, pluss lånegebyr og 25 % av gevinsten (p ved 5×) (kjøpt som PONS) | issuer +$11,45 i PONS |
|    | → traderen får resten i USDC | **$131,42 (+$31,42)** |
| 6b | **Prisen stiger 10 % (til $0,55):** tilbakekjøpet koster $538,12 | traderen får $44,06 (−$55,94) |
| 6c | **Prisen stiger 12,42 %:** keeper likviderer, kjøper tilbake 975 PONS | traderen $9,66, issuer +$23,52 |
| 7 | **Gap** (prisen hopper så langt at $582 ikke holder til 975 PONS): **Reserve Security Fund kjøper resten**. Først når fondet er tomt, taper issuers pro rata. | |

Kort sagt: **short-pengene er issuers' tokens, solgt.** Traderen låner ikke dollar, men PONS, og må
levere samme antall PONS tilbake. Issuer får alltid **antall tokens** tilbake, pluss inntekt i PONS.
Issuer eier PONS hele tiden, så de har kursrisikoen på sine egne tokens, akkurat som før de satte inn.

Hedge er speilbildet: issuer setter inn **USDC** («Issue USD»), kontrakten låner (m−1)·$100 USDC,
og traderens $100 + lånet kjøper coinen. Ved lukking selges coinen, og issuer får USDC tilbake først.

## 2. Hva gap koster fondet (dyp pool, prisen hopper 10 % i ett hopp før keeper rekker å handle)

| Posisjon | Fondet fikk inn | Fondet betaler ut | Issuers |
|---|---|---|---|
| Hedge 10× | $0,77 | $5,19 | hele (fondet dekker) |
| Short 10× | $0,79 | $3,47 | hele |
| Hedge 30× | $1,37 | $212,55 | hele, hvis fondet har nok |
| Short 30× | $1,38 | $206,60 | hele, hvis fondet har nok |

Et 10 %-hopp på ett minutt skjer nesten aldri på BTC/ETH (simuleringen: 0 gap på dype pooler ved 30×), men
hvis det skjer på 30×, koster én posisjon fondet like mye som ca. 150 åpninger gir inn. Derfor
er 30× bare tillatt på dype pooler, og meme-coins er låst til maks 10×.

Les tabellene slik: rad = multiplikator, kolonne = prisbevegelse. Traderens tall er netto gevinst/tap på $100. Issuers' tall er hva **den ene posisjonen** gir issuers totalt (lånegebyr + andel av gevinst, eller andel av resten ved likvidering). 1× Hedge låner ingenting, så issuers får 0.

## 3. Dyp pool (BTC/ETH-type, 0,05 %, $10M)

### Hedge (tjener når prisen stiger): traderens gevinst/tap på $100

| m | Likv. ved | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | aldri | −$22.08 | −$12.34 | −$7.47 | −$2.60 | +$2.27 | +$7.14 | +$16.88 |
| 2× | -29.36 % | −$42.35 | −$22.64 | −$12.79 | −$2.93 | +$5.88 | +$14.26 | +$31.01 |
| 3× | -20.95 % | −$62.62 | −$32.95 | −$18.11 | −$3.27 | +$9.25 | +$21.12 | +$44.86 |
| 5× | -13.28 % | −$90.95 (L) | −$53.57 | −$28.77 | −$3.97 | +$15.63 | +$34.23 | +$71.43 |
| 10× | -7.29 % | −$96.73 (L) | −$96.73 (L) | −$55.48 | −$5.76 | +$30.76 | +$65.56 | +$135.16 |
| 20× | -3.41 % | −$97.75 (L) | −$97.75 (L) | −$97.75 (L) | −$9.66 | +$62.90 | +$132.56 | +$271.89 |
| 30× | -1.84 % | −$96.88 (L) | −$96.88 (L) | −$96.88 (L) | −$13.95 | +$94.75 | +$199.26 | +$408.28 |

### Issuers' inntekt fra den samme hedge-posisjonen

| m | Lånegebyr | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 |
| 2× | +$0.20 | +$0.20 | +$0.20 | +$0.20 | +$0.20 | +$1.24 | +$2.72 | +$5.67 |
| 3× | +$0.40 | +$0.40 | +$0.40 | +$0.40 | +$0.40 | +$2.71 | +$5.68 | +$11.61 |
| 5× | +$0.80 | +$21.92 | +$0.80 | +$0.80 | +$0.80 | +$6.01 | +$12.21 | +$24.61 |
| 10× | +$1.80 | +$20.32 | +$20.32 | +$1.80 | +$1.80 | +$14.98 | +$29.90 | +$59.73 |
| 20× | +$3.80 | +$24.08 | +$24.08 | +$24.08 | +$3.80 | +$30.76 | +$60.61 | +$120.32 |
| 30× | +$5.80 | +$33.88 | +$33.88 | +$33.88 | +$5.80 | +$46.41 | +$91.20 | +$180.78 |

### Short (tjener når prisen faller): traderens gevinst/tap på $100

| m | Likv. ved | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | +58.78 % | +$14.18 | +$5.89 | +$1.75 | −$2.82 | −$7.70 | −$12.58 | −$22.33 |
| 2× | +28.97 % | +$30.49 | +$13.91 | +$5.61 | −$3.15 | −$12.91 | −$22.66 | −$42.17 |
| 3× | +20.68 % | +$44.04 | +$20.63 | +$8.92 | −$3.48 | −$18.12 | −$32.75 | −$62.01 |
| 5× | +13.04 % | +$70.05 | +$33.47 | +$15.17 | −$4.16 | −$28.54 | −$52.93 | −$90.33 (L) |
| 10× | +7.05 % | +$132.45 | +$64.16 | +$30.01 | −$5.91 | −$54.69 | −$96.20 (L) | −$96.20 (L) |
| 20× | +3.14 % | +$266.40 | +$129.81 | +$61.51 | −$9.70 | −$97.09 (L) | −$97.09 (L) | −$97.09 (L) |
| 30× | +1.55 % | +$400.12 | +$195.21 | +$92.75 | −$13.86 | −$95.94 (L) | −$95.94 (L) | −$95.94 (L) |

### Issuers' inntekt fra den samme short-posisjonen

| m | Lånegebyr | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | +$0.20 | +$2.70 | +$1.23 | +$0.50 | +$0.20 | +$0.20 | +$0.20 | +$0.20 |
| 2× | +$0.39 | +$5.77 | +$2.84 | +$1.38 | +$0.39 | +$0.39 | +$0.39 | +$0.39 |
| 3× | +$0.58 | +$11.59 | +$5.74 | +$2.82 | +$0.58 | +$0.58 | +$0.58 | +$0.58 |
| 5× | +$0.97 | +$24.32 | +$12.13 | +$6.03 | +$0.97 | +$0.97 | +$0.97 | +$23.53 |
| 10× | +$1.95 | +$58.71 | +$29.45 | +$14.81 | +$1.95 | +$1.95 | +$23.47 | +$23.47 |
| 20× | +$3.90 | +$118.07 | +$59.53 | +$30.26 | +$3.90 | +$30.11 | +$30.11 | +$30.11 |
| 30× | +$5.85 | +$177.33 | +$89.51 | +$45.60 | +$5.85 | +$42.41 | +$42.41 | +$42.41 |


## 4. Meme-pool (0,3 %, $1M)

### Hedge (tjener når prisen stiger): traderens gevinst/tap på $100

| m | Likv. ved | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | aldri | −$22.48 | −$12.79 | −$7.95 | −$3.10 | +$1.74 | +$6.59 | +$16.28 |
| 2× | -28.98 % | −$43.19 | −$23.59 | −$13.79 | −$3.99 | +$4.94 | +$13.27 | +$29.93 |
| 3× | -20.51 % | −$63.93 | −$34.42 | −$19.67 | −$4.92 | +$7.87 | +$19.67 | +$43.28 |
| 5× | -12.76 % | −$90.95 (L) | −$56.20 | −$31.54 | −$6.89 | +$13.33 | +$31.82 | +$68.80 |
| 10× | -6.65 % | −$96.73 (L) | −$96.73 (L) | −$61.88 | −$12.51 | +$25.81 | +$60.37 | +$129.49 |

### Issuers' inntekt fra den samme hedge-posisjonen

| m | Lånegebyr | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 | ±$0.00 |
| 2× | +$0.20 | +$0.20 | +$0.20 | +$0.20 | +$0.20 | +$1.07 | +$2.54 | +$5.48 |
| 3× | +$0.40 | +$0.40 | +$0.40 | +$0.40 | +$0.40 | +$2.37 | +$5.32 | +$11.22 |
| 5× | +$0.80 | +$21.92 | +$0.80 | +$0.80 | +$0.80 | +$5.24 | +$11.41 | +$23.73 |
| 10× | +$1.80 | +$20.32 | +$20.32 | +$1.80 | +$1.80 | +$12.86 | +$27.67 | +$57.30 |

### Short (tjener når prisen faller): traderens gevinst/tap på $100

| m | Likv. ved | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | +58.11 % | +$13.80 | +$5.48 | +$1.33 | −$3.33 | −$8.22 | −$13.11 | −$22.89 |
| 2× | +28.36 % | +$29.69 | +$13.06 | +$4.75 | −$4.19 | −$13.98 | −$23.76 | −$43.32 |
| 3× | +20.07 % | +$42.87 | +$19.40 | +$7.66 | −$5.10 | −$19.77 | −$34.45 | −$63.79 |
| 5× | +12.42 % | +$68.11 | +$31.42 | +$13.08 | −$7.02 | −$31.48 | −$55.94 | −$90.34 (L) |
| 10× | +6.36 % | +$128.30 | +$59.78 | +$25.52 | −$12.49 | −$61.44 | −$96.21 (L) | −$96.21 (L) |

### Issuers' inntekt fra den samme short-posisjonen

| m | Lånegebyr | ▼ -20 % | ▼ -10 % | ▼ -5 % | ■ +0 % | ▲ +5 % | ▲ +10 % | ▲ +20 % |
|---|---|---|---|---|---|---|---|---|
| 1× | +$0.20 | +$2.63 | +$1.16 | +$0.43 | +$0.20 | +$0.20 | +$0.20 | +$0.20 |
| 2× | +$0.39 | +$5.63 | +$2.70 | +$1.23 | +$0.39 | +$0.39 | +$0.39 | +$0.39 |
| 3× | +$0.58 | +$11.30 | +$5.43 | +$2.50 | +$0.58 | +$0.58 | +$0.58 | +$0.58 |
| 5× | +$0.97 | +$23.68 | +$11.45 | +$5.33 | +$0.97 | +$0.97 | +$0.97 | +$23.52 |
| 10× | +$1.95 | +$56.93 | +$27.57 | +$12.89 | +$1.95 | +$1.95 | +$23.45 | +$23.45 |
