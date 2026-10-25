// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title backx platform Treasury: one per chain, the fee collector of every market on it (owner 2026-10-25).
/// @notice Every platform fee lands here in USDC. A share (holderBps) belongs to $GAZZ holders: anyone can call
/// `distribute(token)` to split everything that arrived since the last split and send the holders' share to
/// holderRewards. The rest is the platform's and only the Safe can withdraw it, to an address it chooses. While
/// holderRewards is not set, the holders' share is kept aside (holdersOwed) and paid on the first split after it is.
/// Not upgradeable: it only holds money, there is nothing to evolve.
/// Deployed with CREATE2 and constructor args (Safe, bps), so it has the same address on every chain.
contract BackxTreasury is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;
    /// The holders can get at most half; the other half always pays for upkeep.
    uint16 public constant MAX_HOLDER_BPS = 5_000;

    address public holderRewards;
    uint16 public holderBps;
    /// Per token: the part already split that belongs to the platform.
    mapping(IERC20 => uint256) public kept;
    /// Per token: the holders' share not paid out yet (no holderRewards address, or not distributed yet).
    mapping(IERC20 => uint256) public holdersOwed;

    event HoldersSet(address indexed to, uint16 bps);
    event Distributed(IERC20 indexed token, uint256 toHolders, uint256 toTreasury);
    event Withdrawn(IERC20 indexed token, address indexed to, uint256 amount);

    error BadParams();
    error TooMuch();

    constructor(address safe, uint16 bps) Ownable(safe) {
        if (bps > MAX_HOLDER_BPS) revert BadParams();
        holderBps = bps;
    }

    /// @notice Where the holders' share goes and how big it is. Call distribute first to split pending money under the old share.
    function setHolders(address to, uint16 bps) external onlyOwner {
        if (bps > MAX_HOLDER_BPS) revert BadParams();
        (holderRewards, holderBps) = (to, bps);
        emit HoldersSet(to, bps);
    }

    /// @notice Not split yet: arrived since the last distribute.
    function pending(IERC20 token) public view returns (uint256) {
        return token.balanceOf(address(this)) - kept[token] - holdersOwed[token];
    }

    /// @notice Splits everything that arrived since the last call: holderBps to holderRewards, the rest to the platform.
    function distribute(IERC20 token) external nonReentrant returns (uint256 toHolders) {
        return _distribute(token);
    }

    /// @notice The Safe takes the platform's part (never the holders'): pending money is split first.
    function withdraw(IERC20 token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert BadParams();
        _distribute(token);
        if (amount > kept[token]) revert TooMuch();
        kept[token] -= amount;
        token.safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    function _distribute(IERC20 token) internal returns (uint256 toHolders) {
        uint256 fresh = pending(token);
        uint256 share = fresh * holderBps / BPS;
        kept[token] += fresh - share;
        toHolders = holdersOwed[token] + share;
        if (holderRewards == address(0)) {
            holdersOwed[token] = toHolders;
            toHolders = 0;
        } else {
            holdersOwed[token] = 0;
            if (toHolders > 0) token.safeTransfer(holderRewards, toHolders);
        }
        if (fresh > 0 || toHolders > 0) emit Distributed(token, toHolders, fresh - share);
    }
}
