// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {BackxReserveVault} from "./BackxReserveVault.sol";
import {BackxReserveSecurityFund} from "./BackxReserveSecurityFund.sol";
import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @title What the Hedge and the Short manager share (owner 2026-10-25: one manager per side per coin).
/// @notice docs/backx/HEDGE-ISSUER-SPEC.md, SHORT-SPEC.md, FEES-AND-MARGINS.md, docs/backx/VALIDATORS.md.
///
/// Open validators: liquidations, take-profit fills, the short roof and entry orders can be executed by ANYONE
/// (a person, a bot, an AI agent). Whoever executes earns the position's escrowed gas fee plus an accuracy bonus
/// that is largest when the execution lands right at the trigger and falls to a late floor 1 % past it:
///     bonus = max(maxBonus · ((W − d) / W)², maxBonus · lateBps),  d = distance past the trigger,  W = accuracyBps (1 %),
///     lateBps 20 % (owner 2026-10-26: late settlements still pay, so nothing overdue is left to sink).
/// Rewards are USDC, credited in this contract and taken out with claim(): validators, agents and people alike.
/// Nothing that protects money depends on BackX servers (docs/backx/LIVENESS.md).
///
/// Upgradeable: one BeaconProxy per coin per side from BackxMarketFactory; the Safe upgrades every market of a
/// side on a chain at once. Storage is APPEND-ONLY across versions.
abstract contract BackxManagerBase is Initializable, Ownable2StepUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    uint8 public constant MAX_M = 30;

    struct Config {
        bool enabled;
        uint8 maxM;                 // market cap on multiplication (the reserve may allow less)
        uint16 stressBps;           // one-jump move the crash cover is sized for (hedge: fall, short: rise)
        uint16 liqMarginBps;        // liquidate this much earlier (of the position) so a late fill still repays issuers
        uint16 roofBps;             // short only: price fall that closes the short automatically (its profit roof)
        uint128 maxNotionalUsd;     // per position
        uint128 maxOpenUsd;         // all positions together, USD value lent
    }

    /// @dev Per m. e = trader equity left at liquidation, s = issuers' share of that rest, p = issuers' share of a
    /// gain, buf = extra margin on the issuers' principal.
    struct Params {
        uint16 eBps;
        uint16 sBps;
        uint16 pBps;
        uint16 bufBps;
    }

    struct Fees {
        uint16 platformBps;     // of the margin when issuers lend → fee collector (the Treasury, $GAZZ holders' share)
        uint16 rsfStakeBps;     // of the margin when issuers lend → Reserve Security Fund
        uint16 rsfLentBps;      // of the amount lent → Reserve Security Fund
        uint16 borrowBps;       // of the amount lent → issuers (claimable USDC)
        uint16 oracleDevBps;    // max distance between pool execution and the oracle at open
        uint16 spotBps;         // of the margin on a 1x hedge (nothing lent, no fund fee) → fee collector
        uint16 gainBps;         // platform's share of a trader's gain on a position with a loan → fee collector
        uint16 liqCutBps;       // platform's share of what is left at a liquidation, before the issuers' share
    }

    /// @notice Validator pay. gasUsd is escrowed per position at open and paid to whoever settles it.
    struct Validation {
        uint64 gasUsd;          // flat USD per position (≈ 2× one settlement's gas); max $5
        uint16 liqBonusBps;     // max accuracy bonus on a liquidation, of the position value (from the trader's rest)
        uint16 fillBonusBps;    // max accuracy bonus on a take-profit / roof / entry fill, of the position value
        uint16 accuracyBps;     // W: the bonus is zero this far past the trigger
        uint16 restCapBps;      // the bonus never takes more than this share of what is left (issuers first, owner 2026-10-25)
        uint16 lateBps;         // late floor, share of the max bonus a validator still earns past W (owner 2026-10-26)
    }

    struct Position {
        address owner;
        uint8 m;
        uint40 openedAt;
        uint64 gas;           // escrowed validator gas (USD)
        uint128 stake;        // margin X
        uint128 lent;         // hedge: USD lent. short: coins lent (q)
        uint128 amount;       // hedge: coins held. short: USD held (C = X + sale proceeds)
        uint128 lentUsd;      // USD value lent at open (open interest)
        uint128 limitValue;   // hedge: USD the coins must fetch. short: USD the q coins may cost (≥ roof). 0 = none
        uint128 stressUsd;    // this position's share of the worst-case gap
        uint128 stopValue;    // stop-loss (owner 2026-10-25). hedge: sell once the coins fetch ≤ this. short: buy back once
                              // the q coins cost ≥ this. 0 = none. Filled by validators like a take-profit.
    }

    /// @notice Entry order (buy for Hedge, sell for Short): USDC is escrowed now, a validator opens the position
    /// when the oracle price crosses `trigger` (0 = as soon as possible, e.g. when issuers add capital).
    struct Order {
        address owner;
        uint8 m;
        bool above;           // fill when price ≥ trigger (else ≤)
        uint40 expiry;
        uint16 slipBps;       // worst fill vs the oracle the owner accepts (default 0.5 %, at most limitSlipBps)
        uint128 amount;       // everything the trader pays, incl. both gas fees
        uint128 trigger;      // USD base units per 1e18 coin base units
        uint128 limitPrice;   // take-profit for the new position (0 = none)
    }

    IERC20 public usd;
    address public token;
    BackxReserveVault public vault;           // hedge: USDC reserve. short: the coin's reserve
    BackxReserveSecurityFund public fund;     // this side's Reserve Security Fund (crises only)
    ISwapAdapter public adapter;
    IPriceOracle public oracle;
    address public feeCollector;
    Config public config;
    Fees public fees;
    Validation public validation;
    uint16 public liqMaxGapBps;     // a liquidation may fill at most this far from the oracle (sandwich guard)
    uint16 public twapConfirmBps;   // the oracle must agree with the pool this closely to confirm a liquidation
    uint16 public limitSlipBps;     // a take-profit / entry fill may be at most this much worse than its price
    uint16 public stressCoverBps;   // 0 = off. Else the fund must cover this share of stressUsd for new positions
    uint16 public maxCoverBps;      // most of a position's lent value the fund may pay for one gap
    uint256 public openUsd;
    uint256 public stressUsd;
    uint256 internal _oneUsd;
    Params[MAX_M + 1] internal _params;

    mapping(uint256 => Position) public positions;
    uint256 public nextId;
    mapping(uint256 => Order) public orders;
    uint256 public nextOrderId;

    /// @notice USDC earned by validators (and anyone else paid here), waiting for claim().
    mapping(address => uint256) public claimable;
    uint256 public totalClaimable;

    struct Init {
        IERC20 usd;
        address token;
        BackxReserveVault vault;
        BackxReserveSecurityFund fund;
        ISwapAdapter adapter;
        IPriceOracle oracle;
        address feeCollector;
        address owner;         // the Safe
        Config config;
    }

    event ConfigSet(Config c);
    event ParamsSet(uint8 m, Params p);
    event Opened(uint256 indexed id, address indexed owner, uint8 m, uint256 stake, uint256 lent, uint256 amount, uint256 limitValue);
    event Closed(uint256 indexed id, address indexed by, uint8 kind, uint256 toTrader, uint256 toIssuers, uint256 covered, uint256 writtenOff);
    event LimitSet(uint256 indexed id, uint256 limitValue);
    event StopSet(uint256 indexed id, uint256 stopValue);
    event OrderPlaced(uint256 indexed orderId, address indexed owner, uint8 m, uint256 amount, uint256 trigger, bool above, uint256 expiry);
    event OrderFilled(uint256 indexed orderId, uint256 indexed positionId, address indexed by);
    event OrderCancelled(uint256 indexed orderId);
    event Rewarded(address indexed validator, uint256 indexed id, uint8 kind, uint256 gas, uint256 bonus);
    event Claimed(address indexed account, address to, uint256 amount);

    // Closed / Rewarded kind
    uint8 internal constant K_CLOSE = 0;
    uint8 internal constant K_LIQ = 1;
    uint8 internal constant K_LIMIT = 2;
    uint8 internal constant K_FILL = 3;

    error MarketOff();
    error BadM();
    error TooLarge();
    error OpenInterestFull();
    error NotOwner();
    error NotLiquidatable();
    error WouldLiquidate();
    error OracleMismatch();
    error Underwater();
    error BadParams();
    error BadLimit();
    error LimitNotReached();
    error FundTooSmall();
    error NothingLeft();
    error NotFillable();
    error OnlySelf();
    error SwapShort();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    bytes internal constant E_PACKED = hex"0fa00fa00dac0cb20bb80abe09c4094708ca07d00780073006e006900640061805f005c805a0057805640550053c05280514050004ec04d804c404b0";
    bytes internal constant S_PACKED = hex"13881388177019641b581d4c1f401fe7208d2134219821fc226022c42328232823282328232823282328232823282328232823282328232823282328";

    function _packed(bytes memory b, uint256 m) private pure returns (uint16) {
        return uint16(uint8(b[2 * (m - 1)])) << 8 | uint16(uint8(b[2 * m - 1]));
    }

    function _initBase(Init calldata a, uint16 bufBps) internal {
        __Ownable_init(a.owner);
        __Ownable2Step_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        usd = a.usd;
        token = a.token;
        vault = a.vault;
        fund = a.fund;
        adapter = a.adapter;
        oracle = a.oracle;
        if (a.feeCollector == address(0)) revert BadParams();
        feeCollector = a.feeCollector;
        liqMaxGapBps = 200;
        twapConfirmBps = 25;
        limitSlipBps = 100;
        maxCoverBps = 5_000;
        nextId = 1;
        nextOrderId = 1;
        _oneUsd = 10 ** IERC20Metadata(address(a.usd)).decimals();
        validation = Validation({gasUsd: uint64(_oneUsd / 2), liqBonusBps: 50, fillBonusBps: 10, accuracyBps: 100, restCapBps: 1500, lateBps: 2000});
        fees = Fees({platformBps: 200, rsfStakeBps: 50, rsfLentBps: 3, borrowBps: 25, oracleDevBps: 200, spotBps: 30, gainBps: 200, liqCutBps: 500});
        // e, s from docs/backx/sim/sim3.py (v3); p = 10 % flat since v4. Packed: 2 bytes per m (m = 1..30), in bps.
        for (uint256 m = 1; m <= MAX_M; m++) {
            uint256 extra = m > 10 ? 2 * (m - 10) : 0; // +0.02 % per step past 10×
            _params[m] = Params(_packed(E_PACKED, m), _packed(S_PACKED, m), 1000, uint16(bufBps + extra));
        }
        _setConfig(a.config);
    }

    // ---- owner (the Safe) ------------------------------------------------------------------------

    function setConfig(Config calldata c) external onlyOwner {
        _setConfig(c);
    }

    function _setConfig(Config memory c) internal {
        if (c.maxM > MAX_M || c.stressBps < 2_000 || c.stressBps > 50_000 || c.liqMarginBps > 2_000 || c.roofBps > 9_500 || c.roofBps < _minRoofBps()) {
            revert BadParams();
        }
        config = c;
        emit ConfigSet(c);
    }

    function setParams(uint8 m, Params calldata pr) external onlyOwner {
        if (m == 0 || m > MAX_M) revert BadM();
        if (pr.eBps < 500 || pr.eBps > 6000 || pr.sBps > 9500 || pr.pBps > 5000 || pr.bufBps > 500) revert BadParams();
        _params[m] = pr;
        emit ParamsSet(m, pr);
    }

    function setFees(Fees calldata f) external onlyOwner {
        if (f.platformBps > 300 || f.rsfStakeBps > 200 || f.rsfLentBps > 50 || f.borrowBps > 100 || f.oracleDevBps > 1000 || f.spotBps > 100 || f.gainBps > 500 || f.liqCutBps > 1000) {
            revert BadParams();
        }
        fees = f;
    }

    /// @notice Gas at most $5; bonuses at most 2 % (liquidation) / 0.5 % (fills); W between 0.1 % and 5 %.
    function setValidation(Validation calldata v) external onlyOwner {
        if (v.gasUsd > 5 * _oneUsd || v.liqBonusBps > 200 || v.fillBonusBps > 50 || v.accuracyBps < 10 || v.accuracyBps > 500 || v.restCapBps > 5000 || v.lateBps > 5000) {
            revert BadParams();
        }
        validation = v;
    }

    /// @notice Fee collector, swap route and price feed.
    function setAddresses(address c, ISwapAdapter a, IPriceOracle o) external onlyOwner {
        if (c == address(0) || address(a) == address(0) || address(o) == address(0)) revert BadParams();
        (feeCollector, adapter, oracle) = (c, a, o);
    }

    function setGuards(uint16 liqMaxGap, uint16 twapConfirm, uint16 limitSlip, uint16 stressCover, uint16 maxCover) external onlyOwner {
        if (liqMaxGap < 50 || liqMaxGap > 1_000 || twapConfirm > 100 || limitSlip < 10 || limitSlip > 500) revert BadParams();
        if ((stressCover != 0 && (stressCover < 2_000 || stressCover > BPS)) || maxCover > BPS) revert BadParams();
        (liqMaxGapBps, twapConfirmBps, limitSlipBps, stressCoverBps, maxCoverBps) = (liqMaxGap, twapConfirm, limitSlip, stressCover, maxCover);
    }

    /// @notice Stops NEW positions and order fills only. Closing, liquidation, take-profit, cancel and claim always work.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function params(uint8 m) external view returns (Params memory) {
        return _params[m];
    }

    // ---- open validators: anyone can execute, in batches ------------------------------------------

    /// @notice Liquidates every position in `ids` that is due; the rest are skipped, never reverted.
    function liquidateBatch(uint256[] calldata ids) external nonReentrant returns (uint256 done) {
        return _batch(ids, K_LIQ);
    }

    /// @notice Fills every take-profit (and short roof) in `ids` that has been reached.
    function executeLimitBatch(uint256[] calldata ids) external nonReentrant returns (uint256 done) {
        return _batch(ids, K_LIMIT);
    }

    /// @notice Fills every entry order in `orderIds` whose condition holds.
    function fillOrderBatch(uint256[] calldata orderIds) external nonReentrant returns (uint256 done) {
        return _batch(orderIds, K_FILL);
    }

    /// @notice Close your own position. `limit`: Hedge = min USD out of the sale, Short = max USD into the buy-back.
    function close(uint256 id, uint256 limit) external nonReentrant {
        this.selfSettle(id, K_CLOSE, msg.sender, limit);
    }

    // Single versions revert with the reason (NotLiquidatable, LimitNotReached, NotFillable).
    function liquidate(uint256 id) external nonReentrant {
        this.selfSettle(id, K_LIQ, msg.sender, 0);
    }

    function executeLimit(uint256 id) external nonReentrant {
        this.selfSettle(id, K_LIMIT, msg.sender, 0);
    }

    function fillOrder(uint256 orderId) external nonReentrant {
        this.selfSettle(orderId, K_FILL, msg.sender, 0);
    }

    function _batch(uint256[] calldata ids, uint8 kind) internal returns (uint256 done) {
        for (uint256 i; i < ids.length; ) {
            try this.selfSettle(ids[i], kind, msg.sender, 0) { unchecked { ++done; } } catch { }
            unchecked { ++i; }
        }
    }

    /// @dev Only this contract. Every settlement (own close, liquidation, take-profit / roof, order fill) runs through
    /// here, so each exists once in the bytecode and each one stays atomic inside a batch. The external entry points
    /// above hold the re-entrancy guard. `v` is the caller: the position's owner for a close, else the validator.
    function selfSettle(uint256 id, uint8 kind, address v, uint256 arg) external {
        if (msg.sender != address(this)) revert OnlySelf();
        if (kind == K_FILL) {
            _requireNotPaused();
            _fillOrder(id, v);
        } else {
            (Position memory pos, uint256 limit) = _due(id, kind, v, arg);
            _close(id, pos, kind, limit, v);
        }
    }

    // ---- open ------------------------------------------------------------------------------------

    /// @notice Open a position now. `amount` is everything you pay (fees and validator gas come out of it).
    /// `minOut`: Hedge = min coins bought, Short = min USD from selling the borrowed coins (0 = oracle − limitSlip).
    /// `limitPrice`: take-profit in USD base units per 1e18 coin (Hedge above today's price, Short below; 0 = none).
    function open(uint256 amount, uint8 m, uint256 minOut, uint256 limitPrice) external nonReentrant whenNotPaused returns (uint256) {
        return this.selfOpen(msg.sender, msg.sender, amount, m, minOut, limitPrice, limitSlipBps);
    }

    /// @dev Only this contract (open and order fills), so the opening code exists once in the bytecode. Both callers
    /// hold the re-entrancy guard; `payer` is the trader (open) or this contract (an order's escrow).
    function selfOpen(address owner_, address payer, uint256 amount, uint8 m, uint256 minOut, uint256 limitPrice, uint16 slipBps)
        external
        returns (uint256)
    {
        if (msg.sender != address(this)) revert OnlySelf();
        return _open(owner_, payer, amount, m, minOut, limitPrice, slipBps);
    }

    // ---- claims: validators, agents, anyone with a balance here --------------------------------------

    function claim() external nonReentrant returns (uint256) {
        return _claim(msg.sender);
    }

    function claimTo(address to) external nonReentrant returns (uint256) {
        return _claim(to);
    }

    function _claim(address to) internal returns (uint256 amt) {
        amt = claimable[msg.sender];
        if (amt == 0) return 0;
        claimable[msg.sender] = 0;
        totalClaimable -= amt;
        usd.safeTransfer(to, amt);
        emit Claimed(msg.sender, to, amt);
    }

    /// Trader payout. Own close: straight to the wallet. Settled by a validator: sent if the token accepts it, else kept
    /// claimable, so an owner the token refuses (e.g. a blacklisted address) can never block a liquidation.
    function _payOwner(address owner_, uint256 amt, bool own) internal {
        if (amt == 0) return;
        if (own) return usd.safeTransfer(owner_, amt);
        (bool ok, bytes memory ret) = address(usd).call(abi.encodeCall(IERC20.transfer, (owner_, amt)));
        if (ok && (ret.length == 0 || abi.decode(ret, (bool)))) return;
        claimable[owner_] += amt;
        totalClaimable += amt;
    }

    /// Pays the validator its escrowed gas plus an accuracy bonus (both in USDC, claimable).
    function _payValidator(address v, uint256 id, uint8 kind, uint256 gas, uint256 bonus) internal {
        uint256 amt = gas + bonus;
        if (amt == 0) return;
        claimable[v] += amt;
        totalClaimable += amt;
        emit Rewarded(v, id, kind, gas, bonus);
    }

    /// Validator bonus on a liquidation or take-profit, from the rest: the accuracy bonus, capped at restCapBps of it.
    function _settleBonus(uint8 kind, uint256 rest, uint256 value, uint256 target) internal view returns (uint256) {
        Validation memory v = validation;
        uint256 maxB = kind == K_LIQ ? v.liqBonusBps : kind == K_LIMIT ? v.fillBonusBps : 0;
        uint256 cap = rest * v.restCapBps / BPS;
        uint256 b = _accuracyBonus(value * maxB / BPS, value, target);
        return b < cap ? b : cap;
    }

    /// maxBonus · ((W − d) / W)², d = |got − target| / target in bps, never below the late floor
    /// (lateBps of maxBonus, owner 2026-10-26): a late settlement still pays, so an overdue liquidation or fill is
    /// always worth picking up instead of being left to sink.
    function _accuracyBonus(uint256 maxBonus, uint256 got, uint256 target) internal view returns (uint256) {
        if (maxBonus == 0 || target == 0) return 0;
        uint256 floor = maxBonus * validation.lateBps / BPS;
        uint256 diff = got > target ? got - target : target - got;
        uint256 d = diff * BPS / target;
        uint256 w = validation.accuracyBps;
        if (d >= w) return floor;
        uint256 b = maxBonus * (w - d) * (w - d) / (w * w);
        return b > floor ? b : floor;
    }

    // ---- entry orders ---------------------------------------------------------------------------

    /// @notice Escrows `amount` USDC (everything included: the filler's gas, the position's gas and every fee).
    /// A validator opens the position for you when the condition holds; until then you can cancel for a full refund.
    /// `slipBps`: the worst fill vs the oracle you accept (0 = 0.5 %, at most limitSlipBps), so a filler cannot
    /// sandwich more than that (security review 2026-10-25).
    function placeOrder(uint8 m, uint256 amount, uint256 trigger, bool above, uint40 expiry, uint256 limitPrice, uint16 slipBps)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 orderId)
    {
        if (!config.enabled) revert MarketOff();
        if (m == 0 || m > config.maxM) revert BadM();
        if (expiry <= block.timestamp || amount <= 2 * uint256(validation.gasUsd)) revert BadParams();
        if (slipBps == 0) slipBps = 50;
        if (slipBps > limitSlipBps) revert BadParams();
        // A take-profit on the wrong side of the entry could never fill: refuse it now, not at every fill attempt.
        if (limitPrice != 0 && trigger != 0 && !_tpFits(trigger, limitPrice)) revert BadLimit();
        usd.safeTransferFrom(msg.sender, address(this), amount);
        orderId = nextOrderId++;
        orders[orderId] = Order({
            owner: msg.sender, m: m, above: above, expiry: expiry, slipBps: slipBps, amount: SafeCast.toUint128(amount),
            trigger: SafeCast.toUint128(trigger), limitPrice: SafeCast.toUint128(limitPrice)
        });
        emit OrderPlaced(orderId, msg.sender, m, amount, trigger, above, expiry);
    }

    /// @notice The owner can cancel any time; anyone can clear an expired order (the USDC goes back to its owner).
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order memory o = orders[orderId];
        if (o.owner == address(0)) revert NotFillable();
        if (o.owner != msg.sender && block.timestamp < o.expiry) revert NotOwner();
        delete orders[orderId];
        usd.safeTransfer(o.owner, o.amount);
        emit OrderCancelled(orderId);
    }

    function price() public view returns (uint256) {
        return oracle.usdValue(token, 1e18);
    }

    function isOrderFillable(uint256 orderId) public view returns (bool) {
        Order memory o = orders[orderId];
        if (o.owner == address(0) || block.timestamp >= o.expiry || !config.enabled) return false;
        if (o.trigger != 0) {
            uint256 p = price();
            if (o.above ? p < o.trigger : p > o.trigger) return false;
        }
        return _canOpen(o.m, o.amount - validation.gasUsd);
    }

    function _fillOrder(uint256 orderId, address v) internal returns (uint256 id) {
        if (!isOrderFillable(orderId)) revert NotFillable();
        Order memory o = orders[orderId];
        delete orders[orderId];
        uint256 gas = validation.gasUsd;
        uint256 bonus;
        if (o.trigger != 0) {
            // Bonus from the order, of the position value, largest right at the trigger.
            uint256 maxB = (uint256(o.amount) - gas) * o.m * validation.fillBonusBps / BPS;
            bonus = _accuracyBonus(maxB, price(), o.trigger);
        }
        _payValidator(v, orderId, K_FILL, gas, bonus);
        id = this.selfOpen(o.owner, address(this), o.amount - gas - bonus, o.m, 0, o.limitPrice, o.slipBps);
        emit OrderFilled(orderId, id, v);
    }

    // ---- shared math -------------------------------------------------------------------------------

    /// Platform and fund fee rates on the margin: a 1x hedge (nothing lent) pays only spotBps (owner 2026-10-25).
    function _rates(uint256 lentMult, Fees memory f) internal pure returns (uint256 platform, uint256 rsf) {
        return lentMult == 0 ? (uint256(f.spotBps), 0) : (uint256(f.platformBps), uint256(f.rsfStakeBps));
    }

    /// Margin X left from `amount` once every fee and the validator gas are paid:
    /// amount = X + X·(platform + rsfStake) + lentMult·X·(borrow + rsfLent) + gas, rounded down.
    function _stakeFor(uint256 amount, uint256 lentMult, Fees memory f) internal view returns (uint256) {
        uint256 gas = validation.gasUsd;
        if (amount <= gas) revert NothingLeft();
        (uint256 pl, uint256 rs) = _rates(lentMult, f);
        uint256 x = (amount - gas) * BPS / (BPS + pl + rs + lentMult * (f.borrowBps + f.rsfLentBps));
        if (x == 0) revert NothingLeft();
        return x;
    }

    /// Pulls the trader's money (or uses an order's escrow) and pays the platform's and the fund's fees.
    function _collect(address from, uint256 total, uint256 platform, uint256 rsf) internal {
        if (from != address(this)) usd.safeTransferFrom(from, address(this), total);
        if (platform > 0) usd.safeTransfer(feeCollector, platform);
        if (rsf > 0) usd.safeTransfer(address(fund), rsf);
    }

    /// Tracks the worst-case gap; when the Safe has switched the gate on, the fund must cover it.
    function _addStress(uint256 stress) internal {
        if (stress == 0) return;
        uint256 total = stressUsd + stress;
        if (stressCoverBps != 0 && total * stressCoverBps > fund.balance() * BPS) revert FundTooSmall();
        stressUsd = total;
    }

    /// (a − b) / BPS, floored at zero. Inputs already scaled by BPS.
    function _gap(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? (a - b) / BPS : 0;
    }

    /// Fund guardrail (owner 2026-10-25): crises only. Called only from a confirmed liquidation that cannot repay
    /// the issuers; asks for at most maxCoverBps of the position's lent value. The fund adds its own caps.
    function _cover(uint256 need, uint256 lentUsd) internal returns (uint256) {
        uint256 cap = lentUsd * maxCoverBps / BPS;
        return fund.cover(need < cap ? need : cap);
    }

    /// Issuers' USDC (borrow fee, share of a gain or of a liquidation rest): claimable from the vault.
    /// Splits a settled position's rest (after the validator bonus): at a liquidation the platform takes liqCutBps and
    /// the issuers sBps of the remainder; otherwise, on a gain of a position with a loan, the issuers take pBps and the
    /// platform gainBps of the gain (owner 2026-10-25). Pays both; the trader gets net − issuers − platform.
    function _outcome(uint8 kind, uint256 net, uint256 stake, Params memory pr, bool lends)
        internal
        returns (uint256 toIssuers, uint256 platform)
    {
        Fees memory f = fees;
        if (kind == K_LIQ) {
            platform = net * f.liqCutBps / BPS;
            toIssuers = (net - platform) * pr.sBps / BPS;
        } else if (lends && net > stake) {
            toIssuers = (net - stake) * pr.pBps / BPS;
            platform = (net - stake) * f.gainBps / BPS;
        }
        if (platform > 0) usd.safeTransfer(feeCollector, platform);
        _toIssuers(toIssuers);
    }

    function _toIssuers(uint256 amt) internal {
        if (amt == 0) return;
        usd.forceApprove(address(vault), amt);
        vault.addRewards(amt);
    }

    // ---- liquidation price guards (security review 2026-10-20) ---------------------------------
    // A sale may never fill more than liqMaxGap below the oracle, and while the oracle says the coins are worth at
    // least principal · (1 + liqMaxGap), it must return the FULL principal: a sandwich just makes it revert.

    function _liqMinOut(uint256 twapValue, uint256 principal) internal view returns (uint256 minOut) {
        minOut = twapValue * (BPS - liqMaxGapBps) / BPS;
        if (twapValue * BPS >= principal * (BPS + liqMaxGapBps) && minOut < principal) minOut = principal;
    }

    // ---- swaps: exact approvals, reset to zero after, booked from balance deltas -------------------

    function _swapIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut) internal returns (uint256 out) {
        uint256 before = IERC20(tokenOut).balanceOf(address(this));
        uint256 inBefore = IERC20(tokenIn).balanceOf(address(this));
        IERC20(tokenIn).forceApprove(address(adapter), amountIn);
        adapter.swapExactIn(tokenIn, tokenOut, amountIn, minOut, address(this));
        IERC20(tokenIn).forceApprove(address(adapter), 0);
        out = IERC20(tokenOut).balanceOf(address(this)) - before;
        if (out < minOut || inBefore - IERC20(tokenIn).balanceOf(address(this)) > amountIn) revert SwapShort();
    }

    function _swapOut(address tokenIn, address tokenOut, uint256 amountOut, uint256 maxIn) internal returns (uint256 used) {
        uint256 outBefore = IERC20(tokenOut).balanceOf(address(this));
        uint256 before = IERC20(tokenIn).balanceOf(address(this));
        IERC20(tokenIn).forceApprove(address(adapter), maxIn);
        adapter.swapExactOut(tokenIn, tokenOut, amountOut, maxIn, address(this));
        IERC20(tokenIn).forceApprove(address(adapter), 0);
        used = before - IERC20(tokenIn).balanceOf(address(this));
        if (used > maxIn || IERC20(tokenOut).balanceOf(address(this)) - outBefore < amountOut) revert SwapShort();
    }

    // ---- per side ------------------------------------------------------------------------------------

    function _open(address owner_, address payer, uint256 amount, uint8 m, uint256 minOut, uint256 limitPrice, uint16 slipBps)
        internal
        virtual
        returns (uint256 id);

    /// Hedge: the take-profit is above the entry. Short: below it.
    function _tpFits(uint256 entry, uint256 tp) internal pure virtual returns (bool);

    /// Short: the profit roof can never be switched off (at least a 20 % fall). Hedge: no roof.
    function _minRoofBps() internal pure virtual returns (uint16);

    function _canOpen(uint8 m, uint256 amount) internal view virtual returns (bool);

    /// The position and the price limit for its settlement, or a revert if `kind` is not allowed right now.
    function _due(uint256 id, uint8 kind, address v, uint256 arg) internal view virtual returns (Position memory, uint256);

    function _close(uint256 id, Position memory pos, uint8 kind, uint256 limit, address v) internal virtual;

    function isLiquidatable(uint256 id) external view virtual returns (bool);

    function isLimitReached(uint256 id) external view virtual returns (bool);
}
