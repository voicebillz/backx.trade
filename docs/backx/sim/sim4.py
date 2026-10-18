# sim4: fee model v4 vs v3 on the same real 1-minute paths (both price directions), Hedge and Short.
# v4 = exposure is exactly m × stake; fees are paid ON TOP of the stake; issuers take a flat, smaller
# share of a gain (p) and earn more from the borrow fee. e, s and buffers are unchanged from v3.
# Keeper model as sim3 (slow: closes on the minute's close). Per $100 stake.
#
# Usage: python3 sim4.py [samples]   (needs the .npy files from fetch.py in the cwd)
import numpy as np, sys

X = 100.0
HZ = [5, 60, 240, 1440, 4320]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 600
MULTS = [1, 2, 3, 5, 10, 20, 30]
E_ = dict(zip([1, 2, 3, 5, 7, 10, 15, 20, 25, 30], [.40, .40, .35, .30, .25, .20, .16, .14, .13, .12]))
S_ = dict(zip([1, 2, 3, 5, 7, 10, 15, 20, 25, 30], [.50, .50, .60, .70, .80, .85, .90, .90, .90, .90]))
P_V3 = dict(zip([1, 2, 3, 5, 7, 10, 15, 20, 25, 30], [.15, .15, .20, .25, .30, .30, .30, .30, .30, .30]))

VARIANTS = {
    # name: holders (of stake), borrow (of lent), rsf stake, rsf lent, p, fees on top + N = m·X
    "v3": dict(hold=.02, borrow=.002, rsf_s=.005, rsf_l=.0003, p=None, ontop=False),
    "v4": dict(hold=.015, borrow=.0025, rsf_s=.005, rsf_l=.0003, p=.10, ontop=True),
    "v4-p5": dict(hold=.015, borrow=.0025, rsf_s=.005, rsf_l=.0003, p=.05, ontop=True),
    "v4-h2": dict(hold=.02, borrow=.0025, rsf_s=.005, rsf_l=.0003, p=.10, ontop=True),
}
COINS = {"deep (BTC)": ("BTCUSDT", .0005, 10e6), "meme (DOGE)": ("DOGEUSDT", .003, 1e6),
         "meme (PEPE)": ("PEPEUSDT", .003, 1e6), "meme (WIF)": ("WIFUSDT", .003, 1e6)}


def setup(v, side, m, c, tvl):
    V = VARIANTS[v]
    buf = (0.003 if side == "hedge" else 0.006) + 0.0002 * max(m - 10, 0)
    e, s = E_[m], S_[m]
    p = (0.0 if (side == "hedge" and m == 1) else (V["p"] if V["p"] is not None else P_V3[m]))
    hold, rsf_s = V["hold"] * X, V["rsf_s"] * X
    if V["ontop"]:
        E = X
        N0 = m * X
        L = (m - 1) * X if side == "hedge" else N0
        borrow, rsf = V["borrow"] * L, rsf_s + V["rsf_l"] * L
        paid = X + hold + borrow + rsf          # what leaves the wallet
    else:
        if side == "hedge":
            L = (m - 1) * X; borrow = V["borrow"] * L; rsf = rsf_s + V["rsf_l"] * L
            E = X - hold - rsf - borrow; N0 = E + L
        else:
            E0 = X - hold - rsf_s; N0 = m * E0; L = N0
            borrow = V["borrow"] * L; rsf = rsf_s + V["rsf_l"] * L; E = E0 - borrow - V["rsf_l"] * L
        paid = X
    cost = c + N0 / tvl
    return dict(e=e, s=s, p=p, buf=buf, E=E, N0=N0, L=L, borrow=borrow, rsf=rsf, hold=hold, paid=paid, cost=cost)


def settle(k, side, m, x, liq_fill=None):
    """Trader payout, issuer income, gap for price ratio x (or a liquidation fill)."""
    c = k["cost"]
    if side == "hedge":
        Q = k["N0"] * (1 - c)
        rem = Q * x * (1 - c) - k["L"]
    else:
        C = k["E"] + k["N0"] * (1 - c)
        rem = C - k["N0"] * x * (1 + c)
    iss = k["borrow"]
    if liq_fill:
        if rem < 0: return 0.0, iss + rem, rem
        return (1 - k["s"]) * rem, iss + k["s"] * rem, 0.0
    prof = rem - k["E"]
    cut = max(prof, 0) * k["p"]
    return rem - cut, iss + cut, 0.0


