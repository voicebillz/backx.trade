# sim3: Hedge AND Short up to 30x on the same real 1-minute paths as sim2/short_sim (both directions).
# Purpose: pick the parameters the contracts use:
#   - issuer margin (e: trader equity left at liquidation, buffer on the issuer's principal)
#   - Reserve Security Fund fee (stake part + notional part) so gaps are covered with room to spare
#   - max multiplication per pool type, per side
# Keeper model is deliberately slow: the trigger is checked on 1-minute highs/lows and the position is
# closed at that minute's close (or the trigger price if better). Real keepers act in seconds.
#
# Usage: python3 sim3.py [samples] [variant]   (needs the .npy files from fetch.py in the cwd)
import numpy as np, json, sys

X = 100.0
HOLD = 0.02            # holders fee, % of stake
BORROW = 0.002         # borrow fee to issuers, % of the amount lent
RSF_STAKE = 0.005      # Reserve Security Fund, % of stake
HZ = [5, 60, 240, 1440, 4320]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 800
VARIANT = sys.argv[2] if len(sys.argv) > 2 else "v3"
MULTS = [1, 2, 3, 5, 7, 10, 15, 20, 25, 30]

# e: trader equity left at liquidation (the issuer's cushion). s, p as in the spec.
E_SPEC = dict(zip(MULTS, [.40, .40, .35, .30, .25, .20, .15, .12, .10, .08]))
E_V3 = dict(zip(MULTS, [.40, .40, .35, .30, .25, .20, .16, .14, .13, .12]))   # floor ~12 % at high m
S_ = dict(zip(MULTS, [.50, .50, .60, .70, .80, .85, .90, .90, .90, .90]))
P_ = dict(zip(MULTS, [.15, .15, .20, .25, .30, .30, .30, .30, .30, .30]))

def buffer(side, m):
    """Extra margin on the issuer's principal before liquidation."""
    if VARIANT == "spec":
        return 0.003 if side == "hedge" else 0.01
    base = 0.003 if side == "hedge" else 0.006
    return base + 0.0002 * max(m - 10, 0)          # grows past 10x: 30x → +0.4 %

def rsf_notional(m):
    """Reserve Security Fund part charged on the amount lent (v3)."""
    return 0.0 if VARIANT == "spec" else 0.0003   # 0.03 % of the amount lent

E_ = E_SPEC if VARIANT == "spec" else E_V3

COINS = {
    "deep 0.05% $10M (BTC)": ("BTCUSDT", .0005, 10e6),
    "meme 0.3% $1M (DOGE)": ("DOGEUSDT", .003, 1e6),
    "meme 0.3% $1M (PEPE)": ("PEPEUSDT", .003, 1e6),
    "meme 0.3% $1M (WIF)": ("WIFUSDT", .003, 1e6),
    "thin 0.3% $56k (GAZZ)": ("GAZZ", .003, 56e3),
}

