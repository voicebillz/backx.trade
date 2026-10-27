"""Where the money from every trade goes, on average (owner question 2026-10-27, pitch deck "Every trade pays").
Monte Carlo over many Long positions with the contract defaults (same math as web/src/lib/hedge.ts quote()):
fees come out of the amount typed (platform 2 % of X or 0.3 % at 1x, borrow 0.25 % of lent, RSF 0.5 % of X + 0.03 %
of lent, gas $0.50), issuers get 10 % of a gain or s of the rest at a liquidation, the platform 2 % of a gain and 5 %
of the rest at a liquidation, validators the gas + an accuracy bonus (liquidation max 0.5 %, fills 0.1 % of the
position value, never above 15 % of the rest) when they settle; an own close sends the gas to the Treasury.
Counts only what is paid to the four parties (not the trader's own result, not DEX swap fees).
Assumptions (mix, volatility, how positions end) are printed; several variants show the range."""
import math, random

PLATFORM, SPOT, BORROW, RSF_X, RSF_L, GAS = 0.02, 0.003, 0.0025, 0.005, 0.0003, 0.5
P_GAIN, PLAT_GAIN, PLAT_LIQ = 0.10, 0.02, 0.05
LIQ_BONUS, FILL_BONUS, REST_CAP, LATE = 0.005, 0.001, 0.15, 0.20
E = [0, 4000, 4000, 3500, 3250, 3000, 2750, 2500, 2375, 2250, 2000, 1920, 1840, 1760, 1680, 1600, 1560, 1520, 1480, 1440, 1400]
S = [0, 5000, 5000, 6000, 6500, 7000, 7500, 8000, 8167, 8333, 8500, 8600, 8700, 8800, 8900, 9000, 9000, 9000, 9000, 9000, 9000]
TIERS = {  # share of positions, max leverage, liquidation margin, pool fee, price volatility over a hold
    'Major': (0.60, 20, 0.015, 0.0005, 0.04), 'Large': (0.25, 5, 0.02, 0.003, 0.06),
    'Mid': (0.10, 3, 0.03, 0.003, 0.08), 'Small': (0.05, 2, 0.04, 0.003, 0.10)}
LEV = [(1, 20), (2, 15), (3, 15), (5, 20), (10, 15), (20, 15)]

def buffer(m): return 0.003 + 0.0002 * max(m - 10, 0)

def accuracy():  # bonus factor: ((W-d)/W)^2 with d uniform in [0, 1.5 W], never below the late floor
    d = random.uniform(0, 1.5)
    return max((1 - d) ** 2 if d < 1 else 0, LATE)

def one(tier, m, amount, fill_share):
    _, cap, liq_m, pool, vol = TIERS[tier]
    m = min(m, cap)
    lent_mult = m - 1
    rate = (SPOT if lent_mult == 0 else PLATFORM + RSF_X) + lent_mult * (BORROW + RSF_L)
    x = max(0.0, (amount - GAS) / (1 + rate))
    loan = lent_mult * x
    out = dict(issuers=loan * BORROW, validators=0.0, rsf=0.0 if loan == 0 else x * RSF_X + loan * RSF_L,
               treasury=x * (SPOT if loan == 0 else PLATFORM))
    notional = m * x
    coins = notional * (1 - pool)
    e, s = E[m] / 1e4, S[m] / 1e4
    liq = 0 if m == 1 else (loan * (1 + buffer(m)) + e * x + liq_m * notional) / (coins * (1 - pool))
    # price path: 40 steps of a random walk, liquidated if it ever touches the trigger
    p, low, step = 1.0, 1.0, vol / math.sqrt(40)
    for _ in range(40):
        p *= math.exp(random.gauss(0, step)); low = min(low, p)
    if m > 1 and low <= liq:
        rest = coins * liq * (1 - pool) - loan
        value = coins * liq
        bonus = min(LIQ_BONUS * value * accuracy(), REST_CAP * max(rest, 0))
        r = max(rest - bonus, 0)
        out['validators'] += GAS + bonus
        out['treasury'] += r * PLAT_LIQ
        out['issuers'] += r * (1 - PLAT_LIQ) * s
        return out, notional
    rest = coins * p * (1 - pool) - loan
    gain = 0 if m == 1 else max(rest - x, 0)
    out['issuers'] += gain * P_GAIN
    out['treasury'] += gain * PLAT_GAIN
    if random.random() < fill_share:   # take profit / stop loss filled by a validator
        out['validators'] += GAS + min(FILL_BONUS * coins * p * accuracy(), REST_CAP * max(rest, 0))
    else:                              # own close: the gas escrow goes to the Treasury
        out['treasury'] += GAS
    return out, notional

def run(n=200_000, median=200, fill_share=0.3, seed=1):
    random.seed(seed)
    names = list(TIERS); w = [TIERS[t][0] for t in names]
    tot = dict(issuers=0.0, validators=0.0, rsf=0.0, treasury=0.0); vol = 0.0
    for _ in range(n):
        tier = random.choices(names, w)[0]
        m = random.choices([l for l, _ in LEV], [c for _, c in LEV])[0]
        amount = min(max(random.lognormvariate(math.log(median), 1.0), 10), 50_000)
        o, nv = one(tier, m, amount, fill_share)
        for k in tot: tot[k] += o[k]
        vol += nv
    all_ = sum(tot.values())
    return {k: v / all_ for k, v in tot.items()}, all_ / vol

if __name__ == '__main__':
    rows = []
    for label, kw in [('base: $200 median, 30 % TP/SL fills', {}), ('small trades: $50 median', {'median': 50}),
                      ('big trades: $1,000 median', {'median': 1000}), ('more TP/SL: 60 % fills', {'fill_share': 0.6}),
                      ('seed 2', {'seed': 2}), ('seed 3', {'seed': 3})]:
        sh, per_vol = run(**kw); rows.append(sh)
        print(f"{label:38} issuers {sh['issuers']:5.1%}  treasury {sh['treasury']:5.1%}  validators {sh['validators']:5.1%}  RSF {sh['rsf']:5.1%}  (income {per_vol:.3%} of volume)")
    avg = {k: sum(r[k] for r in rows) / len(rows) for k in rows[0]}
    print('AVERAGE', '  '.join(f"{k} {v:.1%}" for k, v in avg.items()))
