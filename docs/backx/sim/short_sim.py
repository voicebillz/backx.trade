# Short sim: same price paths, fees and parameter table as sim2.py (Hedge), mirrored.
# Every short: shorter stakes X in USD; the issuer's TOKEN vault lends q tokens worth
# N0 = m*E; they are sold on the pool (fee c + impact = N0/TVL). The position holds USD:
# E + sale proceeds. Closing buys the q tokens back (fee + impact) and returns them to the
# issuer FIRST. Liquidation is checked on the NET buy-back cost:
#   E + N0*(1-cost) - N0*x*(1+cost)*(1+buf) <= e*E
# Up-spikes are the risk: a gap past the trigger means the USD in the position cannot buy
# all q tokens back, and the issuer is short of tokens (the safety fund covers that).
# Both price directions (path and its mirror 1/P), like sim2.py.
# Usage: python3 short_sim.py [samples]   (needs the .npy files from fetch.py)
import numpy as np, json, sys
X = 100.0; HOLD = 0.02; BORROW = 0.002; SAFE = 0.005
HZ = [5, 60, 240, 1440, 4320]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 1500
MULTS = [1, 2, 3, 5, 7, 10, 15, 20, 25]
E_ = dict(zip(MULTS, [.40, .40, .35, .30, .25, .20, .15, .12, .10]))
S_ = dict(zip(MULTS, [.50, .50, .60, .70, .80, .85, .90, .90, .90]))
P_ = dict(zip(MULTS, [.15, .15, .20, .25, .30, .30, .30, .30, .30]))
BUFS = [0.003, 0.01]  # sim2's 0.3 % and a wider 1 % for spiky up-moves
COINS = {
    "BTC-type (deep 0.05%, $10M)": ("BTCUSDT", .0005, 10e6),
    "DOGE (meme 0.3%, $1M)": ("DOGEUSDT", .003, 1e6),
    "PEPE (meme 0.3%, $1M)": ("PEPEUSDT", .003, 1e6),
    "WIF (meme 0.3%, $1M)": ("WIFUSDT", .003, 1e6),
    "GAZZ (real pool 0.3%, $56k)": ("GAZZ", .003, 56e3),
}
res = {}
for buf in BUFS:
    print(f"\n=== liquidation buffer {buf*100:.1f}% ===")
    for name, (f, c, tvl) in COINS.items():
        d0 = np.load(f"./{f}.npy")
        mir = np.stack([1 / d0[:, 0], 1 / d0[:, 2], 1 / d0[:, 1], 1 / d0[:, 3]], 1)
        for m in MULTS:
            e, s, p = E_[m], S_[m], P_[m]
            fee_x = HOLD * X + SAFE * X
            E = X - fee_x
            N0 = m * E
            fee0 = fee_x + BORROW * N0          # borrow fee on the value lent, paid to issuers
            E -= BORROW * N0
            imp = N0 / tvl; cost = c + imp
            C = E + N0 * (1 - cost)             # USD locked in the position after the sale
            xL = (C - e * E) / (N0 * (1 + cost) * (1 + buf))   # liquidation price ratio (>1)
            if xL <= 1:
                print(f"{name:30} {m:>3}x NOT POSSIBLE (born liquidated, cost {cost*100:.2f}%/way)")
                res[(buf, name, m)] = None
                continue
            A = dict.fromkeys("n liq gap win iss hed hedliq isslq issw hedw issgap capdays".split(), 0.0)
            rng = np.random.default_rng(7)
            for d in (d0, mir):
                cl, hi = d[:, 3], d[:, 1]; T = len(cl)
                for hz in HZ:
                    for i0 in rng.integers(0, T - hz - 2, N):
                        P0 = cl[i0]; highs = hi[i0 + 1:i0 + 1 + hz] / P0
                        k = np.nonzero(highs >= xL)[0]
                        A["n"] += 1; iss = BORROW * N0
                        if k.size:
                            k = k[0]; A["liq"] += 1; A["capdays"] += N0 * (k + 1) / 1440
                            fill = max(xL, cl[i0 + 1 + k] / P0)   # slow keeper: buys back at that minute's close
                            rem = C - N0 * fill * (1 + cost)
                            if rem < 0:
                                A["gap"] += 1; iss += rem; A["issgap"] += rem; hk = 0.0
                            else:
                                iss += s * rem; hk = (1 - s) * rem
                            hed = hk - X; A["hedliq"] += hk; A["isslq"] += iss
                        else:
                            A["capdays"] += N0 * hz / 1440
                            fill = cl[i0 + hz] / P0
                            back = C - N0 * fill * (1 + cost); prof = back - X
                            if prof > 0:
                                A["win"] += 1; iss += p * prof; A["issw"] += p * prof
                                hed = prof * (1 - p); A["hedw"] += prof * (1 - p)
                            else:
                                hed = prof
                        A["iss"] += iss; A["hed"] += hed
            n = A["n"]; nl = max(A["liq"], 1)
            r = dict(liqUp=(xL - 1) * 100, cost=cost * 100, liq_rate=A["liq"] / n * 100, gap_rate=A["gap"] / n * 100,
                     gap_loss_avg=A["issgap"] / max(A["gap"], 1), short_keep_liq=A["hedliq"] / nl,
                     win_rate=A["win"] / n * 100, iss_pos=A["iss"] / n, iss_pos_pct=A["iss"] / n / N0 * 100,
                     safe_vs_gap=(SAFE * X * n + A["issgap"]) / n, short_ev=A["hed"] / n)
            res[(buf, name, m)] = r
            print(f"{name:30} {m:>3}x likv +{r['liqUp']:6.2f}% liqRate {r['liq_rate']:5.1f}% gap {r['gap_rate']:5.2f}% "
                  f"(snitt {r['gap_loss_avg']:7.1f}) | short beholder {r['short_keep_liq']:5.1f} | vinn {r['win_rate']:5.1f}% | "
                  f"iss/pos {r['iss_pos']:+6.2f} ({r['iss_pos_pct']:+.2f}% av lån) | fond-netto {r['safe_vs_gap']:+.2f} | shortEV {r['short_ev']:+6.1f}",
                  flush=True)
json.dump({f"{k[0]}|{k[1]}|{k[2]}": v for k, v in res.items()}, open("./res_short.json", "w"), indent=1)
