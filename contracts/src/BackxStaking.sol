// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title $GAZZ and Gazz Tanks staking (owner 2026-10-26): replaces the plain $GAZZ holder share.
/// @notice The Treasury's holder share (holderBps of all platform revenue, USDC) is paid to this contract. Stakers earn
/// it pro rata to their points: 1 point per whole $GAZZ staked plus `tankPoints` per Gazz Tank NFT staked.
///   - Rewards stream in over `DURATION` (7 days) from the moment they arrive, so staking just before a payment earns
///     almost nothing.
///   - Staked $GAZZ and Tanks are locked for `LOCK` (3 months, owner 2026-10-26) from your latest stake; adding more
///     starts the 3 months again for everything you have staked.
///   - Rewards are claimable USDC (`claim` / `claimTo`), any time, also while locked. Unstaking never forfeits them.
///   - Nobody can move staked $GAZZ or Tanks but their owner. There is no owner, no admin and no upgrade: the settings
///     are fixed at deploy.
/// `sync()` (anyone, our validator weekly right after Treasury.distribute) starts streaming whatever USDC arrived.
contract BackxStaking is ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    uint256 public constant DURATION = 7 days;
    uint256 public constant LOCK = 90 days;
    uint256 private constant ACC = 1e36;

    IERC20 public immutable gazz;
    IERC721 public immutable tanks;
    IERC20 public immutable usd;
    /// Points for one Tank, in $GAZZ base units (e.g. 10,000e18 = a Tank counts like 10,000 $GAZZ).
    uint256 public immutable tankPoints;

    uint256 public totalPoints;
    uint256 public totalGazz;
    uint256 public totalTanks;
    mapping(address => uint256) public gazzOf;
    mapping(address => uint256) public tanksOf;
    mapping(uint256 => address) public tankOwner;
    /// When your stake can be taken out (latest stake + LOCK).
    mapping(address => uint256) public unlockAt;

    // Reward stream (Synthetix style): rate × time is shared out per point.
    uint256 public rate;                 // USD base units per second × 1e18 (precise over 7 days)
    uint256 public periodFinish;
    uint256 public lastUpdate;
    uint256 public accPerPoint;          // × ACC
    uint256 public reserved;             // USDC already promised: streaming or claimable, not yet paid
    mapping(address => uint256) public paidPerPoint;
    mapping(address => uint256) public owed;

    event Staked(address indexed who, uint256 gazz, uint256[] tankIds);
    event Unstaked(address indexed who, uint256 gazz, uint256[] tankIds);
    event Synced(uint256 added, uint256 rate, uint256 periodFinish);
    event Claimed(address indexed who, address indexed to, uint256 amount);

    error BadParams();
    error NotYours();
    error NotTank();
    error Locked(uint256 until);

    constructor(IERC20 gazz_, IERC721 tanks_, IERC20 usd_, uint256 tankPoints_) {
        if (address(gazz_) == address(0) || address(tanks_) == address(0) || address(usd_) == address(0)) revert BadParams();
        if (address(usd_) == address(gazz_)) revert BadParams();
        (gazz, tanks, usd, tankPoints) = (gazz_, tanks_, usd_, tankPoints_);
        lastUpdate = block.timestamp;
    }

    // ---- views --------------------------------------------------------------------------------------

    function pointsOf(address who) public view returns (uint256) {
        return gazzOf[who] + tanksOf[who] * tankPoints;
    }

    function lastTime() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function currentAcc() public view returns (uint256) {
        uint256 t = lastTime();
        if (totalPoints == 0 || t <= lastUpdate) return accPerPoint;
        return accPerPoint + (t - lastUpdate) * rate * 1e18 / totalPoints;
    }

    /// @notice USDC you can claim now.
    function earned(address who) public view returns (uint256) {
        return owed[who] + pointsOf(who) * (currentAcc() - paidPerPoint[who]) / ACC;
    }

    // ---- staking ------------------------------------------------------------------------------------

    /// @notice Stake $GAZZ (approve first) and/or Gazz Tanks (approve this contract for them first). Locks your whole
    /// stake for 3 months from now.
    function stake(uint256 amount, uint256[] calldata tankIds) external nonReentrant {
        if (amount == 0 && tankIds.length == 0) revert BadParams();
        _update(msg.sender);
        unlockAt[msg.sender] = block.timestamp + LOCK;
        if (amount > 0) {
            uint256 before = gazz.balanceOf(address(this));
            gazz.safeTransferFrom(msg.sender, address(this), amount);
            amount = gazz.balanceOf(address(this)) - before; // what really arrived
            gazzOf[msg.sender] += amount;
            totalGazz += amount;
            totalPoints += amount;
        }
        for (uint256 i; i < tankIds.length; i++) {
            tanks.transferFrom(msg.sender, address(this), tankIds[i]);
            _addTank(msg.sender, tankIds[i]);
        }
        emit Staked(msg.sender, amount, tankIds);
    }

    /// @notice Take back $GAZZ and/or your Tanks once the 3-month lock is over. Earned USDC stays claimable.
    function unstake(uint256 amount, uint256[] calldata tankIds) external nonReentrant {
        if (block.timestamp < unlockAt[msg.sender]) revert Locked(unlockAt[msg.sender]);
        _update(msg.sender);
        if (amount > gazzOf[msg.sender]) revert BadParams();
        gazzOf[msg.sender] -= amount;
        totalGazz -= amount;
        totalPoints -= amount;
        for (uint256 i; i < tankIds.length; i++) {
            uint256 id = tankIds[i];
            if (tankOwner[id] != msg.sender) revert NotYours();
            delete tankOwner[id];
            tanksOf[msg.sender] -= 1;
            totalTanks -= 1;
            totalPoints -= tankPoints;
        }
        if (amount > 0) gazz.safeTransfer(msg.sender, amount);
        for (uint256 i; i < tankIds.length; i++) tanks.safeTransferFrom(address(this), msg.sender, tankIds[i]);
        emit Unstaked(msg.sender, amount, tankIds);
    }

    /// A Tank sent here with safeTransferFrom is staked for whoever sent it. Anything but a Gazz Tank is refused.
    function onERC721Received(address, address from, uint256 id, bytes calldata) external returns (bytes4) {
        if (msg.sender != address(tanks)) revert NotTank();
        if (tankOwner[id] == address(0)) {
            _update(from);
            unlockAt[from] = block.timestamp + LOCK;
            _addTank(from, id);
            uint256[] memory ids = new uint256[](1);
            ids[0] = id;
            emit Staked(from, 0, ids);
        }
        return IERC721Receiver.onERC721Received.selector;
    }

    function _addTank(address who, uint256 id) internal {
        tankOwner[id] = who;
        tanksOf[who] += 1;
        totalTanks += 1;
        totalPoints += tankPoints;
    }

    // ---- rewards ------------------------------------------------------------------------------------

    /// @notice Starts streaming any USDC that arrived since the last sync (plus what was still streaming) over 7 days.
    function sync() external nonReentrant returns (uint256 added) {
        _update(address(0));
        added = usd.balanceOf(address(this)) - reserved;
        if (added == 0) return 0;
        uint256 left = block.timestamp < periodFinish ? (periodFinish - block.timestamp) * rate / 1e18 : 0;
        reserved += added;
        rate = (added + left) * 1e18 / DURATION;
        periodFinish = block.timestamp + DURATION;
        lastUpdate = block.timestamp;
        emit Synced(added, rate, periodFinish);
    }

    function claim() external returns (uint256) {
        return claimTo(msg.sender);
    }

    function claimTo(address to) public nonReentrant returns (uint256 amount) {
        if (to == address(0)) revert BadParams();
        _update(msg.sender);
        amount = owed[msg.sender];
        if (amount == 0) return 0;
        owed[msg.sender] = 0;
        reserved -= amount;
        usd.safeTransfer(to, amount);
        emit Claimed(msg.sender, to, amount);
    }

    function _update(address who) internal {
        uint256 t = lastTime();
        if (t > lastUpdate) {
            if (totalPoints == 0) {
                // Nobody staked: this part of the stream is handed back and goes out again on the next sync.
                reserved -= (t - lastUpdate) * rate / 1e18;
            } else {
                accPerPoint += (t - lastUpdate) * rate * 1e18 / totalPoints;
            }
            lastUpdate = t;
        }
        if (who != address(0)) {
            owed[who] += pointsOf(who) * (accPerPoint - paidPerPoint[who]) / ACC;
            paidPerPoint[who] = accPerPoint;
        }
    }
}
