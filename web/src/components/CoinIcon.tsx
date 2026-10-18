import { TOKEN_LOGO } from '../lib/assets';

/** Real logo when we have one (market image URL or bundled token logo), else a coloured monogram. */
export function CoinIcon({ symbol, src, size = 20 }: { symbol: string; src?: string; size?: number }) {
  const url = src ?? TOKEN_LOGO[symbol];
  if (url) return <img className="coin-icon" src={url} alt="" width={size} height={size} loading="lazy" decoding="async" />;
  return (
    <span className="coin-icon mono" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {symbol.slice(0, 2)}
    </span>
  );
}
