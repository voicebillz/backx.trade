"""Revenue split for one $100 trade and for $50M of trading volume (owner question 2026-10-25).
Same fee model as the contracts (BackxManagerBase._stakeFor, Fees defaults) and web/src/lib/hedge.ts:
  amount typed = X + fees + gas. 1x hedge: platform 0.3 % of X only. Otherwise platform 2 % of X, RSF 0.5 % of X
  + 0.03 % of lent, borrow 0.25 % of lent (to issuers). Issuers also get p = 10 % of a trader's profit.
  Platform fees go to the Treasury; 10 % of that goes to $GAZZ and Gazz Tanks stakers (BackxStaking).
Volume = position size (m x margin), the usual way exchanges count it."""
GAS = 0.10
PLATFORM, SPOT, RSF_X, RSF_L, BORROW, P_GAIN, HOLDERS = 0.02, 0.003, 0.005, 0.0003, 0.0025, 0.10, 0.10

def split(amount, m, side='hedge'):
    lent_mult = m - 1 if side == 'hedge' else m
    if lent_mult == 0:
        x = (amount - GAS) / (1 + SPOT); plat = x * SPOT; rsf = 0.0
    else:
        x = (amount - GAS) / (1 + PLATFORM + RSF_X + lent_mult * (BORROW + RSF_L)); plat = x * PLATFORM
        rsf = x * RSF_X + lent_mult * x * RSF_L
    lent = lent_mult * x
    return dict(margin=x, notional=m * x, lent=lent, platform=plat, rsf=rsf, borrow=lent * BORROW, gas=GAS)

print('One $100 trade')
for label, m, side in [('Hedge 1x', 1, 'hedge'), ('Hedge 5x', 5, 'hedge'), ('Hedge 10x', 10, 'hedge'), ('Short 3x', 3, 'short')]:
    s = split(100, m, side)
    print(f"  {label:10} position ${s['notional']:7.2f} | Treasury ${s['platform']*(1-HOLDERS):.3f}  $GAZZ ${s['platform']*HOLDERS:.3f}"
          f"  RSF ${s['rsf']:.3f}  issuers ${s['borrow']:.3f} (+10 % of any profit)  validator ${GAS:.2f}")

# $50M volume. Mix by volume (assumption): 40 % hedge 1x, 40 % hedge 5x, 20 % short 3x; average $100 typed per trade.
VOLUME = 50e6
MIX = [('Hedge 1x', 1, 'hedge', 0.40), ('Hedge 5x', 5, 'hedge', 0.40), ('Short 3x', 3, 'short', 0.20)]
WIN_SHARE, WIN_MOVE = 0.5, 0.04   # half the multiplied volume closes in profit, average +4 % price move
LIQ_SHARE = 0.15                  # 15 % of positions with a loan end in liquidation
# e = trader equity left at liquidation, s = issuers' share of it (contract params, same table as web hedge.ts)
E = {3: 0.35, 5: 0.30, 10: 0.20}
S = {3: 0.60, 5: 0.70, 10: 0.85}
tot = dict(platform=0, rsf=0, borrow=0, gain=0, liq=0, gas=0, lent=0, trades=0)
for label, m, side, share in MIX:
    one = split(100, m, side)
    n = VOLUME * share / one['notional']
    for k in ('platform', 'rsf', 'borrow', 'gas', 'lent'):
        tot[k] += n * one[k]
    tot['trades'] += n
    if one['lent'] > 0:
        tot['gain'] += VOLUME * share * WIN_SHARE * WIN_MOVE * P_GAIN
        tot['liq'] += n * LIQ_SHARE * one['margin'] * E[m] * S[m]
issuers = tot['borrow'] + tot['gain'] + tot['liq']
print(f"\n$50M volume, {tot['trades']:,.0f} trades of $100")
print(f"  Treasury (90 % of platform) ${tot['platform']*(1-HOLDERS):,.0f}")
print(f"  $GAZZ / Tanks stakers (10 %) ${tot['platform']*HOLDERS:,.0f}")
print(f"  Reserve Security Fund       ${tot['rsf']:,.0f}")
print(f"  Issuers: borrow ${tot['borrow']:,.0f} + profit share ${tot['gain']:,.0f} + liquidations ${tot['liq']:,.0f} = ${issuers:,.0f}")
print(f"  Validators (gas)            ${tot['gas']:,.0f}")
print(f"  Lent in total               ${tot['lent']:,.0f}")

# Issuer APR: depends on how fast the volume comes and how much is issued. Positions held 3 days on average.
# APR = issuer income per $ lent x turns per year x share of the reserve lent out (not the volume itself).
per_lent = issuers / tot['lent']
for hold in (1, 3, 7):
    print('  hold', hold, 'days:', '  '.join(f"{u:.0%} lent → APR ~{per_lent * 365 / hold * u:.0%}" for u in (0.3, 0.6)))
