# backx contracts

Hedge & Short positions backed by Issue Reserves. **Not audited, not deployed.**

| Contract | Role |
|---|---|
| `BackxReserveVault` | ERC-4626 Issue Reserve per coin per side: USD reserve (backs Hedges) or token reserve (backs Shorts). Only idle assets can be withdrawn. |
| `BackxReserveSecurityFund` | One per side. Gets a small cut of every position, pays out only to cover gaps. |
| `BackxPositionManager` | Opens, closes and liquidates Hedges and Shorts; fees, waterfall, caps, oracle guards. |
| `interfaces/ISwapAdapter` | Routing engine (PCS Infinity + Uniswap v4 behind it) — to be written per pool. |
| `interfaces/IPriceOracle` | TWAP — to be written per pool. |

```
forge build
forge test                 # 20 tests incl. 30× hedge/short, gaps, oracle guard, fuzz
forge test --fuzz-runs 3000
```

Design, numbers and open decisions: `docs/backx/FEES-AND-MARGINS.md`, `SHORT-SPEC.md`, `HEDGE-ISSUER-SPEC.md`.
