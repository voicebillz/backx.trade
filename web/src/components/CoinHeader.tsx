import type { Market } from '../lib/markets';
import { pct, price, usdCompact } from '../lib/format';
import { CoinIcon } from './CoinIcon';

interface Props { market: Market; live: number; dir: 'up' | 'down' | null; tick: number }

export function CoinHeader({ market, live, dir, tick }: Props) {
  return (
    <div className="coin-header">
      <div className="coin-id">
        <CoinIcon symbol={market.symbol} src={market.image} size={28} />
        <span className="coin-sym">{market.symbol}</span>
        <span className="coin-name">{market.name}</span>
        <span className={'chip kind-' + market.kind.toLowerCase()}>{market.kind}</span>
      </div>
      <div className="coin-price">
        {/* key restarts the flash animation on every tick without shifting layout */}
        <span key={tick} className={'num big flash' + (dir ? ' flash-' + dir : '')} aria-live="off">{price(live)}</span>
      </div>
      <dl className="coin-stats">
        <div><dt className="label">24h</dt><dd className={'num pill ' + (market.change24h >= 0 ? 'up' : 'down')}>{pct(market.change24h)}</dd></div>
        <div><dt className="label">24h volume</dt><dd className="num stat-info" title={'$' + market.volume24h.toLocaleString('en-US')}>{usdCompact(market.volume24h)}</dd></div>
        <div><dt className="label">Market cap</dt><dd className="num stat-violet" title={'$' + market.marketCap.toLocaleString('en-US')}>{usdCompact(market.marketCap)}</dd></div>
        <div><dt className="label">Pool fee</dt><dd className="num">{(market.poolFee * 100).toFixed(2)}%</dd></div>
        <div><dt className="label">Max leverage</dt><dd className="num stat-brand">{market.maxM}×</dd></div>
      </dl>
    </div>
  );
}
