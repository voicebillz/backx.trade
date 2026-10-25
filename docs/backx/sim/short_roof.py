# short_roof.py: the planned borrow-and-sell short with a profit roof (owner 2026-10-25). Assumptions, not measurements.
# Trader pays A USDC. Fees come out first (holders 2 %, RSF 0.5 % of margin + 0.03 % of lent, borrow 0.25 % of lent),
# the rest is the margin X. q = m·X / P0 coins are borrowed and sold; every swap cost (pool fee + slippage, 0.35 % each
# way) is the trader's. Collateral C = X + sale proceeds stays in the contract until the q coins are bought back.
# - Liquidation (price UP): when C − buyback(P) ≤ margin · buyback(P). Issuer gets exactly q coins back.
# - Roof (price DOWN): auto-close when the price has fallen ROOF; the trader's gain is capped there.
# - Issuers get the borrow fee + p = 10 % of the trader's gain, in USDC, claimable.
# Monte Carlo: jump-up "pumps" (+20…+300 % in 5…120 s) and how much of q the collateral can buy back if the
# validator sells L seconds after the trigger. Shortfall = coins the RSF has to buy.
import random

SWAP = 0.0035
FEE_HOLD, FEE_RSF, FEE_RSF_L, FEE_BORROW, P_SHARE = .02, .005, .0003, .0025, .10
TIERS = [("Major", .02, 20, .80), ("Large", .03, 5, .70), ("Mid", .04, 3, .60), ("Small", .05, 2, .50)]  # name, margin, max m, roof (owner 2026-10-25)

def open_pos(A, m):
    lent_mult = m                                   # q·P0 = m·X is lent (in coin)
    X = A / (1 + FEE_HOLD + FEE_RSF + lent_mult * (FEE_BORROW + FEE_RSF_L))
    q = m * X                                       # P0 = 1
    C = X + q * (1 - SWAP)
    return X, q, C

def liq_rise(m, margin):
    X, q, C = open_pos(100, m)
    # C = (1+margin) · q·P·(1+SWAP)
    return C / ((1 + margin) * q * (1 + SWAP)) - 1

def roof_gain(A, m, roof):
    X, q, C = open_pos(A, m)
    rest = C - q * (1 - roof) * (1 + SWAP)
    gain = max(rest - A, 0)
    return rest - gain * P_SHARE - A, gain * P_SHARE

def pump_sim(m, margin, lat, n=20000, seed=7):
    rnd = random.Random(seed)
    X, q, C = open_pos(100, m)
    short, total = 0, 0.0
    for _ in range(n):
        top = 1 + rnd.uniform(.2, 3.0)
        dur = rnd.uniform(5, 120)
        trig = C / ((1 + margin) * q * (1 + SWAP))     # price at trigger
        # price after lat seconds past the trigger (linear pump)
        t_trig = dur * (trig - 1) / (top - 1) if top > trig else None
        if t_trig is None: continue
        p = min(top, trig + (top - 1) * lat / dur)
        cost = q * p * (1 + SWAP + .005)               # +0.5 % crowd slippage
        if cost > C:
            short += 1; total += (cost - C) / (q * 1)
    return short / n, total / n

SCEN = [("+30% / 10 s", .30, 10), ("+30% / 60 s", .30, 60), ("+60% / 5 min", .60, 300), ("+100% / 30 s", 1.0, 30)]


def scenario_loss(m, margin, lat, up, dur):
    """Linear pump of `up` over `dur` s; the validator buys back `lat` s after the trigger. Shortfall in % of lent."""
    X, q, C = open_pos(100, m)
    trig = C / ((1 + margin) * q * (1 + SWAP))
    if 1 + up <= trig:
        return 0.0
    p = min(1 + up, trig + up * lat / dur)
    return max(0.0, q * p * (1 + SWAP + .005) - C) / q * 100


if __name__ == "__main__":
    print("Fixed pump scenarios at the tier caps (owner 2026-10-25): issuer shortfall in % of lent, before the fund")
    for name, margin, mmax, _ in TIERS:
        for lat in (0.5, 3):
            print(f"{name:5} {mmax:>2}x margin {margin*100:.0f}% validator {lat:>3}s: " + "  ".join(f"{n} {scenario_loss(mmax, margin, lat, u, d):5.2f}%" for n, u, d in SCEN))
    print()
    print("Liquidation (price rise) and roof outcome per $100, issuer share of gain p = 10 %")
    for name, margin, mmax, roof in TIERS:
        for m in sorted({1, 2, mmax}):
            if m > mmax: continue
            g, iss = roof_gain(100, m, roof)
            print(f"{name:5} {m}x  liq ▲ +{liq_rise(m, margin)*100:6.1f} %   roof ▼ −{roof*100:.0f} %: trader +${g:6.2f}, issuers +${iss:5.2f} (+ borrow fee)")
    print("\nPumps through the liquidation point: share of liquidations short of coins / avg shortfall (% of lent)")
    for name, margin, mmax, _ in TIERS:
        row = [f"{name:5} {mmax}x"]
        for lat in (0.5, 3, 60):
            pr, sf = pump_sim(mmax, margin, lat)
            row.append(f"{lat:>4}s: {pr*100:5.1f} % / {sf*100:5.2f} %")
        print("  ".join(row))
