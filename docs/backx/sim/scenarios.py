"""$100 scenarios for Hedge, Short and issuers (v3 numbers = web/src/lib/hedge.ts = contracts).

Deterministic: one price move, no path. Liquidation is assumed to happen exactly at the trigger
(normal keeper). The gap row shows a jump past the trigger before the keeper acts.

    python3 scenarios.py            # markdown tables to stdout
"""

FEES = dict(holders=0.02, borrow=0.002, rsf_stake=0.005, rsf_lent=0.0003)
E = [0, 4000, 4000, 3500, 3250, 3000, 2750, 2500, 2375, 2250, 2000, 1920, 1840, 1760, 1680, 1600, 1560,
     1520, 1480, 1440, 1400, 1380, 1360, 1340, 1320, 1300, 1280, 1260, 1240, 1220, 1200]
S = [0, 5000, 5000, 6000, 6500, 7000, 7500, 8000, 8167, 8333, 8500] + [8600, 8700, 8800, 8900] + [9000] * 16
P = [0, 1500, 1500, 2000, 2250, 2500, 2750] + [3000] * 24
POOLS = {"Dyp pool (BTC/ETH-type, 0,05 %, $10M)": (0.0005, 10_000_000, [1, 2, 3, 5, 10, 20, 30]),
         "Meme-pool (0,3 %, $1M)": (0.003, 1_000_000, [1, 2, 3, 5, 10])}
MOVES = [-0.20, -0.10, -0.05, 0.0, 0.05, 0.10, 0.20]


def buf(side, m):
    return (0.003 if side == "hedge" else 0.006) + 0.0002 * max(m - 10, 0)


def prm(m):
    return E[m] / 1e4, S[m] / 1e4, P[m] / 1e4


def hedge(X, m, fee, depth):
    """Returns setup + settle(x) -> (trader_payout, issuer_earn, liquidated, fund_paid)."""
    holders = X * FEES["holders"]
    if m == 1:
        eq = X - holders - X * FEES["rsf_stake"]
        c = fee + eq / depth
        coins = eq * (1 - c)
        rsf = X * FEES["rsf_stake"]

        def settle(x):
            return coins * x * (1 - c), 0.0, False, 0.0
        return dict(eq=eq, loan=0, N=eq, rsf=rsf, borrow=0, liq=None), settle
    e, s, p = prm(m)
    L = (m - 1) * X
    borrow = L * FEES["borrow"]
    rsf = X * FEES["rsf_stake"] + L * FEES["rsf_lent"]
    eq = X - holders - rsf - borrow
    N = eq + L
    c = fee + N / depth
    coins = N * (1 - c)  # USD value at entry price of the coins held
    xl = (L * (1 + buf("hedge", m)) + e * eq) / (coins * (1 - c))

    def settle(x, gap=False):
        if x <= xl:
            exit_ = coins * (x if gap else xl) * (1 - c)
            rest = exit_ - L
            if rest < 0:  # gap: fund pays issuers the hole
                return 0.0, borrow, True, -rest
            return rest * (1 - s), borrow + rest * s, True, 0.0
        rest = coins * x * (1 - c) - L
        gain = rest - X
        cut = max(gain, 0) * p
        return rest - cut, borrow + cut, False, 0.0
    return dict(eq=eq, loan=L, N=N, rsf=rsf, borrow=borrow, liq=xl - 1), settle


def short(X, m, fee, depth):
    e, s, p = prm(m)
    holders = X * FEES["holders"]
    e0 = X - holders - X * FEES["rsf_stake"]
    N = m * e0
    borrow = N * FEES["borrow"]
    rsf = X * FEES["rsf_stake"] + N * FEES["rsf_lent"]
    eq = X - holders - rsf - borrow
    c = fee + N / depth
    C = eq + N * (1 - c)
    xl = (C - e * eq) / (N * (1 + c) * (1 + buf("short", m)))

    def settle(x, gap=False):
        if x >= xl:
            rest = C - N * (x if gap else xl) * (1 + c)
            if rest < 0:
                return 0.0, borrow, True, -rest
            return rest * (1 - s), borrow + rest * s, True, 0.0
        rest = C - N * x * (1 + c)
        gain = rest - X
        cut = max(gain, 0) * p
        return rest - cut, borrow + cut, False, 0.0
    return dict(eq=eq, loan=N, N=N, rsf=rsf, borrow=borrow, liq=xl - 1, C=C, cost=c), settle


def money(v):
    sign = "+" if v > 0.005 else ("−" if v < -0.005 else "±")
    return f"{sign}${abs(v):,.2f}"


def table(kind, fee, depth, ms, X=100.0):
    fn = hedge if kind == "hedge" else short
    head = "| m | Likv. ved | " + " | ".join(f"{'▲' if mv > 0 else '▼' if mv < 0 else '■'} {mv*100:+.0f} %" for mv in MOVES) + " |"
    out = [head, "|" + "---|" * (len(MOVES) + 2)]
    iss = [head.replace("Likv. ved", "Lånegebyr"), out[1]]
    for m in ms:
        info, settle = fn(X, m, fee, depth)
        liq = "aldri" if info["liq"] is None else f"{info['liq']*100:+.2f} %"
        cells, icells = [], []
        for mv in MOVES:
            got, earn, liqd, _ = settle(1 + mv)
            cells.append(money(got - X) + (" (L)" if liqd else ""))
            icells.append(money(earn))
        out.append(f"| {m}× | {liq} | " + " | ".join(cells) + " |")
        iss.append(f"| {m}× | {money(info['borrow'])} | " + " | ".join(icells) + " |")
    return out, iss


def main():
    for name, (fee, depth, ms) in POOLS.items():
        print(f"\n## {name}\n")
        for kind, label in (("hedge", "Hedge (tjener når prisen stiger)"), ("short", "Short (tjener når prisen faller)")):
            t, i = table(kind, fee, depth, ms)
            print(f"### {label}: traderens gevinst/tap på $100\n")
            print("\n".join(t))
            print(f"\n### Issuers' inntekt fra den samme {kind}-posisjonen\n")
            print("\n".join(i))
            print()
    # Short walkthrough
    X, m, fee, depth, P0 = 100.0, 5, 0.003, 1_000_000, 0.50
    info, settle = short(X, m, fee, depth)
    q = info["N"] / P0
    print(f"\n## Short-pengeflyt: $100, 5×, PONS ${P0}\n")
    print(f"E={info['eq']:.2f} N={info['N']:.2f} q={q:,.1f} PONS cost={info['cost']*100:.3f}% "
          f"C={info['C']:.2f} liq={info['liq']*100:+.2f}% borrow={info['borrow']:.2f} rsf={info['rsf']:.2f}")
    for mv in (-0.10, 0.10, None):
        x = (1 + info["liq"]) if mv is None else 1 + mv
        buy = info["N"] * x * (1 + info["cost"])
        got, earn, liqd, _ = settle(x)
        print(f"x={x:.4f} buyback={buy:.2f} trader={got:.2f} issuer_usd={earn:.2f} liq={liqd}")
    for kind, fn in (("hedge", hedge), ("short", short)):
        for m, mv in ((30, 0.10), (10, 0.10)):
            info, settle = fn(X, m, 0.0005, 10_000_000)
            x = 1 - mv if kind == "hedge" else 1 + mv
            got, earn, liqd, fund = settle(x, gap=True)
            print(f"GAP {kind} {m}x deep {mv*100:.0f}%: trader={got:.2f} issuers={earn:.2f} fund_pays={fund:.2f} rsf_in={info['rsf']:.2f}")


if __name__ == "__main__":
    main()
