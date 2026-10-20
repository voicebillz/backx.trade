import express from 'express';

// Demo market universe until Robinhood Chain markets are listed: top coins by market cap from
// CoinGecko, cached in Redis. Max multiplication follows the spec's depth tiers (docs/backx §6).
const PAGES = 2;              // 2 × 250 = 500 coins
const PAGE_SIZE = 100;        // what the client gets per scroll page
const CACHE_SEC = 90;
// From sim/sim5.py (docs/backx/FEES-AND-MARGINS.md §2b): with a slow keeper (worst price within 5 minutes)
// and a 0.5 % price discrepancy, these caps + execution margins repay the issuers in every simulated case.
const HEDGE_CAP = { Major: 20, Large: 5, Mid: 3, Small: 2 };
/** Liquidate this share of the position value earlier (contract: Market.liqMarginBps). */
// Raised after the security review (owner 2026-10-20): issuers must not lose. Room for the price to fall PAST
// the liquidation point before any issuer money is at risk: Major 20× 2.7 %, Large 5× 8.2 %, Mid 3× 14.9 %, Small 2× 24 %.
const LIQ_MARGIN = { Major: 0.015, Large: 0.02, Mid: 0.03, Small: 0.04 };
// Short is off in the product for now (owner 2026-10-19): 0 everywhere. Earlier caps: Major 30, Large 10, Mid 5.
const SHORT_CAP = { Major: 0, Large: 0, Mid: 0, Small: 0 };

// shortMaxM: shorts lose on up-spikes, which gap harder than drops (docs/backx/SHORT-SPEC.md).
function tier(mcap) {
  if (mcap >= 10e9) return { maxM: HEDGE_CAP.Major, liqMargin: LIQ_MARGIN.Major, shortMaxM: SHORT_CAP.Major, poolFee: 0.0005, kind: 'Major' };
  if (mcap >= 1e9) return { maxM: HEDGE_CAP.Large, liqMargin: LIQ_MARGIN.Large, shortMaxM: SHORT_CAP.Large, poolFee: 0.003, kind: 'Large' };
  if (mcap >= 100e6) return { maxM: HEDGE_CAP.Mid, liqMargin: LIQ_MARGIN.Mid, shortMaxM: SHORT_CAP.Mid, poolFee: 0.003, kind: 'Mid' };
  return { maxM: HEDGE_CAP.Small, liqMargin: LIQ_MARGIN.Small, shortMaxM: SHORT_CAP.Small, poolFee: 0.003, kind: 'Small' };
}

export async function universe(redis) {
  const cached = await redis.get('markets:v6');
  if (cached) return JSON.parse(cached);
  const all = [];
  for (let page = 1; page <= PAGES; page++) {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&price_change_percentage=24h`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!r.ok) { if (all.length) break; throw new Error(`markets ${r.status}`); }
    all.push(...(await r.json()));
  }
  const seen = new Set();
  const list = all
    .filter((c) => c.current_price > 0 && typeof c.price_change_percentage_24h === 'number' && !seen.has(c.symbol) && seen.add(c.symbol))
    .filter((c) => /^https:\/\/(coin-images|assets)\.coingecko\.com\//.test(c.image || ''))
    .map((c) => {
      const t = tier(c.market_cap || 0);
      return {
        id: c.id,
        symbol: String(c.symbol).toUpperCase().slice(0, 12),
        name: String(c.name).slice(0, 48),
        image: c.image,
        price: c.current_price,
        change24h: c.price_change_percentage_24h,
        volume24h: c.total_volume || 0,
        marketCap: c.market_cap || 0,
        // Demo liquidity: a slice of daily volume, capped. Real pools replace this.
        depth: Math.min((c.total_volume || 0) * 0.02, 50e6),
        ...t,
      };
    })
    .sort((a, b) => b.change24h - a.change24h);
  await redis.set('markets:v6', JSON.stringify(list), 'EX', CACHE_SEC);
  return list;
}

export const marketsRouter = express.Router();

// Session required: the terminal is admin-only before launch, and nothing under /api is anonymous.
marketsRouter.use((req, res, next) => (req.user ? next() : res.status(401).json({ error: 'unauthorized' })));

/** Moving markets: sorted by 24h change, highest first. ?page=0,1,2… (100 per page). */
marketsRouter.get('/', async (req, res) => {
  const page = Math.min(Math.max(parseInt(String(req.query.page ?? '0'), 10) || 0, 0), 50);
  try {
    const list = await universe(req.app.locals.redis);
    const items = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    res.json({ items, page, total: list.length, hasMore: (page + 1) * PAGE_SIZE < list.length });
  } catch {
    res.status(503).json({ error: 'unavailable' });
  }
});

/** Search by symbol or name. Empty q = suggestions (top movers + majors). */
marketsRouter.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 32);
  try {
    const list = await universe(req.app.locals.redis);
    if (!q) {
      const majors = ['BTC', 'ETH', 'SOL', 'BNB', 'DOGE'].map((s) => list.find((m) => m.symbol === s)).filter(Boolean);
      return res.json({ items: [...list.slice(0, 5), ...majors.filter((m) => !list.slice(0, 5).includes(m))], suggested: true });
    }
    const starts = list.filter((m) => m.symbol.toLowerCase().startsWith(q));
    const contains = list.filter((m) => !starts.includes(m) && (m.symbol.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)));
    res.json({ items: [...starts, ...contains].slice(0, 12), suggested: false });
  } catch {
    res.status(503).json({ error: 'unavailable' });
  }
});
