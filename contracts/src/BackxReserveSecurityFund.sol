// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title Reserve Security Fund
/// @notice Receives a small part of every position (USD) and pays it out only to cover a gap: a position
/// that could not repay its issuers in full because the price jumped past liquidation before the swap.
/// One fund per side (Hedge, Short), so short-side gaps never eat the hedge-side cover.
/// There is no owner withdrawal: funds leave only to cover gaps (ÅPEN: surplus policy, see SHORT-SPEC §8).
contract BackxReserveSecurityFund is Ownable2Step {
    using SafeERC20 for IERC20;

    IERC20 public immutable usd;
    address public manager;
    uint256 public totalCovered;

    event ManagerSet(address manager);
    event Covered(uint256 requested, uint256 paid);

    error NotManager();
    error ManagerAlreadySet();

    constructor(IERC20 usd_, address owner_) Ownable(owner_) {
        usd = usd_;
    }

    function setManager(address manager_) external onlyOwner {
        if (manager != address(0)) revert ManagerAlreadySet();
        manager = manager_;
        emit ManagerSet(manager_);
    }

    function balance() public view returns (uint256) {
        return usd.balanceOf(address(this));
    }

    /// @notice Pays up to `amount` to the manager; returns what was paid.
    function cover(uint256 amount) external returns (uint256 paid) {
        if (msg.sender != manager) revert NotManager();
        uint256 bal = balance();
        paid = amount < bal ? amount : bal;
        totalCovered += paid;
        if (paid > 0) usd.safeTransfer(msg.sender, paid);
        emit Covered(amount, paid);
    }
}