def trigger(k, side, m):
    c = k["cost"]
    if side == "hedge":
        if m == 1: return None
        Q = k["N0"] * (1 - c)
        return (k["L"] * (1 + k["buf"]) + k["e"] * k["E"]) / (Q * (1 - c))
    C = k["E"] + k["N0"] * (1 - c)
    return (C - k["e"] * k["E"]) / (k["N0"] * (1 + c) * (1 + k["buf"]))


def run(v, side, d, c, tvl, m, rng):
    k = setup(v, side, m, c, tvl)
    trig = trigger(k, side, m)
    if trig is not None and ((side == "hedge" and trig >= 1) or (side == "short" and trig <= 1)): return None
    A = dict(n=0, liq=0, gap=0, gaploss=0.0, iss=0.0, tr=0.0)
    cl, hi, lo = d[:, 3], d[:, 1], d[:, 2]; T = len(cl)
    for hz in HZ:
        for i0 in rng.integers(0, T - hz - 2, N):
            P0 = cl[i0]; A["n"] += 1
            if side == "hedge":
                hit = np.nonzero(lo[i0 + 1:i0 + 1 + hz] / P0 <= trig)[0] if trig else np.array([])
            else:
                hit = np.nonzero(hi[i0 + 1:i0 + 1 + hz] / P0 >= trig)[0]
            if hit.size:
                A["liq"] += 1
                px = cl[i0 + 1 + hit[0]] / P0
                fill = min(trig, px) if side == "hedge" else max(trig, px)
                tr, iss, gap = settle(k, side, m, fill, True)
                if gap < 0: A["gap"] += 1; A["gaploss"] += gap
            else:
                tr, iss, gap = settle(k, side, m, cl[i0 + hz] / P0)
            A["iss"] += iss; A["tr"] += tr - k["paid"]
    n = A["n"]
    win = settle(k, side, m, 1.1 if side == "hedge" else 0.9)
    return dict(liq=A["liq"] / n * 100, gap=A["gap"] / n * 100, gap_pos=A["gaploss"] / n, iss=A["iss"] / n,
                tr=A["tr"] / n, house=k["hold"], rsf=k["rsf"], fees=k["hold"] + k["borrow"] + k["rsf"] + 2 * k["N0"] * k["cost"],
                win_tr=win[0] - k["paid"], win_iss=win[1], move=(trig - 1) * 100 if trig else None, N0=k["N0"])


print(f"samples/horizon={N}, both directions. Per $100 stake. win10 = trader/issuers if price moves 10 % the right way")
for name, (f, c, tvl) in COINS.items():
    d0 = np.load(f"./{f}.npy")
    mir = np.stack([1 / d0[:, 0], 1 / d0[:, 2], 1 / d0[:, 1], 1 / d0[:, 3]], 1)
    for side in ("hedge", "short"):
        for m in MULTS:
            if name.startswith("meme") and m > 10: continue
            row = []
            for v in VARIANTS:
                rs = [run(v, side, d, c, tvl, m, np.random.default_rng(7)) for d in (d0, mir)]
                if any(r is None for r in rs): row.append(f"{v}: n/a"); continue
                r = {kk: sum(x[kk] for x in rs) / 2 for kk in rs[0] if rs[0][kk] is not None}
                r["move"] = rs[0]["move"]
                mv = f"{r['move']:+.1f}%" if r["move"] is not None else "none"
                row.append(f"{v}: liq@{mv} win10 tr {r['win_tr']:+.1f} iss {r['win_iss']:.1f} | EV tr {r['tr']:+.2f} iss {r['iss']:+.2f} "
                           f"house {r['house']:.2f} rsf {r['rsf']:.2f} gap {r['gap']:.2f}% gap/pos {r['gap_pos']:+.3f} fees {r['fees']:.2f}")
            print(f"{name:12} {side:5} {m:>2}x\n   " + "\n   ".join(row), flush=True)
