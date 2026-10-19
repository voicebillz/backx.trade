# sim5: liquidation margin for Hedge (v4 fees) under SLOW execution and price discrepancies.
# Pessimistic keeper: once the trigger is touched, the sale fills at the WORST minute low within the next
# D minutes, then a further DISC lower (oracle/pool discrepancy, extra slippage). Gap = the sale does not
# return the issuers' principal L, i.e. issuers would lose without the Reserve Security Fund.
# Margin = extra cushion on the position value N (per coin type), on top of e·E and the v3 buffer on L.
#
# Usage: python3 sim5.py [samples]   (needs the .npy files from fetch.py in the cwd)
import numpy as np, sys

X = 100.0
HZ = [60, 240, 1440, 4320]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 500
FEES = dict(hold=.02, borrow=.0025, rsf_s=.005, rsf_l=.0003)
E_ = dict(zip([2, 3, 5, 10, 20, 30], [.40, .35, .30, .20, .14, .12]))
S_ = dict(zip([2, 3, 5, 10, 20, 30], [.50, .60, .70, .85, .90, .90]))
DISC = 0.005
COINS = {"deep (BTC)": ("BTCUSDT", .0005, 10e6, [10, 20, 30]),
         "meme (DOGE)": ("DOGEUSDT", .003, 1e6, [3, 5, 10]),
         "meme (PEPE)": ("PEPEUSDT", .003, 1e6, [3, 5, 10]),
         "meme (WIF)": ("WIFUSDT", .003, 1e6, [3, 5, 10])}
MARGINS = [0.0, 0.005, 0.01, 0.015, 0.02]
DELAYS = [1, 3, 5]


def run(d, c, tvl, m, margin, delay, rng):
    e, s = E_[m], S_[m]
    buf = 0.003 + 0.0002 * max(m - 10, 0)
    L = (m - 1) * X; E = X; N0 = m * X
    cost = c + N0 / tvl
    Q = N0 * (1 - cost)
    trig = (L * (1 + buf) + e * E + margin * N0) / (Q * (1 - cost))
    if trig >= 1: return None
    cl, lo = d[:, 3], d[:, 2]; T = len(cl)
    n = liq = gap = 0; gaploss = 0.0; keep = 0.0
    for hz in HZ:
        for i0 in rng.integers(0, T - hz - delay - 2, N):
            P0 = cl[i0]; n += 1
            k = np.nonzero(lo[i0 + 1:i0 + 1 + hz] / P0 <= trig)[0]
            if not k.size: continue
            liq += 1
            j = i0 + 1 + k[0]
            fill = min(trig, lo[j:j + delay].min() / P0) * (1 - DISC)
            rem = Q * fill * (1 - cost) - L
            if rem < 0: gap += 1; gaploss += rem
            else: keep += (1 - s) * rem
    return dict(move=(trig - 1) * 100, liq=liq / n * 100, gap=gap / n * 100, gap_pos=gaploss / n,
                keep=keep / max(liq, 1))


print(f"pessimistic fill: worst low within D minutes after trigger, then −{DISC*100:.1f} %; per $100, both directions")
for name, (f, c, tvl, ms) in COINS.items():
    d0 = np.load(f"./{f}.npy")
    mir = np.stack([1 / d0[:, 0], 1 / d0[:, 2], 1 / d0[:, 1], 1 / d0[:, 3]], 1)
    for m in ms:
        for delay in DELAYS:
            row = []
            for mg in MARGINS:
                rs = [run(dd, c, tvl, m, mg, delay, np.random.default_rng(3)) for dd in (d0, mir)]
                if any(r is None for r in rs): row.append(f"{mg*100:.1f}%: n/a"); continue
                g = sum(r["gap"] for r in rs) / 2; gp = sum(r["gap_pos"] for r in rs) / 2
                row.append(f"{mg*100:.1f}%: liq {rs[0]['move']:+.1f}% gap {g:.2f}% ({gp:+.3f})")
            print(f"{name:11} {m:>2}x D={delay}m | " + " | ".join(row), flush=True)
