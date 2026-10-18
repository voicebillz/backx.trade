// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title Issue Reserve vault
/// @notice One per coin per side. USD reserve (asset = USDC) lends dollars to Hedges; token reserve
/// (asset = the coin) lends the coin itself to Shorts. Issuers hold ERC-4626 shares; what is lent out is
/// still counted in totalAssets until it comes back. Only idle (not lent) assets can be withdrawn.
contract BackxReserveVault is ERC4626, Ownable2Step {
    using SafeERC20 for IERC20;

    /// @notice The PositionManager: the only address that can lend, repay or write off.
    address public manager;
    /// @notice Principal currently lent to open positions.
    uint256 public lent;
    /// @notice Lending stops above this utilisation so issuers can always leave with something.
    uint16 public maxUtilBps = 9_000;

    event ManagerSet(address manager);
    event MaxUtilSet(uint16 bps);
    event Lent(uint256 amount);
    event Repaid(uint256 principal, uint256 earnings);
    event Earned(uint256 amount);
    event WrittenOff(uint256 principal);

    error NotManager();
    error ManagerAlreadySet();
    error OverUtilised();
    error BadValue();

    modifier onlyManager() {
        if (msg.sender != manager) revert NotManager();
        _;
    }

    constructor(IERC20 asset_, string memory name_, string memory symbol_, address owner_)
        ERC20(name_, symbol_)
        ERC4626(asset_)
        Ownable(owner_)
    {}

    /// @notice Set once. A new manager means a new vault (issuers must be able to rely on who can lend).
    function setManager(address manager_) external onlyOwner {
        if (manager != address(0)) revert ManagerAlreadySet();
        if (manager_ == address(0)) revert BadValue();
        manager = manager_;
        emit ManagerSet(manager_);
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

    function totalAssets() public view override returns (uint256) {
        return idle() + lent;
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
        uint256 total = totalAssets();
        if (amount == 0 || amount > idle()) revert OverUtilised();
        if ((lent + amount) * 10_000 > total * maxUtilBps) revert OverUtilised();
        lent += amount;
        IERC20(asset()).safeTransfer(msg.sender, amount);
        emit Lent(amount);
    }

    /// @notice Principal back first (reduces `lent`), plus any earnings on top.
    function repay(uint256 principal, uint256 earnings) external onlyManager {
        if (principal > lent) revert BadValue();
        lent -= principal;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), principal + earnings);
        emit Repaid(principal, earnings);
    }

    /// @notice Fees and shares paid to issuers (raise the share price).
    function addEarnings(uint256 amount) external onlyManager {
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        emit Earned(amount);
    }

    /// @notice Principal that could not be recovered after a gap and after the Reserve Security Fund.
    function writeOff(uint256 principal) external onlyManager {
        if (principal > lent) revert BadValue();
        lent -= principal;
        emit WrittenOff(principal);
    }
}
