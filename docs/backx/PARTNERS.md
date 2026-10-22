# Partner plan (2026-10-22)

Goal: land partners that make BackX deeper (liquidity, routing, prices) and more visible, by bringing them something
they measure: volume, TVL, new users. Rule for every pitch: lead with what they get, ask for one concrete thing,
never call it a partnership in public until they agree. Nothing below is agreed yet unless marked.

## Tier 1: DEX and hook partners (the DEX pool product depends on them)

| Partner | Why them | What they get from BackX | What we ask | Status / next step |
|---|---|---|---|---|
| **PancakeSwap** (Infinity hooks, BNB Chain + Robinhood Chain) | BNB Chain is our launch focus; Infinity supports hooks; existing contacts in Telegram and one past RT | Every hedge open/close/liquidation routed through their pools (≈ 2× position volume), DEX pools that count as their TVL, first-time DEX users from social login | Hook guidance + review, co-marketing / RT at launch | Telegram message sent (2026-10-21). Next: build the Infinity hook spec, share it with them before writing code |
| **Uniswap** (v4 hooks, Uniswap Foundation) | Main DEX on Robinhood Chain from day one; clear hook allowlist process; Foundation funds hook builders | Same as above on v4; a hook that stays routable (no swap deltas, not upgradeable) | Hook allowlist, Foundation grant / hook program, listing in their ecosystem pages | Not contacted. Next: apply to the Foundation's builder/hook programme with the hook spec; submit the allowlist form once deployed and verified |
| **Aggregators** (1inch, Odos, KyberSwap, 0x, OpenOcean, LI.FI) | Routing decides whether our pools get flow | New hooked pools with real liquidity; we already use LI.FI for swaps and bridging | Index our hooked pools on Robinhood Chain / BNB Chain | LI.FI: existing integration. Others: contact after first pools are live. Check the Brevis hooks routing rebate programme when it reaches our chains |
| **Aerodrome** (Base) | Largest DEX on Base; no hooks, but gauges/incentives | Volume from BackX hedges on Base | Gauge / bribe support for BackX-listed pairs | Later (Base is not the launch focus) |

## Tier 2: chains and ecosystems

| Partner | What they get | What we ask | Next step |
|---|---|---|---|
| **BNB Chain** | A new hedge/issue product and DEX pools on BNB, users onboarded without wallets | Builder grants / accelerator (MVB-style), ecosystem RT, gas credits | Check the current BNB Chain builder programmes; apply with deck + demo |
| **Robinhood Chain** | One of the first trading products native to the chain, stock listings | Ecosystem listing, intro to Paxos / stablecoin decision, co-marketing | Ask for their ecosystem/grants contact; decide the reserve stablecoin (USDG?) |
| **Paxos (USDG)** | Reserve currency demand: every issued dollar on Robinhood Chain | Integration support, possibly liquidity incentives | Only after the stablecoin decision |
| **Tokenized stocks** (BStocks and other issuers) | A venue to hedge and issue against their stock tokens | Listing support, price feeds, legal guidance per market | Verify the issuer and market hours / feeds before promising stock listings |

## Tier 3: infrastructure and trust

| Partner | Why | Ask |
|---|---|---|
| **Oracles** (Chainlink, Pyth, RedStone) | A fast second price check next to the TWAP (LIQUIDATION.md §3) | Feed coverage for listed coins on our chains; their builder/partner programmes |
| **Auditors** (e.g. OpenZeppelin, Spearbit/Cantina, Sherlock or Code4rena contest) | Required before mainnet (CLAUDE.md) | Quote for the four core contracts + the DEX hook |
| **Safe** | Owns every contract; deploys via Transaction Builder | Robinhood Chain support in the Safe app (no chain prefix yet in our config) |
| **Privy** | Login and embedded wallets | Case study / co-marketing once live |
| **DexScreener, GeckoTerminal, DefiLlama** | Visibility of pools and TVL | DexScreener DEX label + token info, GeckoTerminal token info, DefiLlama adapter (we open the PR) |

## Order of work

1. **Now (before launch):** PancakeSwap follow-up (hook spec), Uniswap Foundation application, oracle choice, audit quotes.
2. **Hook built + audited:** Uniswap allowlist form, PancakeSwap hook review, verify on explorers, DefiLlama adapter.
3. **Launch:** co-marketing with PancakeSwap / Uniswap / BNB Chain / Robinhood Chain; aggregators onboarding.
4. **After launch:** Aerodrome on Base, more stock issuers, liquidity incentive programmes.

## What we can show partners (have ready)

- Short deck: problem → BackX → what the partner gets (volume, TVL, users) → status → ask.
- Live demo: Issue page demo mode (Hedge Pool + Liquidity Pool), terminal, admin listing rules.
- Numbers as examples only (e.g. $30M in positions ≈ $60M swap volume), never promises.
