# sim6: fee model v5 "one pot" vs v4 (owner 2026-10-20). Everything the platform earns from a position goes into
# one pot: the open fee (2 % + 0.5 % of X, 0.25 % + 0.03 % of lent), the keeper gas, the issuers' share of a gain
# (p) and of what is left after a liquidation (s). The pot is split by fixed shares, issuers always the largest.
# The trader pays exactly the same as v4; only who gets what changes. Real 1-minute paths, both directions,
# pessimistic fill (minute close after the trigger, then −0.5 %). Per $100 stake; scaled to $30M position volume.
#
# Usage: python3 sim6.py [samples]   (needs the .npy files from fetch.py in the cwd)
import numpy as np, sys

X = 100.0
STAKE_AVG = 250.0           # average amount per position (keeper gas count)
GAS = 0.10
HZ = [5, 60, 240, 1440, 4320]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 600
DISC = 0.005
E_ = {1: .40, 2: .40, 3: .35, 5: .30, 10: .20, 20: .14}
S_ = {1: .50, 2: .50, 3: .60, 5: .70, 10: .85, 20: .90}
P = 0.10
SPLITS = {   # issuers, holders (gazz), fund, treasury, keeper (keeper never below the real gas)
    "A 45/20/15/15/5": (.45, .20, .15, .15, .05),
    "B 50/20/15/10/5": (.50, .20, .15, .10, .05),
    "C 40/25/15/15/5": (.40, .25, .15, .15, .05),
}
CASES = [("BTC (Major)", "BTCUSDT", .0005, 10e6, .015, [3, 5, 10, 20]),
         ("DOGE (Mid)", "DOGEUSDT", .003, 1e6, .03, [2, 3]),
         ("PEPE (Mid)", "PEPEUSDT", .003, 1e6, .03, [2, 3]),
         ("WIF (Small)", "WIFUSDT", .003, 1e6, .04, [2])]


def run(d, c, tvl, m, margin, rng):
    e, s = E_[m], S_[m]
    buf = 0.003 + 0.0002 * max(m - 10, 0)
    L = (m - 1) * X; E = X; N0 = m * X
    hold, rsf, borrow = .02 * X, .005 * X + .0003 * L, .0025 * L
    cost = c + N0 / tvl
    Q = N0 * (1 - cost)
    trig = (L * (1 + buf) + e * E + margin * N0) / (Q * (1 - cost)) if m > 1 else None
    cl, lo = d[:, 3], d[:, 2]; T = len(cl)
    A = dict(n=0, liq=0, share=0.0, liqshare=0.0, gap=0.0, tr=0.0)
    for hz in HZ:
        for i0 in rng.integers(0, T - hz - 2, N):
            P0 = cl[i0]; A["n"] += 1
            hit = np.nonzero(lo[i0 + 1:i0 + 1 + hz] / P0 <= trig)[0] if trig else np.array([])
            if hit.size:
                A["liq"] += 1
                fill = min(trig, cl[i0 + 1 + hit[0]] / P0) * (1 - DISC)
                rem = Q * fill * (1 - cost) - L
                if rem < 0: A["gap"] += rem; continue          # the fund pays the gap
                A["liqshare"] += s * rem; A["tr"] += (1 - s) * rem
            else:
                rem = Q * (cl[i0 + hz] / P0) * (1 - cost) - L
                cut = max(rem - E, 0) * (P if m > 1 else 0)
                A["share"] += cut; A["tr"] += rem - cut
    n = A["n"]
    return dict(hold=hold, rsf=rsf, borrow=borrow, share=A["share"] / n, liqshare=A["liqshare"] / n,
                gap=A["gap"] / n, liq=A["liq"] / n * 100, tr=A["tr"] / n - (X + hold + rsf + borrow + GAS),
                move=(trig - 1) * 100 if trig else None)


def money(v): return f"${v/1e3:,.1f}k" if abs(v) < 1e6 else f"${v/1e6:,.2f}M"


for name, f, c, tvl, margin, ms in CASES:
    d0 = np.load(f"./{f}.npy")
    mir = np.stack([1 / d0[:, 0], 1 / d0[:, 2], 1 / d0[:, 1], 1 / d0[:, 3]], 1)
    for m in ms:
        rs = [run(d, c, tvl, m, margin, np.random.default_rng(11)) for d in (d0, mir)]
        r = {k: sum(x[k] for x in rs) / 2 for k in rs[0] if k != "move"}
        units = 30e6 / (m * X)                          # $100-stake units in $30M of positions
        positions = 30e6 / (m * STAKE_AVG)
        gas = positions * GAS
        open_fee = (r["hold"] + r["rsf"] + r["borrow"]) * units
        gain_share = (r["share"] + r["liqshare"]) * units
        pot = open_fee + gain_share + gas
        gap = r["gap"] * units
        print(f"\n{name} {m}x  liquidation at {rs[0]['move']:+.1f}% · liquidated {r['liq']:.1f}% · trader EV per $100 {r['tr']:+.2f}")
        print(f"  pot on $30M: {money(pot)} = open fees {money(open_fee)} + gain/liq share {money(gain_share)} + gas {money(gas)}"
              f" · gaps the fund pays {money(-gap)}")
        v4 = dict(issuers=(r["borrow"] + r["share"] + r["liqshare"]) * units, holders=r["hold"] * units,
                  fund=r["rsf"] * units, treasury=0.0, keeper=gas)
        print("  v4 now        " + "  ".join(f"{k} {money(v)} ({v/pot*100:.0f}%)" for k, v in v4.items()))
        for sname, (i, h, fu, t, k) in SPLITS.items():
            kp = max(k * pot, gas)
            rest = pot - kp
            tot = i + h + fu + t
            out = dict(issuers=rest * i / tot, holders=rest * h / tot, fund=rest * fu / tot, treasury=rest * t / tot, keeper=kp)
            print(f"  {sname:15}" + "  ".join(f"{kk} {money(v)}" for kk, v in out.items())
                  + f"  | issuers on $10M {out['issuers']/1e7*100:.2f}% · fund net {money(out['fund'] + gap)}")