def run(side, d, c, tvl, m, rng):
    e, s, p = E_[m], S_[m], P_[m]
    buf = buffer(side, m)
    hold, rsf_s = HOLD * X, RSF_STAKE * X
    if side == "hedge":
        L = (m - 1) * X                       # USD lent
        borrow = BORROW * L; rsf_n = rsf_notional(m) * L
        E = X - hold - rsf_s - borrow - rsf_n
        N0 = E + L
    else:
        E0 = X - hold - rsf_s
        N0 = m * E0                           # USD value of tokens lent
        L = N0
        borrow = BORROW * L; rsf_n = rsf_notional(m) * L
        E = E0 - borrow - rsf_n
    cost = c + N0 / tvl
    fees = dict(holders=hold, borrow=borrow, rsf=rsf_s + rsf_n, swap=2 * N0 * cost)
    if side == "hedge":
        Q = N0 * (1 - cost)                  # coin value bought (units of P0)
        if m == 1:
            trig = None
        else:
            trig = (L * (1 + buf) + e * E) / (Q * (1 - cost))   # price ratio that liquidates (< 1)
            if trig >= 1: return None
    else:
        C = E + N0 * (1 - cost)               # USD held after selling the borrowed tokens
        trig = (C - e * E) / (N0 * (1 + cost) * (1 + buf))      # ratio that liquidates (> 1)
        if trig <= 1: return None
    A = dict.fromkeys("n liq gap gaploss iss trader cap".split(), 0.0)
    cl, hi, lo = d[:, 3], d[:, 1], d[:, 2]; T = len(cl)
    for hz in HZ:
        for i0 in rng.integers(0, T - hz - 2, N):
            P0 = cl[i0]; A["n"] += 1; iss = borrow
            if side == "hedge":
                k = np.nonzero(lo[i0 + 1:i0 + 1 + hz] / P0 <= trig)[0] if trig else np.array([])
                if k.size:
                    k = k[0]; A["liq"] += 1
                    fill = min(trig, cl[i0 + 1 + k] / P0)
                    rem = Q * fill * (1 - cost) - L
                else:
                    fill = cl[i0 + hz] / P0
                    rem = Q * fill * (1 - cost) - L
            else:
                k = np.nonzero(hi[i0 + 1:i0 + 1 + hz] / P0 >= trig)[0]
                if k.size:
                    k = k[0]; A["liq"] += 1
                    fill = max(trig, cl[i0 + 1 + k] / P0)
                    rem = C - N0 * fill * (1 + cost)
                else:
                    fill = cl[i0 + hz] / P0
                    rem = C - N0 * fill * (1 + cost)
            if k.size:
                if rem < 0:
                    A["gap"] += 1; A["gaploss"] += rem; iss += rem; tr = 0.0
                else:
                    iss += s * rem; tr = (1 - s) * rem
            else:
                prof = rem - X
                if prof > 0: iss += p * prof; tr = rem - p * prof
                else: tr = rem
            A["iss"] += iss; A["trader"] += tr - X
    n = A["n"]
    rsf_in = fees["rsf"]; gap_avg = A["gaploss"] / n
    return dict(
        move=(trig - 1) * 100 if trig else None, liq=A["liq"] / n * 100, gap=A["gap"] / n * 100,
        gap_per_pos=gap_avg, rsf_in=rsf_in, rsf_cover=(rsf_in / -gap_avg) if gap_avg < 0 else float("inf"),
        iss_pos=A["iss"] / n, trader_ev=A["trader"] / n, fees=fees, fee_total=sum(fees.values()),
        notional=N0,
    )

res = {}
print(f"variant={VARIANT}  samples/horizon={N}  (both price directions)")
for name, (f, c, tvl) in COINS.items():
    d0 = np.load(f"./{f}.npy")
    mir = np.stack([1 / d0[:, 0], 1 / d0[:, 2], 1 / d0[:, 1], 1 / d0[:, 3]], 1)
    for side in ("hedge", "short"):
        for m in MULTS:
            rs = [run(side, d, c, tvl, m, np.random.default_rng(7)) for d in (d0, mir)]
            if any(r is None for r in rs):
                print(f"{name:24} {side:5} {m:>2}x  NOT POSSIBLE (born liquidated)"); res[f"{name}|{side}|{m}"] = None; continue
            r = {k: (sum(x[k] for x in rs) / 2 if isinstance(rs[0][k], (int, float)) and rs[0][k] is not None else rs[0][k]) for k in rs[0]}
            # coverage from the averaged numbers (averaging per-direction ratios is wrong)
            r["rsf_cover"] = r["rsf_in"] / -r["gap_per_pos"] if r["gap_per_pos"] < 0 else float("inf")
            res[f"{name}|{side}|{m}"] = r
            f_ = r["fees"]
            mv = f"{r['move']:+6.2f}%" if r["move"] is not None else "  none "
            cov = "   ∞" if r["rsf_cover"] == float("inf") else f"{r['rsf_cover']:4.1f}"
            print(f"{name:24} {side:5} {m:>2}x liq@{mv} liqRate {r['liq']:5.1f}% gap {r['gap']:5.2f}% "
                  f"gap/pos {r['gap_per_pos']:+6.3f} RSF {r['rsf_in']:.2f} cover {cov}x | iss {r['iss_pos']:+6.2f} trader {r['trader_ev']:+6.1f} | "
                  f"fees {r['fee_total']:5.2f} (hold {f_['holders']:.1f} borrow {f_['borrow']:.2f} rsf {f_['rsf']:.2f} swap {f_['swap']:.2f}) N {r['notional']:.0f}",
                  flush=True)
json.dump(res, open(f"./res3_{VARIANT}.json", "w"), indent=1)
