import { parseAbi } from 'viem';

// The parts of BackxHedgeManager / BackxShortManager a validator uses (contracts/src/BackxManagerBase.sol).
// Both sides share the same events and batch functions, so one ABI serves both.
export const managerAbi = parseAbi([
  'event Opened(uint256 indexed id, address indexed owner, uint8 m, uint256 stake, uint256 lent, uint256 amount, uint256 limitValue)',
  'event Closed(uint256 indexed id, address indexed by, uint8 kind, uint256 toTrader, uint256 toIssuers, uint256 covered, uint256 writtenOff)',
  'event LimitSet(uint256 indexed id, uint256 limitValue)',
  'event StopSet(uint256 indexed id, uint256 stopValue)',
  'event OrderPlaced(uint256 indexed orderId, address indexed owner, uint8 m, uint256 amount, uint256 trigger, bool above, uint256 expiry)',
  'event OrderFilled(uint256 indexed orderId, uint256 indexed positionId, address indexed by)',
  'event OrderCancelled(uint256 indexed orderId)',
  'function isLiquidatable(uint256 id) view returns (bool)',
  'function isLimitReached(uint256 id) view returns (bool)',
  'function isOrderFillable(uint256 orderId) view returns (bool)',
  'function liquidateBatch(uint256[] ids) returns (uint256 done)',
  'function executeLimitBatch(uint256[] ids) returns (uint256 done)',
  'function fillOrderBatch(uint256[] orderIds) returns (uint256 done)',
  'function claimable(address) view returns (uint256)',
  'function claimTo(address to) returns (uint256)',
]);

// Staking payout (contracts/src/BackxTreasury.sol → BackxStaking.sol): distribute() is public.
export const treasuryAbi = parseAbi([
  'function holderRewards() view returns (address)',
  'function distribute(address token) returns (uint256)',
  'function pending(address token) view returns (uint256)',
]);
export const stakingAbi = parseAbi(['function sync() returns (uint256)']);
