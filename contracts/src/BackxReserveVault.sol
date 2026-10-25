// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC4626Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title Issue Reserve vault
/// @notice One per coin per side. Hedge reserve: asset = USDC, lent to Hedges. Short reserve: asset = the coin itself
/// (PONS, BTC …), lent to Shorts and always returned as the same number of coins. Issuers hold ERC-4626 shares; what
/// is lent out still counts in totalAssets until it comes back. Only free idle assets can be withdrawn at once.
///
/// Rewards (owner 2026-10-25): every borrow fee and share of a gain or liquidation is paid in USDC and sits in this
/// vault to be CLAIMED (claimRewards), by people and AI agents alike, on-chain or on the website. The share price
/// tracks principal only. Rewards are split pro rata over the shares and stream in over `vestPeriod` (24 h), so
/// someone who deposits just before a large reward and leaves right after gets only the part they were there for.
/// Shares parked in the withdrawal queue stop earning rewards. A write-off on the USDC reserve first takes
/// rewards that have not streamed out yet.
/// Upgradeable: BeaconProxy per coin from BackxMarketFactory. Storage is APPEND-ONLY across versions.
contract BackxReserveVault is Initializable, ERC4626Upgradeable, Ownable2StepUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    uint256 internal constant ACC = 1e36;

    /// @notice The position manager: the only address that can lend, repay, write off or add rewards.
    address public manager;
    /// @notice Principal currently lent to open positions.
    uint256 public lent;
    /// @notice Lending stops above this utilisation so issuers can always leave with something.
    uint16 public maxUtilBps;
    uint32 public vestPeriod;

    // ---- rewards (USDC, claimable) --------------------------------------------------------------------------------
    IERC20 public rewardToken;
    uint256 public rewardRate;          // reward units per second × 1e18
    uint40 public rewardEnd;
    uint40 public rewardUpdated;
    uint256 public accRewardPerShare;   // × 1e36
    /// @notice Reward tokens in this vault that belong to issuers (streaming + not yet claimed).
    uint256 public rewardHeld;
    uint256 internal _stranded;         // streamed while nobody held shares: added to the next reward
    mapping(address => uint256) internal _rewardDebt;
    mapping(address => uint256) internal _rewardOwed;

    // ---- withdrawal queue (owner 2026-10-20) --------------------------------------------------------------------
    struct Request {
        address owner;
        uint128 shares;   // still waiting
    }

    mapping(uint256 => Request) public requests;
    uint64 public queueHead;
    uint64 public queueTail;
    uint256 public queuedShares;
    uint8 public constant AUTO_PROCESS = 3;
    /// @notice Queue payouts the token refused to send, kept for their owner (withdrawOwed). Not principal.
    mapping(address => uint256) public owedTo;
    uint256 public owedTotal;

    event ManagerSet(address manager);
    event MaxUtilSet(uint16 bps);
    event Lent(uint256 amount);
    event Repaid(uint256 principal, uint256 extra);
    event RewardAdded(uint256 amount);
    event RewardClaimed(address indexed account, address to, uint256 amount);
    event WrittenOff(uint256 principal, uint256 fromRewards);
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

    function initialize(IERC20 asset_, string calldata name_, string calldata symbol_, address owner_, address manager_, IERC20 rewardToken_)
        external
        initializer
    {
        __ERC20_init(name_, symbol_);
        __ERC4626_init(asset_);
        __Ownable_init(owner_);
        __Ownable2Step_init();
        __ReentrancyGuard_init();
        maxUtilBps = 9_000;
        vestPeriod = 1 days;
        manager = manager_;
        rewardToken = rewardToken_;
        emit ManagerSet(manager_);
    }

    function setManager(address manager_) external onlyOwner {
        if (manager_ == address(0)) revert BadValue();
        manager = manager_;
        emit ManagerSet(manager_);
    }

    function setVestPeriod(uint32 secs) external onlyOwner {
        // At least 1 h (security review 2026-10-25): a deposit made just before a large reward must not take it.
        if (secs > 7 days || secs < 1 hours) revert BadValue();
        vestPeriod = secs; // applies from the next reward
        emit VestPeriodSet(secs);
    }

    function setMaxUtil(uint16 bps) external onlyOwner {
        if (bps > 9_500 || bps < 1_000) revert BadValue();
        maxUtilBps = bps;
        emit MaxUtilSet(bps);
    }

    // ---- accounting ---------------------------------------------------------------------------

    /// @notice Principal sitting in the vault (rewards excluded when they are the same token).
    function idle() public view returns (uint256) {
        uint256 b = IERC20(asset()).balanceOf(address(this));
        uint256 held = owedTotal + (address(rewardToken) == asset() ? rewardHeld : 0);
        return b > held ? b - held : 0;
    }

    function totalAssets() public view override returns (uint256) {
        return idle() + lent;
    }

    function reservedForQueue() public view returns (uint256) {
        return queuedShares == 0 ? 0 : _convertToAssets(queuedShares, Math.Rounding.Ceil);
    }

    function freeIdle() public view returns (uint256) {
        uint256 i = idle();
        uint256 r = reservedForQueue();
        return i > r ? i - r : 0;
    }

    function availableToLend() public view returns (uint256) {
        uint256 cap = totalAssets() * maxUtilBps / 10_000;
        if (cap <= lent) return 0;
        uint256 a = cap - lent;
        uint256 f = freeIdle();
        return a < f ? a : f;
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    function maxWithdraw(address owner_) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner_), freeIdle());
    }

    function maxRedeem(address owner_) public view override returns (uint256) {
        return Math.min(super.maxRedeem(owner_), _convertToShares(freeIdle(), Math.Rounding.Floor));
    }

    // ---- rewards ------------------------------------------------------------------------------

    /// Shares that earn rewards: all except those parked in the queue.
    function _rewardShares() internal view returns (uint256) {
        return totalSupply() - balanceOf(address(this));
    }

    function _streamed() internal view returns (uint256 amt, uint256 t) {
        t = Math.min(block.timestamp, rewardEnd);
        amt = t > rewardUpdated ? rewardRate * (t - rewardUpdated) / 1e18 : 0;
    }

    function _accrue() internal {
        (uint256 amt, uint256 t) = _streamed();
        if (amt > 0) {
            uint256 sh = _rewardShares();
            if (sh == 0) _stranded += amt;
            else accRewardPerShare += amt * ACC / sh;
        }
        if (t > rewardUpdated) rewardUpdated = uint40(t);
    }

    function _settle(address a) internal {
        if (a == address(0) || a == address(this)) return;
        uint256 accrued = balanceOf(a) * accRewardPerShare / ACC;
        _rewardOwed[a] += accrued - _rewardDebt[a];
        _rewardDebt[a] = accrued;
    }

    function _resetDebt(address a) internal {
        if (a == address(0) || a == address(this)) return;
        _rewardDebt[a] = balanceOf(a) * accRewardPerShare / ACC;
    }

    /// Every share movement settles rewards for both sides first, so shares never carry someone else's rewards.
    function _update(address from, address to, uint256 value) internal override {
        _accrue();
        _settle(from);
        _settle(to);
        super._update(from, to, value);
        _resetDebt(from);
        _resetDebt(to);
    }

    /// @notice USDC rewards `a` can claim right now.
    function pendingRewards(address a) external view returns (uint256) {
        uint256 acc = accRewardPerShare;
        (uint256 amt,) = _streamed();
        uint256 sh = _rewardShares();
        if (amt > 0 && sh > 0) acc += amt * ACC / sh;
        if (a == address(this)) return 0;
        return _rewardOwed[a] + balanceOf(a) * acc / ACC - _rewardDebt[a];
    }

    /// @notice Rewards still streaming in (not yet claimable by anyone).
    function rewardsStreaming() public view returns (uint256) {
        return block.timestamp >= rewardEnd ? 0 : rewardRate * (rewardEnd - block.timestamp) / 1e18;
    }

    function claimRewards() external nonReentrant returns (uint256) {
        return _claimRewards(msg.sender);
    }

    function claimRewardsTo(address to) external nonReentrant returns (uint256) {
        return _claimRewards(to);
    }

    function _claimRewards(address to) internal returns (uint256 amt) {
        _accrue();
        _settle(msg.sender);
        amt = _rewardOwed[msg.sender];
        if (amt == 0) return 0;
        _rewardOwed[msg.sender] = 0;
        rewardHeld -= amt;
        rewardToken.safeTransfer(to, amt);
        emit RewardClaimed(msg.sender, to, amt);
    }

    /// @notice Borrow fees and shares of gains, in USDC: streamed to the shares over vestPeriod, then claimable.
    function addRewards(uint256 amount) external onlyManager {
        _accrue();
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        rewardHeld += amount;
        amount += _stranded; // already counted in rewardHeld
        _stranded = 0;
        uint256 p = vestPeriod;
        if (p == 0) {
            uint256 sh = _rewardShares();
            if (sh == 0) _stranded = amount;
            else accRewardPerShare += amount * ACC / sh;
        } else {
            uint256 left = block.timestamp < rewardEnd ? rewardRate * (rewardEnd - block.timestamp) : 0;
            rewardRate = (amount * 1e18 + left) / p;
            rewardEnd = uint40(block.timestamp + p);
            rewardUpdated = uint40(block.timestamp);
        }
        emit RewardAdded(amount);
    }

    // ---- withdrawal queue -----------------------------------------------------------------------

    /// @notice Take out `shares` (all or part). Whatever is free now is paid at once; the rest is reserved and paid
    /// to msg.sender automatically as money comes back. Your rewards so far stay claimable.
    function requestRedeem(uint256 shares) external returns (uint256 id) {
        // Dust requests that owe nothing would sit at the head of the queue forever (security review 2026-10-25).
        if (shares == 0 || _convertToAssets(shares, Math.Rounding.Floor) == 0) revert BadValue();
        _transfer(msg.sender, address(this), shares);
        id = queueTail++;
        requests[id] = Request(msg.sender, SafeCast.toUint128(shares));
        queuedShares += shares;
        emit WithdrawRequested(id, msg.sender, shares);
        _processQueue(AUTO_PROCESS);
    }

    function cancelRequest(uint256 id) external {
        Request memory r = requests[id];
        if (r.owner != msg.sender) revert NotYours();
        if (r.shares == 0) revert BadValue();
        requests[id].shares = 0;
        queuedShares -= r.shares;
        _transfer(address(this), msg.sender, r.shares);
        emit WithdrawCancelled(id, msg.sender, r.shares);
        _skipEmpty(MAX_SKIP);
    }

    /// @notice Queue payouts that could not be sent (e.g. the token refused the transfer), waiting for their owner.
    function withdrawOwed(address to) external returns (uint256 amt) {
        amt = owedTo[msg.sender];
        if (amt == 0) return 0;
        owedTo[msg.sender] = 0;
        owedTotal -= amt;
        IERC20(asset()).safeTransfer(to, amt);
    }

    /// @notice Pay up to `maxItems` waiting requests from idle assets. Anyone can call it.
    function processQueue(uint256 maxItems) external returns (uint256 paid) {
        return _processQueue(maxItems);
    }

    // Security review 2026-10-25: queue work inside a settlement (repay, deposit) is bounded and can never revert it.
    // Cancelled slots are skipped at most MAX_SKIP per call (spam cannot make a settlement run out of gas), and a
    // payout the token refuses is kept for its owner (withdrawOwed) instead of blocking everyone behind it.
    uint256 internal constant MAX_SKIP = 32;

    function _processQueue(uint256 maxItems) internal returns (uint256 done) {
        uint256 budget = MAX_SKIP;
        budget -= _skipEmpty(budget);
        while (done < maxItems && queueHead < queueTail && requests[queueHead].shares != 0) {
            uint256 id = queueHead;
            Request memory r = requests[id];
            uint256 owed = _convertToAssets(r.shares, Math.Rounding.Floor);
            uint256 i = idle();
            if (owed != 0 && i == 0) break;
            uint256 pay = owed < i ? owed : i;
            uint256 burn = pay == owed ? r.shares : _convertToShares(pay, Math.Rounding.Ceil);
            if (burn > r.shares) burn = r.shares;
            if (burn == 0) break;
            requests[id].shares = r.shares - uint128(burn);
            queuedShares -= burn;
            _burn(address(this), burn);
            if (pay > 0 && !_tryTransfer(r.owner, pay)) {
                owedTo[r.owner] += pay;
                owedTotal += pay;
            }
            bool complete = burn == r.shares;
            emit WithdrawPaid(id, r.owner, pay, burn, complete);
            emit Withdraw(address(this), r.owner, r.owner, pay, burn);
            unchecked { ++done; }
            if (!complete) break;
            queueHead++;
            if (budget == 0) break;
            budget -= _skipEmpty(budget);
        }
    }

    /// Skips at most `budget` cancelled slots; returns how many.
    function _skipEmpty(uint256 budget) internal returns (uint256 n) {
        uint64 h = queueHead;
        while (n < budget && h < queueTail && requests[h].shares == 0) { unchecked { ++h; ++n; } }
        queueHead = h;
    }

    function _tryTransfer(address to, uint256 amt) internal returns (bool) {
        (bool ok, bytes memory ret) = asset().call(abi.encodeCall(IERC20.transfer, (to, amt)));
        return ok && (ret.length == 0 || abi.decode(ret, (bool)));
    }

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

    /// @notice Principal back first (reduces `lent`), plus any extra assets (e.g. coins bought beyond the principal
    /// in a liquidation), which raise the share price.
    function repay(uint256 principal, uint256 extra) external onlyManager {
        if (principal > lent) revert BadValue();
        lent -= principal;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), principal + extra);
        emit Repaid(principal, extra);
        _processQueue(AUTO_PROCESS);
    }

    /// @notice Principal that could not be recovered after a gap and after the Reserve Security Fund. On the USDC
    /// reserve, rewards still streaming absorb the loss first.
    function writeOff(uint256 principal) external onlyManager {
        if (principal > lent) revert BadValue();
        lent -= principal;
        uint256 take;
        if (address(rewardToken) == asset()) {
            _accrue();
            uint256 streaming = rewardsStreaming();
            take = Math.min(streaming, principal);
            if (take > 0) {
                rewardHeld -= take; // becomes principal again (idle)
                rewardRate = (streaming - take) * 1e18 / (rewardEnd - block.timestamp);
            }
        }
        emit WrittenOff(principal, take);
    }
}
