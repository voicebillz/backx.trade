// Investor list for the seed round (owner 2026-10-28; research checked 2026-10-28, mostly aggregators such as
// Seedtable, Caplight, PitchBook, CB Insights, DefiLlama, plus press for fund closes). Goal: ONE firm leads the
// seed and follows into Series A. "check" = public estimate; re-verify every row before outreach.

export type Tier = 'lead' | 'strategic' | 'co' | 'program' | 'dropped';
export interface Investor { name: string; url: string; type: string; stage: string; leads: string; recent: string; fit: string; tier: Tier; note?: string }

export const INVESTORS: Investor[] = [
  // Lead candidates, in order
  { name: 'Variant', url: 'https://variant.fund', type: 'Crypto VC', stage: 'Pre-seed/seed, $0.5–5M', leads: 'Leads / sometimes A', recent: 'Co-led Cascade, 24/7 perps neo-broker, $15M seed (Dec 2025); Infinia A lead (Jul 2026)', fit: 'Closest thesis: a retail perps product, user-owned protocols', tier: 'lead' },
  { name: 'Dragonfly', url: 'https://dragonfly.xyz', type: 'Crypto VC', stage: 'Seed–growth', leads: 'Sometimes / follows to A', recent: 'Fund IV $650M (Feb 2026); Ethena, Polymarket', fit: 'Fresh fund for DeFi and on-chain finance; can lead seed and A', tier: 'lead' },
  { name: 'Haun Ventures', url: 'https://haun.co', type: 'Crypto VC', stage: 'Seed–B', leads: 'Sometimes / follows to A', recent: '$1B across two funds (May 2026); Liquid seed (Apr 2026)', fit: 'Explicit AI-agent + trading infrastructure thesis', tier: 'lead' },
  { name: 'Archetype', url: 'https://archetype.fund', type: 'Crypto VC', stage: 'Seed, $0.5–3M', leads: 'Leads / sometimes A', recent: 'Fund III $100M+ (Sep 2025); Privy, Cascade, Relay', fit: 'Backed Privy (our login): natural warm intro; crypto-AI thesis', tier: 'lead' },
  { name: 'Lightspeed Faction', url: 'https://faction.vc', type: 'Crypto VC (with Lightspeed)', stage: 'Seed–A', leads: 'Leads / follows to A', recent: 'Led Glacis $6.8M seed (Jul 2026), Meld $7M (Jan 2026)', fit: 'Leads seeds now; Lightspeed balance sheet for the A', tier: 'lead' },
  { name: 'Blockchain Capital', url: 'https://blockchaincapital.com', type: 'Crypto VC', stage: 'Seed–growth', leads: 'Leads / follows to A', recent: 'Led Paxos Labs $12M (Apr 2026); raising $700M (Apr 2026)', fit: 'Reliable lead with a growth fund (alternate)', tier: 'lead' },
  { name: 'Polychain', url: 'https://polychain.capital', type: 'Crypto VC', stage: 'Seed–growth', leads: 'Leads / follows to A', recent: 'Co-led Cascade perps seed (Dec 2025)', fit: 'Proven retail perps bet (alternate, large)', tier: 'lead' },
  // Strategic / ecosystem
  { name: 'Coinbase Ventures', url: 'https://www.coinbase.com/ventures', type: 'Corporate venture arm', stage: 'Pre-seed–A', leads: 'Co-leads / follows to A', recent: '30 deals in H1 2026; Cascade, Sapiom (AI-agent finance)', fit: 'Base launch chain, agents, strongest signal: anchor co-investor', tier: 'strategic', note: 'Founder pick. Most active crypto VC, rarely leads alone' },
  { name: 'Base Ecosystem Fund / Base Batches', url: 'https://docs.base.org/get-started/base-ecosystem-fund', type: 'Ecosystem fund (Coinbase Ventures)', stage: 'Pre-seed/seed; Batches $100k', leads: 'No', recent: 'Avantis (perps on Base), Aerodrome, Morpho', fit: 'Base is a launch chain; Batches has trading and agents tracks', tier: 'strategic' },
  { name: 'YZi Labs + BNB Chain MVB', url: 'https://www.yzilabs.com', type: 'Corporate / ecosystem', stage: 'Seed (up to $500k) to growth', leads: 'Sometimes / follows', recent: '$1B BNB Builder Fund (Oct 2025); MVB now rolling', fit: 'BNB Chain is a launch chain; DeFi and AI focus', tier: 'strategic' },
  { name: 'Circle Ventures', url: 'https://www.circle.com/ventures', type: 'Corporate venture arm', stage: 'Early', leads: 'Rarely', recent: 'edgeX (perp DEX), Catena Labs (AI-agent finance) A (May 2026)', fit: 'USDC is our reserve asset; backed perps and agents', tier: 'strategic' },
  { name: 'Kraken Ventures', url: 'https://krakenventures.com', type: 'Corporate-affiliated VC', stage: 'Early, $0.5–2M', leads: 'Sometimes', recent: 'Apyx seed (Feb 2026)', fit: 'Exchange and trading angle', tier: 'strategic' },
  { name: 'OKX Ventures', url: 'https://www.okx.com/ventures', type: 'Corporate venture arm', stage: 'Seed–later', leads: 'Rarely', recent: 'CAEX (Apr 2026)', fit: 'Exchange distribution, AI × crypto', tier: 'strategic' },
  { name: 'Jump Crypto / Jump Capital', url: 'https://jumpcrypto.com', type: 'Trading-firm venture arm', stage: 'Seed–A', leads: 'Sometimes', recent: 'Jump Capital $350M fund VII (Jul 2026)', fit: 'Low-latency trading, Pyth heritage (our oracle)', tier: 'strategic' },
  { name: 'Wintermute Ventures', url: 'https://www.wintermute.com', type: 'Trading-firm venture arm', stage: 'Seed–B', leads: 'Rarely', recent: 'Morpho (Jun 2026)', fit: 'Market making and liquidity partner', tier: 'strategic' },
  { name: 'GSR', url: 'https://www.gsr.io', type: 'Trading-firm venture arm', stage: 'Seed–strategic', leads: 'Rarely', recent: '31 deals in 12 months (Jul 2026)', fit: 'Liquidity and market making', tier: 'strategic' },
  { name: 'Uniswap Labs Ventures', url: 'https://uniswap.org', type: 'Protocol venture arm', stage: 'Seed', leads: 'Rarely', recent: 'Paxos Labs (Apr 2026)', fit: 'Liquidations route through DEX pools; hook partner', tier: 'strategic' },
  { name: 'Robinhood Ventures Fund II', url: 'https://robinhood.com/newsroom/rvii-yc-s26/', type: 'Corporate fund', stage: 'Seed, $100–600k', leads: 'No', recent: '46 YC S26 companies (Oct 2026)', fit: 'Only Robinhood money route, in practice YC companies only', tier: 'strategic', note: 'Robinhood has no crypto venture arm' },
  // Co-investors
  ...([
    ['Framework Ventures', 'https://framework.ventures', 'Seed–A', 'Fund IV $400M (Jun 2026); Aave, Synthetix, Chainlink history', 'DeFi native, still deploying'],
    ['Castle Island Ventures', 'https://castleisland.vc', 'Seed–A', 'Led Project Eleven $20M A (Jan 2026)', 'Fintech-minded leads'],
    ['Robot Ventures', 'https://robvc.com', 'Pre-seed/seed, $0.1–1M', 'Paxos Labs (Apr 2026)', 'Compound + Gauntlet founders: liquidation-design review'],
    ['1kx', 'https://1kx.capital', 'Seed–A', 'Superstate B (Jan 2026)', 'Token design research'],
    ['Placeholder', 'https://placeholder.vc', 'Seed–A', 'Squads (Apr 2026)', 'Protocol thesis'],
    ['Electric Capital', 'https://electriccapital.com', 'Seed–A', 'Unverified 2026 activity', 'Developer ecosystem data'],
    ['Lemniscap', 'https://lemniscap.com', 'Pre-seed/seed', 'Led Hypernova $3M (May 2026)', 'Small seed leads'],
    ['Bankless Ventures', 'https://bankless.ventures', 'Seed', 'Megapot, Cordant (2026)', 'AI agents + DeFi, media reach'],
    ['Maven 11', 'https://maven11.com', 'Seed–A', 'Utexo $7.5M seed (Mar 2026)', 'EU DeFi investor'],
    ['Breed VC', 'https://breed.vc', 'Pre-seed/seed, $250–750k', 'Fund II $15M (Sep 2026)', 'Small check beside a lead'],
    ['Symbolic Capital', 'https://symbolic.capital', 'Seed', 'GenFlux seed (Feb 2026, partly unverified)', 'EVM network'],
    ['Fabric Ventures', 'https://fabric.vc', 'Seed, $50k–2M', 'Kulipa (Apr 2026)', 'Machine-economy / agents thesis'],
    ['Nascent', 'https://nascent.xyz', 'Pre-seed–A', 'Project Eleven (Jan 2026)', 'DeFi native'],
    ['Ethereal Ventures', 'https://ethereal.vc', 'Pre-seed/seed', 'Led Bundle $5.5M (Jul 2026)', 'Hands-on technical seed fund'],
    ['Lattice Fund', 'https://lattice.fund', 'Seed', 'Project Eleven (Jan 2026)', 'Seed syndicate'],
    ['Hack VC', 'https://hack.vc', 'Seed–A, $3–10M', 'Opinion Labs $20M (Feb 2026)', 'Markets + AI-crypto thesis'],
    ['Pantera', 'https://panteracapital.com', 'Seed–growth', 'Fund V first close (Jan 2026)', 'Big name that follows on'],
    ['Galaxy Ventures', 'https://www.galaxy.com', 'Seed–A', 'Led Tenbin Labs $7.1M seed (Jan 2026)', 'Trading-firm parent, liquidity'],
    ['Delphi Ventures', 'https://delphiventures.io', 'Seed, $0.25–5M', 'Tori Finance seed (Mar 2026)', 'DeFi derivatives + research reach'],
    ['Hashed', 'https://hashed.com', 'Seed–A', 'Led Chance AI seed (May 2026)', 'Asian retail distribution'],
    ['Spartan Group', 'https://spartangroup.io', 'Seed–strategic', 'Led Saturn Credit $2M (May 2026)', 'DeFi + Asian liquidity'],
    ['Arrington Capital', 'https://arringtoncapital.com', 'Seed–A', 'Canopy $8.5M seed (Jun 2026)', 'Capital-markets thesis'],
    ['Fenbushi Capital', 'https://fenbushi.vc', 'Seed–A', 'Huddle01 A (Feb 2026)', 'Asian syndicate'],
    ['HashKey Capital', 'https://hashkey.capital', 'Seed–A', 'CAEX (Apr 2026)', 'Hong Kong exchange network'],
    ['Mirana Ventures', 'https://mirana.xyz', 'Seed–A', 'StableCoinX (Jun 2026)', 'Exchange-linked trading flow'],
    ['Foresight Ventures', 'https://foresightventures.com', 'Seed–strategic', 'Led PopDEX perp DEX $30M (May 2026)', 'Just led a perp-DEX seed'],
    ['Paradigm', 'https://paradigm.xyz', 'Seed–growth', 'Led Liquid perps aggregator seed (2025); $1.2B fund (Jul 2026)', 'Top DeFi name, drifting to AI/robotics'],
    ['a16z crypto', 'https://a16zcrypto.com', 'Seed–growth', '18 deals in H1 2026', 'AI agents as economic actors thesis'],
    ['Multicoin', 'https://multicoin.capital', 'Seed–B', 'LI.FI (Dec 2025; we use LI.FI)', 'Better at Series A'],
  ] as const).map(([name, url, stage, recent, fit]): Investor => ({ name, url, type: 'Crypto VC', stage, leads: 'Co-invests', recent, fit, tier: 'co' })),
  // Programmes and non-equity
  { name: 'Arbitrum Security Program', url: 'https://forum.arbitrum.foundation/t/arbitrum-security-program/31207', type: 'Grant (non-dilutive)', stage: 'Audit subsidy', leads: '—', recent: 'Launched about Sep 2026, ~$1.76M pool', fit: 'Pays toward the audit; covers Orbit chains like Robinhood Chain', tier: 'program', note: 'Check whether audited code must stay Arbitrum-exclusive' },
  { name: 'Arbitrum Mentorship + Robinhood Chain Founder House', url: 'https://blog.arbitrum.foundation/builders-block-021-robinhood-chain-mainnet-live-on-arbitrum-founder-house-london-winners/', type: 'Programme (non-dilutive)', stage: 'Mentorship, prizes', leads: '—', recent: 'Robinhood $1M in builder prizes; Singapore Founder House upcoming', fit: 'Robinhood Chain intros without giving equity', tier: 'program' },
  { name: 'Base Builder Grants', url: 'https://docs.base.org/get-started/get-funded', type: 'Grant (non-dilutive)', stage: '1–5 ETH, retroactive', leads: '—', recent: 'Rolling', fit: 'For what we ship on Base', tier: 'program' },
  { name: 'Alliance DAO', url: 'https://alliance.xyz', type: 'Accelerator (equity)', stage: 'Pre-seed, $250–500k', leads: 'Yes', recent: 'ALL18 cohort (Sep 2026)', fit: 'Best crypto accelerator before a seed', tier: 'program' },
  { name: 'Stifel Venture Banking', url: 'https://bankwithstifel.com/venturebanking.aspx', type: 'Bank', stage: 'Venture debt, deposits', leads: 'No equity', recent: 'No crypto clients found', fit: 'Banking and venture debt after the equity round; investor intros', tier: 'program', note: 'Founder pick. Cannot lead an equity round' },
  // Dropped
  { name: 'Seven Seven Six (776)', url: 'https://776.org', type: 'Generalist VC', stage: 'Seed–A', leads: 'Usually leads', recent: 'No crypto deal found 2025–26; crypto fund reportedly paused', fit: 'Only through a warm intro; verify first', tier: 'dropped', note: 'Founder pick. Crypto activity unverified' },
  { name: 'Tiger Global', url: 'https://www.tigerglobal.com', type: 'Crossover fund', stage: 'Growth', leads: '—', recent: 'No crypto deals 2025–26; heavy 2023 crypto write-downs', fit: 'Not a seed lead', tier: 'dropped', note: 'Founder pick' },
  { name: 'Shima Capital', url: '', type: 'Crypto VC', stage: '—', leads: '—', recent: 'Ceased operations Dec 2025 (SEC suit)', fit: '—', tier: 'dropped' },
  { name: 'Amber Group, Mechanism, Volt, Paxos', url: '', type: '—', stage: '—', leads: '—', recent: 'No venture deals found 2026 / no venture arm', fit: 'Only through a warm intro', tier: 'dropped' },
];

export const TIER_TITLE: Record<Tier, string> = {
  lead: 'Seed lead candidates', strategic: 'Strategic and ecosystem', co: 'Co-investors', program: 'Grants, accelerators and banking', dropped: 'Dropped or deprioritised',
};
