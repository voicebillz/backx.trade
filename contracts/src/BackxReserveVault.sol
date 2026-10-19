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

    event ManagerSet(address manager);
    event MaxUtilSet(uint16 bps);
    event Lent(uint256 amount);
    event Repaid(uint256 principal, uint256 earnings);
    event Earned(uint256 amount);
    event WrittenOff(uint256 principal);
    event VestPeriodSet(uint32 secs);

    error NotManager();
    error OverUtilised();
    error BadValue();

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

    /// @notice What can be lent right now: idle assets, capped so utilisation stays under maxUtilBps.
    function availableToLend() public view returns (uint256) {
        uint256 cap = totalAssets() * maxUtilBps / 10_000;
        if (cap <= lent) return 0;
        uint256 a = cap - lent;
        uint256 i = idle();
        return a < i ? a : i;
    }

    /// @dev Virtual shares/assets offset against the first-depositor inflation attack.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    function maxWithdraw(address owner_) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner_), idle());
    }

    function maxRedeem(address owner_) public view override returns (uint256) {
        return Math.min(super.maxRedeem(owner_), _convertToShares(idle(), Math.Rounding.Floor));
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
