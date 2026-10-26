// The on-chain call list for AI agents (docs/backx/AGENTS.md, contracts/src). One source for the Whitepaper sheet and
// its CSV download: change it together with the contracts.

export type CallGroup = 'Find' | 'Issue' | 'Trade' | 'Orders' | 'Validate';

export interface AgentCall { group: CallGroup; step: string; contract: string; call: string; returns: string }

export const AGENT_CALLS: AgentCall[] = [
  { group: 'Find', step: 'Find a coin\'s contracts', contract: 'Factory', call: 'setOf(token)', returns: 'hedge, usdVault, hedgeFund, short, tokenVault, shortFund' },
  { group: 'Find', step: 'Price now', contract: 'Hedge / Short', call: 'price()', returns: 'USD per 1 coin (base units)' },
  { group: 'Issue', step: 'Approve USDC', contract: 'USDC', call: 'approve(usdVault, amount)', returns: '—' },
  { group: 'Issue', step: 'Issue USDC (backs Buys)', contract: 'usdVault', call: 'deposit(amount, me)', returns: 'shares' },
  { group: 'Issue', step: 'Approve the coin', contract: 'Coin', call: 'approve(tokenVault, coins)', returns: '—' },
  { group: 'Issue', step: 'Issue the coin (backs Sells)', contract: 'tokenVault', call: 'deposit(coins, me)', returns: 'shares · same coins back' },
  { group: 'Issue', step: 'Rewards waiting', contract: 'Vault', call: 'pendingRewards(me)', returns: 'USDC' },
  { group: 'Issue', step: 'Claim rewards', contract: 'Vault', call: 'claimRewards() · claimRewardsTo(to)', returns: 'USDC sent' },
  { group: 'Issue', step: 'Claim all pools at once', contract: 'Multicall3', call: 'aggregate3([vault.claimRewardsFor(me), …, staking.claimFor(me)])', returns: 'USDC sent, one signature' },
  { group: 'Issue', step: 'Withdraw what is free', contract: 'Vault', call: 'maxWithdraw(me) → withdraw(amount, me, me)', returns: 'assets' },
  { group: 'Issue', step: 'Withdraw the rest', contract: 'Vault', call: 'requestRedeem(shares)', returns: 'request id · paid as positions close' },
  { group: 'Issue', step: 'Undo a request', contract: 'Vault', call: 'cancelRequest(id)', returns: 'unpaid shares back' },
  { group: 'Trade', step: 'Max multiplication now', contract: 'Hedge / Short', call: 'maxMFor(amount)', returns: 'm (0 = no coins issued)' },
  { group: 'Trade', step: 'Approve USDC', contract: 'USDC', call: 'approve(manager, amount)', returns: '—' },
  { group: 'Trade', step: 'Buy now', contract: 'Hedge', call: 'open(amount, m, minCoinsOut, takeProfit)', returns: 'position id' },
  { group: 'Trade', step: 'Sell (short) now', contract: 'Short', call: 'open(amount, m, minUsdOut, takeProfit)', returns: 'position id · roof set' },
  { group: 'Trade', step: 'Read a position', contract: 'Hedge / Short', call: 'positions(id) · threshold(id)', returns: 'size, margin, limit · liquidation value' },
  { group: 'Trade', step: 'Move take-profit', contract: 'Hedge / Short', call: 'setLimit(id, price)', returns: 'short: 0 = back to the roof' },
  { group: 'Trade', step: 'Set stop-loss', contract: 'Hedge / Short', call: 'setStop(id, price)', returns: '0 = none' },
  { group: 'Trade', step: 'Close', contract: 'Hedge / Short', call: 'close(id, limit)', returns: 'USDC to you · gas back' },
  { group: 'Orders', step: 'Place a buy / sell order', contract: 'Hedge / Short', call: 'placeOrder(m, amount, trigger, above, expiry, takeProfit, slipBps)', returns: 'order id · USDC escrowed' },
  { group: 'Orders', step: 'Read an order', contract: 'Hedge / Short', call: 'orders(orderId) · isOrderFillable(orderId)', returns: 'order · fillable now?' },
  { group: 'Orders', step: 'Cancel', contract: 'Hedge / Short', call: 'cancelOrder(orderId)', returns: 'USDC back' },
  { group: 'Validate', step: 'Watch', contract: 'Hedge / Short', call: 'events Opened · LimitSet · OrderPlaced · Closed', returns: 'ids to check' },
  { group: 'Validate', step: 'Is it due?', contract: 'Hedge / Short', call: 'isLiquidatable(id) · isLimitReached(id) · isOrderFillable(id)', returns: 'true / false' },
  { group: 'Validate', step: 'Settle many', contract: 'Hedge / Short', call: 'liquidateBatch(ids) · executeLimitBatch(ids) · fillOrderBatch(ids)', returns: 'how many settled' },
  { group: 'Validate', step: 'Settle one', contract: 'Hedge / Short', call: 'liquidate(id) · executeLimit(id) · fillOrder(orderId)', returns: 'reverts with the reason' },
  { group: 'Validate', step: 'Earned', contract: 'Hedge / Short', call: 'claimable(me)', returns: 'USDC (gas + accuracy bonus)' },
  { group: 'Validate', step: 'Claim', contract: 'Hedge / Short', call: 'claim() · claimTo(to)', returns: 'USDC sent' },
];

export const CALL_GROUPS: CallGroup[] = ['Find', 'Issue', 'Trade', 'Orders', 'Validate'];

/** CSV for spreadsheets (RFC 4180 quoting). */
export function agentCallsCsv(): string {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const head = ['#', 'Group', 'Step', 'Contract', 'Call', 'Returns'].map(q).join(',');
  return [head, ...AGENT_CALLS.map((c, i) => [String(i + 1), c.group, c.step, c.contract, c.call, c.returns].map(q).join(','))].join('\r\n') + '\r\n';
}
