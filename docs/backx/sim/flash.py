# flash.py: synthetic flash crashes at 250 ms resolution (Robinhood Chain block time) and how fast each way of
# executing a liquidation sells, compared with manual or intent-based swaps. Issuer outcome per tier.
#
# Model (assumptions, not measurements):
# - CEX price leads; the DEX pool follows ~2 s behind (arbitrage). Every on-chain sale fills at the DEX price,
#   minus the position's own pool cost and 0.5 % crash slippage (many positions selling at once).
# - Latencies are typical figures for each path, from detection to the sale landing on-chain.
# - Liquidation trigger = contract _hedgeThreshold (principal·(1+buf) + e·E + margin·N), same math as web/src/lib/hedge.ts.
#
# Usage: python3 flash.py            (no data files needed)
import math, random

DT = 0.25
CRASH_SLIP = 0.005
E_ = {2: .40, 3: .35, 5: .30, 10: .20, 20: .14}
TIERS = [("Major 20×", 20, .015, .0005, 10e6), ("Large 5×", 5, .02, .0005, 5e6),
         ("Mid 3×", 3, .03, .003, 2e6), ("Small 2×", 2, .04, .003, 1e6)]
SCEN = [("−30 % in 10 s (wick)", .30, 10), ("−30 % in 60 s", .30, 60), ("−45 % in 2 min", .45, 120), ("−60 % in 5 min", .60, 300)]
LAG = 2.0  # DEX behind CEX, seconds

# name, how it detects, seconds from detection to the sale landing on-chain
EXEC = [
    ("BackX now (60 s TWAP confirm + 2 % TWAP guard)", "twap", 0.5),
    ("BackX fast oracle (Pyth/Data Streams)", "spot", 0.5),
    ("BackX pre-emptive (CEX signal)", "cex", 0.5),
    ("Relay / intent swap (bot)", "spot", 3.0),
    ("Bot on Ethereum L1 (12 s blocks)", "spot", 9.0),
    ("Manual: MetaMask + Uniswap app", "spot", 20.0),
]


def path(depth, dur, seed):
    rnd = random.Random(seed)
    n = int((dur + 900) / DT)
    out, p = [], 1.0
    for i in range(n):
        t = i * DT
        if t <= dur:
            x = t / dur
            base = 1 - depth * (x * x * (3 - 2 * x))       # smoothstep fall
        else:
            r = min((t - dur) / 600, 1)                       # rebounds 60 % of the drop over 10 min
            base = 1 - depth + depth * 0.6 * (1 - math.exp(-3 * r))
        p = base * (1 + rnd.gauss(0, 0.0004))
        out.append(p)
    return out


def at(series, t):
    i = max(0, min(len(series) - 1, int(round(t / DT))))
    return series[i]


def run(depth, dur, m, margin, c0, tvl, seed):
    X = 100.0
    L, E, N = (m - 1) * X, X, m * X
    c = c0 + N / tvl
    Q = N * (1 - c)
    buf = 0.003 + 0.0002 * max(m - 10, 0)
    trig = (L * (1 + buf) + E_[m] * E + margin * N) / (Q * (1 - c))
    be = L / (Q * (1 - c))                                    # sale exactly returns the principal
    cex = path(depth, dur, seed)
    dex = lambda t: at(cex, t - LAG)                          # pool follows CEX ~2 s later
    T = len(cex) * DT
    res = {}
    for name, mode, lat in EXEC:
        t, twin = 0.0, int(60 / DT)
        hist = []
        det = None
        while t < T:
            spot = dex(t)
            hist.append(spot)
            if mode == "cex":
                ok = at(cex, t) <= trig
            elif mode == "spot":
                ok = spot <= trig
            else:
                tw = sum(hist[-twin:]) / len(hist[-twin:])
                ok = spot <= trig and tw <= trig * 1.0025
            if ok:
                det = t
                break
            t += DT
        if det is None:
            res[name] = None
            continue
        tx = det + lat
        if mode == "twap":
            # Contract guard _liqMinOut: the sale may fill at most 2 % below the 60 s TWAP, else it reverts.
            # In a fast crash the TWAP lags, so the keeper retries every block until the TWAP has caught up.
            def twap(t):
                k = int(t / DT); lo = max(0, k - twin)
                vals = [dex(j * DT) for j in range(lo, k + 1)]
                return sum(vals) / len(vals)
            while tx < T and dex(tx) * (1 - CRASH_SLIP) < twap(tx) * (1 - 0.02):
                tx += DT
        fill = dex(tx) * (1 - CRASH_SLIP)
        got = Q * fill * (1 - c)
        loss = max(0.0, L - got) / L
        # seconds after the moment the DEX price first touched the trigger
        touch = next(i * DT for i in range(len(cex)) if dex(i * DT) <= trig)
        res[name] = dict(after=tx - touch, drop=1 - fill, loss=loss)
    return trig, be, res


print("Synthetic flash crashes, 250 ms steps. Loss = share of the issuers' lent principal not returned by the sale.")
print("Latencies are modelled assumptions (see header), not measured.\n")
for sname, depth, dur in SCEN:
    print(f"## {sname}")
    for tname, m, margin, c0, tvl in TIERS:
        rows = {}
        for seed in range(20):
            trig, be, r = run(depth, dur, m, margin, c0, tvl, seed)
            for k, v in r.items():
                if v: rows.setdefault(k, []).append(v)
        print(f"  {tname}: liquidation at −{(1-trig)*100:.1f} %, issuers lose only below −{(1-be)*100:.1f} %")
        for name, _, _ in EXEC:
            vs = rows.get(name)
            if not vs:
                print(f"    {name:42} never triggered"); continue
            a = sum(v['after'] for v in vs) / len(vs); d = sum(v['drop'] for v in vs) / len(vs); l = sum(v['loss'] for v in vs) / len(vs)
            print(f"    {name:42} sells {a:+6.1f} s after trigger at −{d*100:5.1f} %  issuer loss {l*100:5.2f} % of lent")
    print()
