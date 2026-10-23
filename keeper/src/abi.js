import { parseAbi } from 'viem';

// The parts of BackxPositionManager a keeper uses (contracts/src/BackxPositionManager.sol).
export const managerAbi = parseAbi([
  'event Opened(uint256 indexed id, address indexed owner, address indexed token, bool isShort, uint8 m, uint256 stake, uint256 lent, uint256 amount)',
  'event Closed(uint256 indexed id, bool liquidated, uint256 toTrader, uint256 toIssuers, uint256 covered, uint256 writtenOff)',
  'event LimitSet(uint256 indexed id, uint256 limitValue)',
  'function isLiquidatable(uint256 id) view returns (bool)',
  'function isLimitReached(uint256 id) view returns (bool)',
  'function liquidateBatch(uint256[] ids) returns (uint256 done)',
  'function executeLimitBatch(uint256[] ids) returns (uint256 done)',
]);
