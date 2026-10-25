// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title $GAZZ holder rewards: one per chain, receives the holders' share from BackxTreasury (owner 2026-10-25).
/// @notice Our validator (the operator) pays $GAZZ holders once a week, pro rata to a snapshot it takes off-chain:
///   1. `startRound(token)`: at most once per `minGap` (default 7 days). Fixes this round's budget = the balance.
///   2. `pay(token, to[], amounts[])`: as many calls as it needs; never more than the round's budget, never the same
///      address twice in one round. What is not paid stays for next week.
/// The Safe owns it: sets the operator, can pause payouts, can take money back out (e.g. to a new rewards contract).
/// A compromised operator key can at most misdirect one week's budget; the Safe then swaps the operator.
/// Not upgradeable. CREATE2 with constructor (Safe), so it has the same address on every chain.
contract BackxHolderRewards is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint32 public constant MIN_GAP_FLOOR = 1 days;

    address public operator;
    bool public paused;
    uint32 public minGap = 7 days;

    struct Round {
        uint64 id;
        uint64 startedAt;
        uint128 left;           // budget not paid yet in this round
    }
    mapping(IERC20 => Round) public rounds;
    mapping(IERC20 => mapping(uint64 => mapping(address => bool))) public paid;

    event OperatorSet(address indexed operator);
    event Paused(bool paused);
    event MinGapSet(uint32 gap);
    event RoundStarted(IERC20 indexed token, uint64 indexed id, uint256 budget);
    event Paid(IERC20 indexed token, uint64 indexed id, address indexed to, uint256 amount);
    event Skipped(IERC20 indexed token, uint64 indexed id, address indexed to, uint256 amount);
    event Recovered(IERC20 indexed token, address indexed to, uint256 amount);

    error NotOperator();
    error IsPaused();
    error TooSoon();
    error OverBudget();
    error AlreadyPaid();
    error BadParams();

    constructor(address safe) Ownable(safe) {}

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        if (paused) revert IsPaused();
        _;
    }

    function setOperator(address op) external onlyOwner {
        operator = op;
        emit OperatorSet(op);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    function setMinGap(uint32 gap) external onlyOwner {
        if (gap < MIN_GAP_FLOOR) revert BadParams();
        minGap = gap;
        emit MinGapSet(gap);
    }

    /// @notice The Safe moves money out (a new contract, or back to the Treasury). Ends the current round's budget.
    function recover(IERC20 token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert BadParams();
        Round storage r = rounds[token];
        r.left = amount >= r.left ? 0 : r.left - uint128(amount);
        token.safeTransfer(to, amount);
        emit Recovered(token, to, amount);
    }

    /// @notice Opens a new weekly round; what the last round did not pay rolls into this one.
    function startRound(IERC20 token) external onlyOperator returns (uint64 id, uint256 budget) {
        Round storage r = rounds[token];
        if (r.startedAt != 0 && block.timestamp < uint256(r.startedAt) + minGap) revert TooSoon();
        budget = token.balanceOf(address(this));
        if (budget > type(uint128).max) revert BadParams();
        id = r.id + 1;
        (r.id, r.startedAt, r.left) = (id, uint64(block.timestamp), uint128(budget));
        emit RoundStarted(token, id, budget);
    }

    /// @notice Pays holders from the current round. Each address at most once per round.
    function pay(IERC20 token, address[] calldata to, uint256[] calldata amounts) external onlyOperator nonReentrant {
        if (to.length != amounts.length) revert BadParams();
        Round storage r = rounds[token];
        uint64 id = r.id;
        uint256 left = r.left;
        for (uint256 i; i < to.length; i++) {
            if (to[i] == address(0)) revert BadParams();
            if (paid[token][id][to[i]]) revert AlreadyPaid();
            if (amounts[i] > left) revert OverBudget();
            // A holder the token refuses (e.g. blacklisted) is skipped, never blocks the others; the money stays.
            (bool ok, bytes memory ret) = address(token).call(abi.encodeCall(IERC20.transfer, (to[i], amounts[i])));
            if (!ok || (ret.length != 0 && !abi.decode(ret, (bool))) || address(token).code.length == 0) {
                emit Skipped(token, id, to[i], amounts[i]);
                continue;
            }
            paid[token][id][to[i]] = true;
            left -= amounts[i];
            emit Paid(token, id, to[i], amounts[i]);
        }
        r.left = uint128(left);
    }
}
