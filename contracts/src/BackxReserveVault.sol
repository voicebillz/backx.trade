// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC4626Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title Issue Reserve vault
/// @notice One per coin per side. USD reserve (asset = USDC) lends dollars to Hedges; token reserve
/// (asset = the coin) lends the coin itself to Shorts. Issuers hold ERC-4626 shares; what is lent out is
/// still counted in totalAssets until it comes back. Only idle (not lent) assets can be withdrawn.
///
/// Rewards (owner 2026-10-19): every borrow fee, gain share and liquidation share goes INTO the vault, so it is
/// split over all issuers pro rata to their shares and is withdrawn together with the principal. Nothing to
/// claim. Each issuer's part is simply their shares × the share price (`convertToAssets(balanceOf(issuer))`).
/// New rewards vest linearly over `vestPeriod` (default 24 h) so someone who deposits just before a large
/// reward and leaves right after cannot take a share that belongs to the issuers who backed the position.
/// A write-off first eats rewards that have not vested yet.
/// Upgradeable: BeaconProxy per coin from BackxMarketFactory; the Safe upgrades all reserves on a chain at once
/// through the beacon, no redeploy, shares and balances stay. Storage is APPEND-ONLY across versions.
contract BackxReserveVault is Initializable, ERC4626Upgradeable, Ownable2StepUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice The PositionManager: the only address that can lend, repay or write off.
    address public manager;
    /// @notice Principal currently lent to open positions.
    uint256 public lent;
    /// @notice Lending stops above this utilisation so issuers can always leave with something.
    uint16 public maxUtilBps;
    /// @notice Rewards not yet vested, as of `lastReward`; they count in totalAssets as they vest.
    /// Packed in one storage slot with lastReward and vestPeriod: one write per reward instead of two.
    uint176 public lockedRewards;
    uint40 public lastReward;
    uint32 public vestPeriod;

    // ---- withdrawal queue (owner 2026-10-20) --------------------------------------------------------------------
    // An issuer can ask to take out more than is idle right now. The shares are parked in the vault; the USDC owed
    // to the queue is RESERVED: it can never be lent out again, and every time money comes back (a position repays,
    // someone deposits) the queue is paid first, in order, straight to the wallet that asked. Partial fills are paid
    // as they come. Until paid, a request keeps its share of gains and losses like any other share.
    struct Request {
        address owner;
        uint128 shares;   // still waiting
    }

    mapping(uint256 => Request) public requests;
    uint64 public queueHead;          // next request to pay
    uint64 public queueTail;          // next free slot
    uint256 public queuedShares;      // all shares still waiting
    /// @notice How many requests a settlement pays on its own (bounded gas); anyone can call processQueue for more.
    uint8 public constant AUTO_PROCESS = 3;

    event ManagerSet(address manager);
    event MaxUtilSet(uint16 bps);
    event Lent(uint256 amount);
    event Repaid(uint256 principal, uint256 earnings);
    event Earned(uint256 amount);
    event WrittenOff(uint256 principal);
    event VestPeriodSet(uint32 secs);
    event WithdrawRequested(uint256 indexed id, address indexed owner, uint256 shares);
    event WithdrawPaid(uint256 indexed id, address indexed owner, uint256 assets, uint256 shares, bool complete);
    event WithdrawCancelled(uint256 indexed id, address indexed owner, uint256 shares);

    error NotManager();
    error OverUtilised();
    error BadValue();
    error NotYours();

    modifier onlyManager() {
        if (msg.sender != manager) revert NotManager();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(IERC20 asset_, string calldata name_, string calldata symbol_, address owner_, address manager_)
        external
        initializer
    {
        __ERC20_init(name_, symbol_);
        __ERC4626_init(asset_);
        __Ownable_init(owner_);
        __Ownable2Step_init();
        maxUtilBps = 9_000;
        vestPeriod = 1 days;
        manager = manager_;
        emit ManagerSet(manager_);
    }

    /// @notice The Safe can move lending to a new PositionManager (e.g. after a migration). Not locked.
    function setManager(address manager_) external onlyOwner {
        if (manager_ == address(0)) revert BadValue();
        manager = manager_;
        emit ManagerSet(manager_);
    }

    function setVestPeriod(uint32 secs) external onlyOwner {
        if (secs > 7 days) revert BadValue();
        // Keep what has vested so far; the rest vests over the new period from now.
        (lockedRewards, lastReward, vestPeriod) = (uint176(lockedNow()), uint40(block.timestamp), secs);
        emit VestPeriodSet(secs);
    }

    function setMaxUtil(uint16 bps) external onlyOwner {
        if (bps > 9_500 || bps < 1_000) revert BadValue();
        maxUtilBps = bps;
        emit MaxUtilSet(bps);
    }

    // ---- accounting ---------------------------------------------------------------------------

    function idle() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @notice Rewards still vesting (in the vault, not yet in the share price).
    function lockedNow() public view returns (uint256) {
        (uint256 locked, uint256 last, uint256 period) = (lockedRewards, lastReward, vestPeriod); // one SLOAD
        uint256 end = last + period;
        if (block.timestamp >= end || period == 0) return 0;
        return locked * (end - block.timestamp) / period;
    }

    function totalAssets() public view override returns (uint256) {
        return idle() + lent - lockedNow();
    }

    /// @notice USDC owed to the withdrawal queue at today's share price. Reserved: never lent, never withdrawn by others.
    function reservedForQueue() public view returns (uint256) {
        return queuedShares == 0 ? 0 : _convertToAssets(queuedShares, Math.Rounding.Ceil);
    }

    /// @notice Idle assets not reserved for the queue.
    function freeIdle() public view returns (uint256) {
        uint256 i = idle();
        uint256 r = reservedForQueue();
        return i > r ? i - r : 0;
    }

    /// @notice What can be lent right now: free idle assets, capped so utilisation stays under maxUtilBps.
    function availableToLend() public view returns (uint256) {
        uint256 cap = totalAssets() * maxUtilBps / 10_000;
        if (cap <= lent) return 0;
        uint256 a = cap - lent;
        uint256 f = freeIdle();
        return a < f ? a : f;
    }

    /// @dev Virtual shares/assets offset against the first-depositor inflation attack.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    /// Instant withdrawals only from FREE idle assets: nobody can jump the queue.
    function maxWithdraw(address owner_) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner_), freeIdle());
    }

    function maxRedeem(address owner_) public view override returns (uint256) {
        return Math.min(super.maxRedeem(owner_), _convertToShares(freeIdle(), Math.Rounding.Floor));
    }

    // ---- withdrawal queue -----------------------------------------------------------------------

    /// @notice Take out `shares` (all or part). Whatever is free now is paid at once; the rest is reserved and paid
    /// to msg.sender automatically as money comes back. Returns the request id (0 if it was paid in full at once).
    function requestRedeem(uint256 shares) external returns (uint256 id) {
        if (shares == 0) revert BadValue();
        _transfer(msg.sender, address(this), shares); // parked: cannot be sold or used twice
        id = queueTail++;
        requests[id] = Request(msg.sender, SafeCast.toUint128(shares));
        queuedShares += shares;
        emit WithdrawRequested(id, msg.sender, shares);
        _processQueue(AUTO_PROCESS);
    }

    /// @notice Give back the part of a request that has not been paid yet.
    function cancelRequest(uint256 id) external {
        Request memory r = requests[id];
        if (r.owner != msg.sender) revert NotYours();
        if (r.shares == 0) revert BadValue();
        requests[id].shares = 0;
        queuedShares -= r.shares;
        _transfer(address(this), msg.sender, r.shares);
        emit WithdrawCancelled(id, msg.sender, r.shares);
        _skipEmpty();
    }

    /// @notice Pay up to `maxItems` waiting requests from idle money. Anyone (the keeper) can call it.
    function processQueue(uint256 maxItems) external returns (uint256 paid) {
        return _processQueue(maxItems);
    }

    function _processQueue(uint256 maxItems) internal returns (uint256 done) {
        _skipEmpty();
        while (done < maxItems && queueHead < queueTail) {
            uint256 id = queueHead;
            Request memory r = requests[id];
            uint256 i = idle();
            if (i == 0) break;
            uint256 owed = _convertToAssets(r.shares, Math.Rounding.Floor);
            uint256 pay = owed < i ? owed : i;
            uint256 burn = pay == owed ? r.shares : _convertToShares(pay, Math.Rounding.Ceil);
            if (burn > r.shares) burn = r.shares;
            if (pay == 0) break;
            requests[id].shares = r.shares - uint128(burn);
            queuedShares -= burn;
            _burn(address(this), burn);
            IERC20(asset()).safeTransfer(r.owner, pay); // straight to the wallet that asked
            bool complete = burn == r.shares;
            emit WithdrawPaid(id, r.owner, pay, burn, complete);
            emit Withdraw(address(this), r.owner, r.owner, pay, burn);
            unchecked { ++done; }
            if (!complete) break; // out of idle money: the rest waits for the next settlement
            queueHead++;
            _skipEmpty();
        }
    }

    function _skipEmpty() internal {
        while (queueHead < queueTail && requests[queueHead].shares == 0) queueHead++;
    }

    /// New deposits are a settlement point too: they pay the queue first.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        super._deposit(caller, receiver, assets, shares);
        _processQueue(AUTO_PROCESS);
    }

    // ---- manager --------------------------------------------------------------------------------

    function lend(uint256 amount) external onlyManager {
        if (amount == 0 || amount > availableToLend()) revert OverUtilised();
        lent += amount;
        IERC20(asset()).safeTransfer(msg.sender, amount);
        emit Lent(amount);
    }

    /// @notice Principal back first (reduces `lent`), plus any earnings on top.
    function repay(uint256 principal, uint256 earnings) external onlyManager {
        if (principal > lent) revert BadValue();
        lent -= principal;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), principal + earnings);
        _lock(earnings);
        emit Repaid(principal, earnings);
        _processQueue(AUTO_PROCESS); // a settlement point: money that came back pays the queue first
    }

    /// @notice Fees and shares paid to issuers (raise the share price).
    function addEarnings(uint256 amount) external onlyManager {
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        _lock(amount);
        emit Earned(amount);
    }

    /// @notice Principal that could not be recovered after a gap and after the Reserve Security Fund.
    function writeOff(uint256 principal) external onlyManager {
        if (principal > lent) revert BadValue();
        lent -= principal;
        // Rewards that have not vested yet absorb the loss first.
        uint256 l = lockedNow();
        (lockedRewards, lastReward) = (uint176(l > principal ? l - principal : 0), uint40(block.timestamp));
        emit WrittenOff(principal);
    }

    function _lock(uint256 amount) internal {
        if (amount == 0) return;
        (lockedRewards, lastReward) = (SafeCast.toUint176(lockedNow() + amount), uint40(block.timestamp));
    }
}
