// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

/// @title Reserve Security Fund: for crises only.
/// @notice Receives a small part of every position (USDC) on its side (Hedge or Short, one fund each per coin) and
/// pays out only to cover a gap: a liquidation that could not repay its issuers because the price jumped past the
/// trigger before the swap. Guardrails (owner 2026-10-25):
///   - only its own position manager can draw, and the manager only does so inside a liquidation the oracle has
///     confirmed and that cannot repay the issuers (anyone can run that liquidation, nobody can call cover);
///   - the manager asks for at most maxCoverBps of that position's lent value;
///   - one payment is at most perCoverBps of the fund (default 25 %);
///   - all payments in 24 h are at most dailyBps of what the fund held when the window opened (default 50 %).
/// There is no owner withdrawal: money leaves only to cover gaps (ÅPEN: surplus policy, see SHORT-SPEC §8).
/// Upgradeable: BeaconProxy per coin from BackxMarketFactory. Storage is APPEND-ONLY across versions.
contract BackxReserveSecurityFund is Initializable, Ownable2StepUpgradeable {
    using SafeERC20 for IERC20;

    IERC20 public usd;
    address public manager;
    uint256 public totalCovered;
    uint16 public perCoverBps;
    uint16 public dailyBps;
    uint40 public windowStart;
    uint256 public windowBase;      // balance when the 24 h window opened
    uint256 public windowPaid;

    event ManagerSet(address manager);
    event LimitsSet(uint16 perCoverBps, uint16 dailyBps);
    event Covered(uint256 requested, uint256 paid);

    error NotManager();
    error BadValue();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(IERC20 usd_, address owner_, address manager_) external initializer {
        __Ownable_init(owner_);
        __Ownable2Step_init();
        usd = usd_;
        manager = manager_;
        perCoverBps = 2_500;
        dailyBps = 5_000;
        emit ManagerSet(manager_);
    }

    function setManager(address manager_) external onlyOwner {
        if (manager_ == address(0)) revert BadValue();
        manager = manager_;
        emit ManagerSet(manager_);
    }

    /// @notice The Safe can tune the guardrails, never switch them off (each between 5 % and 100 %).
    function setLimits(uint16 perCover, uint16 daily) external onlyOwner {
        if (perCover < 500 || perCover > 10_000 || daily < 500 || daily > 10_000) revert BadValue();
        (perCoverBps, dailyBps) = (perCover, daily);
        emit LimitsSet(perCover, daily);
    }

    function balance() public view returns (uint256) {
        return usd.balanceOf(address(this));
    }

    /// @notice What one cover could pay right now under the guardrails.
    function available() public view returns (uint256) {
        uint256 bal = balance();
        (uint256 base, uint256 paid) = _windowOver() ? (bal, 0) : (windowBase, windowPaid);
        uint256 daily = base * dailyBps / 10_000;
        uint256 left = daily > paid ? daily - paid : 0;
        uint256 one = bal * perCoverBps / 10_000;
        return left < one ? left : one;
    }

    /// No window yet (first cover ever) or the last one is 24 h old.
    function _windowOver() internal view returns (bool) {
        return windowStart == 0 || block.timestamp >= uint256(windowStart) + 1 days;
    }

    /// @notice Pays up to `amount` to the manager within the guardrails; returns what was paid.
    function cover(uint256 amount) external returns (uint256 paid) {
        if (msg.sender != manager) revert NotManager();
        if (_windowOver()) {
            (windowStart, windowBase, windowPaid) = (uint40(block.timestamp), balance(), 0);
        }
        uint256 cap = available();
        paid = amount < cap ? amount : cap;
        windowPaid += paid;
        totalCovered += paid;
        if (paid > 0) usd.safeTransfer(msg.sender, paid);
        emit Covered(amount, paid);
    }
}
