// Chains on the front page (owner 2026-10-22): the same real logos as the intro video, rolling on a loop.
// No pause on hover, no dragging: one CSS animation over a doubled list. Reduced motion: a still, wrapped row.
const CHAINS: [string, string][] = [
  ['robinhood', 'Robinhood'], ['bnb', 'BNB Chain'], ['base', 'Base'], ['ethereum', 'Ethereum'], ['arbitrum', 'Arbitrum'],
  ['polygon', 'Polygon'], ['solana', 'Solana'], ['optimism', 'Optimism'], ['avalanche', 'Avalanche'], ['unichain', 'Unichain'],
  ['zksync', 'ZKsync'], ['linea', 'Linea'], ['celo', 'Celo'], ['zora', 'Zora'], ['world-chain', 'World Chain'],
  ['ink', 'Ink'], ['soneium', 'Soneium'], ['monad', 'Monad'], ['megaeth', 'MegaETH'], ['arc', 'Arc'], ['xlayer', 'X Layer'],
];
const SVG = new Set(['base', 'optimism']);
const src = (k: string) => `/chains/${k}.${SVG.has(k) ? 'svg' : 'png'}`;

export function ChainCarousel() {
  const row = (hidden: boolean) => (
    <ul className="carousel-row" aria-hidden={hidden || undefined}>
      {CHAINS.map(([k, name]) => (
        <li key={k}><img src={src(k)} alt="" width="72" height="72" loading="lazy" /><span>{name}</span></li>
      ))}
    </ul>
  );
  return (
    <div className="carousel" role="region" aria-label={`Chains: ${CHAINS.map((c) => c[1]).join(', ')}`}>
      <div className="carousel-track">{row(false)}{row(true)}</div>
    </div>
  );
}
