// Number formatting. Display may round normally; amounts that get SENT must use floorTo().

export function usd(n: number, digits = 2): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Compact list format: $12.4K, $3.1M. Full value belongs in a title/tooltip. */
export function usdCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return usd(n);
}

/** Price with precision that fits the magnitude (memecoins have many decimals). */
export function price(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.01) return n.toFixed(5);
  return n.toPrecision(4);
}

export function pct(n: number, digits = 2): string {
  return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(digits) + '%';
}

export const arrow = (n: number) => (n >= 0 ? '▲' : '▼');

/** Round DOWN to a number of decimals. Use for anything that becomes a sent amount. */
export function floorTo(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.floor(n * f) / f;
}
