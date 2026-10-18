// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BackxReserveVault} from "./BackxReserveVault.sol";
import {BackxReserveSecurityFund} from "./BackxReserveSecurityFund.sol";
import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @title backx.trade positions: Hedge (price up) and Short (price down), real tokens on both sides.
/// @notice docs/backx/HEDGE-ISSUER-SPEC.md, SHORT-SPEC.md, FEES-AND-MARGINS.md.
///
/// Fee model v4 (docs/backx/sim/sim4.py): exposure is exactly m × stake and the fees are paid ON TOP of
/// the stake, so 5× on $100 is a $500 position and a 10 % move is $50 before fees and the issuers' share.
/// Hedge, stake X at multiplication m:
///   USD reserve lends L = (m-1)·X. X + L buys the coin. On close the coin is sold and the
///   USD reserve gets L back FIRST, then p of the gain (or s of what is left after a liquidation).
/// Short, stake X at multiplication m:
///   Token reserve lends q coins worth N = m·X. They are sold; the position holds C = X + proceeds in USD.
///   On close exactly q coins are bought back and returned FIRST, then the issuers' USD (borrow fee +
///   p of the gain, or s of the rest) is bought as the coin and added.
/// Liquidation is measured on what the position would actually get/pay on the pool right now (net of
/// fee and impact) and must be confirmed by the TWAP oracle, so a one-block spike cannot trigger it.
/// A gap (price past the trigger before the swap) is covered by the side's Reserve Security Fund first,
/// then written off pro rata against the reserve.
/// Crash exposure: every position adds its worst-case gap (the market's crash/pump in one jump) to a running
/// total per side, so the Safe can see how much a flash crash would cost the fund. Gating new positions on
/// it is OFF by default (owner 2026-10-18: issuer reserves are used in full; the fund is the last resort for
/// a crash the keepers cannot execute through) and the Safe can switch it on with setStressCover.
/// Limit (take-profit): the trader can set a price; a keeper sells (Hedge) or buys back (Short) once the
/// TWAP reaches it, never worse than the limit minus limitSlipBps.
contract BackxPositionManager is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;
    uint8 public constant MAX_M = 30;

    // ---- configuration ------------------------------------------------------------------------

    struct Market {
        bool enabled;
        BackxReserveVault usdVault;     // asset = usd, backs Hedges
        BackxReserveVault tokenVault;   // asset = the coin, backs Shorts (address(0) = no shorts)
        ISwapAdapter adapter;
        IPriceOracle oracle;
        uint8 maxHedgeM;
        uint8 maxShortM;                // 0 = shorts off
        uint128 maxNotionalUsd;         // per position: keeps impact ≈ ≤ 0.5 % per way
        uint128 maxOpenHedgeUsd;        // all hedges together, USD lent
        uint128 maxOpenShortUsd;        // all shorts together, USD value lent at open
        uint16 crashBps;                // Hedge crash cover: one-jump fall the fund must survive (e.g. 3000 = −30 %)
        uint16 pumpBps;                 // Short crash cover: one-jump rise the fund must survive (e.g. 10000 = +100 %)
        uint128 openHedgeUsd;
        uint128 openShortUsd;
    }

    /// @dev Per m (1..30). e = trader equity left at liquidation (the issuers' cushion), s = issuers' share
    /// of that rest, p = issuers' share of a gain, buf = extra margin on the issuers' principal.
    struct Params {
        uint16 eBps;
        uint16 sBps;
        uint16 pBps;
        uint16 bufHedgeBps;
        uint16 bufShortBps;
    }

    struct Fees {
        uint16 holdersBps;      // of stake → fee collector ($GAZZ / TANKS / treasury routing)
        uint16 rsfStakeBps;     // of stake → Reserve Security Fund
        uint16 rsfLentBps;      // of the amount lent → Reserve Security Fund
        uint16 borrowBps;       // of the amount lent → issuers
        uint16 oracleDevBps;    // max distance between pool execution and TWAP
    }

    IERC20 public immutable usd;
    BackxReserveSecurityFund public immutable hedgeFund;
    BackxReserveSecurityFund public immutable shortFund;
    address public feeCollector;
    Fees public fees;
    bool public permissionlessLiquidation;
    /// @notice How far below (sell) / above (buy) the TWAP a liquidation may execute. Wide enough to settle in
    /// a crash, narrow enough that a sandwich around the keeper cannot drain the issuers.
    uint16 public liqMaxGapBps = 1_500;
    /// @notice How close the TWAP must be to the trigger to confirm a liquidation. Must stay well under the
    /// smallest liquidation distance (≈1.5 % at 30×), or a one-block spot spike could liquidate.
    uint16 public twapConfirmBps = 25;
    /// @notice A limit close may fill at most this much worse than the limit (pool fee + impact).
    uint16 public limitSlipBps = 100;
    /// @notice 0 = off (default). Otherwise the share of the worst-case gap total the fund must hold before a
    /// new position opens: 10 000 = every open position crashing at once.
    uint16 public stressCoverBps;
    /// @notice Worst-case gap of all open positions, per side (USD). Must stay covered by that side's fund.
    uint256 public hedgeStressUsd;
    uint256 public shortStressUsd;
    mapping(address => bool) public keepers;
    mapping(address => Market) public markets;
    Params[MAX_M + 1] internal _params;

    // ---- positions ------------------------------------------------------------------------------

    struct Position {
        address owner;
        address token;
        bool isShort;
        uint8 m;
        uint40 openedAt;
        uint128 stake;
        uint128 equity;       // E
        uint128 lent;         // hedge: USD lent. short: coins lent (q)
        uint128 amount;       // hedge: coins held. short: USD held (C)
        uint128 issuerUsd;    // short: borrow fee waiting to be bought as the coin at close
        uint128 lentUsd;      // USD value lent at open (open-interest accounting)
        uint128 limitValue;   // take-profit: hedge = USD the coins must fetch, short = USD the q coins may cost. 0 = none
        uint128 stressUsd;    // this position's share of the side's worst-case gap
    }

    mapping(uint256 => Position) public positions;
    uint256 public nextId = 1;

    // ---- events / errors ------------------------------------------------------------------------

    event MarketSet(address indexed token);
    event ParamsSet(uint8 m, Params p);
    event FeesSet(Fees f);
    event KeeperSet(address keeper, bool on);
    event Opened(uint256 indexed id, address indexed owner, address indexed token, bool isShort, uint8 m, uint256 stake, uint256 lent, uint256 amount);
    event Closed(uint256 indexed id, bool liquidated, uint256 toTrader, uint256 toIssuers, uint256 covered, uint256 writtenOff);
    event LimitSet(uint256 indexed id, uint256 limitValue);
    event LimitFilled(uint256 indexed id);

    error MarketOff();
    error BadM();
    error TooLarge();
    error OpenInterestFull();
    error NotOwner();
    error NotKeeper();
    error NotLiquidatable();
    error WouldLiquidate();
    error OracleMismatch();
    error Underwater();
    error BadParams();
    error BadLimit();
    error LimitNotReached();
    error FundTooSmall();

    constructor(IERC20 usd_, BackxReserveSecurityFund hedgeFund_, BackxReserveSecurityFund shortFund_, address feeCollector_, address owner_)
        Ownable(owner_)
    {
        usd = usd_;
        hedgeFund = hedgeFund_;
        shortFund = shortFund_;
        feeCollector = feeCollector_;
        fees = Fees({holdersBps: 200, rsfStakeBps: 50, rsfLentBps: 3, borrowBps: 25, oracleDevBps: 200});
        // e, s and buffers from docs/backx/sim/sim3.py (v3): e floor ≈ 12 % at high m, buffer grows past 10×.
        // p (issuers' share of a gain) is a flat 10 % since v4: sim4 shows it barely moves the issuers'
        // expected income (that comes from the borrow fee and liquidations) but cut the trader's win by a third.
        uint16[31] memory e = [uint16(0), 4000, 4000, 3500, 3250, 3000, 2750, 2500, 2375, 2250, 2000,
            1920, 1840, 1760, 1680, 1600, 1560, 1520, 1480, 1440, 1400, 1380, 1360, 1340, 1320, 1300, 1280, 1260, 1240, 1220, 1200];
        uint16[31] memory s = [uint16(0), 5000, 5000, 6000, 6500, 7000, 7500, 8000, 8167, 8333, 8500,
            8600, 8700, 8800, 8900, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000];
        for (uint8 m = 1; m <= MAX_M; m++) {
            uint16 extra = m > 10 ? uint16(2 * (m - 10)) : 0; // +0.02 % per step past 10×
            _params[m] = Params(e[m], s[m], 1000, 30 + extra, 60 + extra);
        }
    }

    // ---- owner (the Safe) ------------------------------------------------------------------------

    function setMarket(address token, Market calldata mk) external onlyOwner {
        if (mk.maxHedgeM > MAX_M || mk.maxShortM > MAX_M) revert BadM();
        // Crash cover may not be switched off: at least a 20 % jump each way, at most −100 % / +500 %.
        if (mk.crashBps < 2_000 || mk.crashBps > BPS || mk.pumpBps < 2_000 || mk.pumpBps > 50_000) revert BadParams();
        Market storage cur = markets[token];
        uint128 oh = cur.openHedgeUsd;
        uint128 os = cur.openShortUsd;
        markets[token] = mk;
        markets[token].openHedgeUsd = oh; // open interest is never reset by config
        markets[token].openShortUsd = os;
        emit MarketSet(token);
    }

    function setParams(uint8 m, Params calldata pr) external onlyOwner {
        if (m == 0 || m > MAX_M) revert BadM();
        if (pr.eBps < 500 || pr.eBps > 6000 || pr.sBps > 9500 || pr.pBps > 5000 || pr.bufHedgeBps > 500 || pr.bufShortBps > 500) {
            revert BadParams();
        }
        _params[m] = pr;
        emit ParamsSet(m, pr);
    }

    function setFees(Fees calldata f) external onlyOwner {
        if (f.holdersBps > 300 || f.rsfStakeBps > 200 || f.rsfLentBps > 50 || f.borrowBps > 100 || f.oracleDevBps > 1000) {
            revert BadParams();
        }
        fees = f;
        emit FeesSet(f);
    }

    function setFeeCollector(address c) external onlyOwner {
        feeCollector = c;
    }

    function setLiqMaxGap(uint16 bps) external onlyOwner {
        if (bps < 200 || bps > 5_000) revert BadParams();
        liqMaxGapBps = bps;
    }

    function setTwapConfirm(uint16 bps) external onlyOwner {
        if (bps > 100) revert BadParams();
        twapConfirmBps = bps;
    }

    function setLimitSlip(uint16 bps) external onlyOwner {
        if (bps < 10 || bps > 500) revert BadParams();
        limitSlipBps = bps;
    }

    function setStressCover(uint16 bps) external onlyOwner {
        if (bps != 0 && (bps < 2_000 || bps > BPS)) revert BadParams();
        stressCoverBps = bps;
    }

    function setKeeper(address k, bool on) external onlyOwner {
        keepers[k] = on;
        emit KeeperSet(k, on);
    }

    function setPermissionlessLiquidation(bool on) external onlyOwner {
        permissionlessLiquidation = on;
    }

    /// @notice Stops NEW positions only. Closing and liquidation always work.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function params(uint8 m) external view returns (Params memory) {
        return _params[m];
    }

    // ---- open ------------------------------------------------------------------------------------

    /// @param stake margin X; the trader pays X + fees (holders, RSF, borrow) on top.
    /// @param minCoinsOut slippage guard for buying the coin (from the UI quote).
    /// @param limitPrice take-profit in USD base units per 1e18 coin base units, above today's price. 0 = none.
    function openHedge(address token, uint256 stake, uint8 m, uint256 minCoinsOut, uint256 limitPrice)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 id)
    {
        Market storage mk = markets[token];
        if (!mk.enabled) revert MarketOff();
        if (m == 0 || m > mk.maxHedgeM) revert BadM();
        Fees memory f = fees;

        uint256 lentUsd = (uint256(m) - 1) * stake;
        uint256 holders = stake * f.holdersBps / BPS;
        uint256 rsf = stake * f.rsfStakeBps / BPS + lentUsd * f.rsfLentBps / BPS;
        uint256 borrow = lentUsd * f.borrowBps / BPS;
        usd.safeTransferFrom(msg.sender, address(this), stake + holders + rsf + borrow);
        uint256 equity = stake;
        uint256 notional = equity + lentUsd; // = m · stake
        if (notional > mk.maxNotionalUsd) revert TooLarge();
        if (mk.openHedgeUsd + lentUsd > mk.maxOpenHedgeUsd) revert OpenInterestFull();
        mk.openHedgeUsd += SafeCast.toUint128(lentUsd);

        usd.safeTransfer(feeCollector, holders);
        usd.safeTransfer(address(hedgeFund), rsf);
        // Worst case in one jump of crashBps: L·c − E·(1 − c) of the principal is not covered by the coins.
        uint256 stress = _gap(lentUsd * mk.crashBps, equity * (BPS - mk.crashBps));
        _addStress(false, stress);
        if (lentUsd > 0) {
            usd.forceApprove(address(mk.usdVault), borrow);
            mk.usdVault.addEarnings(borrow);
            mk.usdVault.lend(lentUsd);
        }

        uint256 coins = _swapIn(mk.adapter, address(usd), token, notional, minCoinsOut);
        // Execution must be in line with the TWAP (no buying into a manipulated pool).
        if (mk.oracle.usdValue(token, coins) * BPS < notional * (BPS - f.oracleDevBps)) revert OracleMismatch();

        id = nextId++;
        positions[id] = Position({
            owner: msg.sender, token: token, isShort: false, m: m, openedAt: uint40(block.timestamp),
            stake: SafeCast.toUint128(stake), equity: SafeCast.toUint128(equity), lent: SafeCast.toUint128(lentUsd), amount: SafeCast.toUint128(coins),
            issuerUsd: 0, lentUsd: SafeCast.toUint128(lentUsd), limitValue: 0, stressUsd: SafeCast.toUint128(stress)
        });
        if (m > 1 && _hedgeTriggered(positions[id], mk)) revert WouldLiquidate();
        if (limitPrice != 0) _setLimit(id, positions[id], limitPrice);
        emit Opened(id, msg.sender, token, false, m, stake, lentUsd, coins);
    }

    /// @param stake margin X; the trader pays X + fees (holders, RSF, borrow) on top.
    /// @param minUsdOut slippage guard for selling the borrowed coins.
    /// @param limitPrice take-profit in USD base units per 1e18 coin base units, below today's price. 0 = none.
    function openShort(address token, uint256 stake, uint8 m, uint256 minUsdOut, uint256 limitPrice)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 id)
    {
        Market storage mk = markets[token];
        if (!mk.enabled || address(mk.tokenVault) == address(0)) revert MarketOff();
        if (m == 0 || m > mk.maxShortM) revert BadM();
        Fees memory f = fees;

        uint256 notional = uint256(m) * stake;
        if (notional > mk.maxNotionalUsd) revert TooLarge();
        if (mk.openShortUsd + notional > mk.maxOpenShortUsd) revert OpenInterestFull();
        uint256 holders = stake * f.holdersBps / BPS;
        uint256 borrow = notional * f.borrowBps / BPS;
        uint256 rsf = stake * f.rsfStakeBps / BPS + notional * f.rsfLentBps / BPS;
        // The borrow fee stays in the position and is bought as the coin for the issuers at close.
        usd.safeTransferFrom(msg.sender, address(this), stake + holders + rsf + borrow);
        uint256 equity = stake;
        mk.openShortUsd += SafeCast.toUint128(notional);

        usd.safeTransfer(feeCollector, holders);
        usd.safeTransfer(address(shortFund), rsf);
        // Worst case in one jump of pumpBps: buying q back costs N·(1 + c) but the position holds ≈ E + N.
        uint256 stress = _gap(notional * mk.pumpBps, equity * BPS);
        _addStress(true, stress);

        uint256 q = mk.oracle.tokenAmount(token, notional);
        mk.tokenVault.lend(q);
        uint256 proceeds = _swapIn(mk.adapter, token, address(usd), q, minUsdOut);
        if (proceeds * BPS < notional * (BPS - f.oracleDevBps)) revert OracleMismatch();

        id = nextId++;
        positions[id] = Position({
            owner: msg.sender, token: token, isShort: true, m: m, openedAt: uint40(block.timestamp),
            stake: SafeCast.toUint128(stake), equity: SafeCast.toUint128(equity), lent: SafeCast.toUint128(q), amount: SafeCast.toUint128(equity + proceeds),
            issuerUsd: SafeCast.toUint128(borrow), lentUsd: SafeCast.toUint128(notional), limitValue: 0,
            stressUsd: SafeCast.toUint128(stress)
        });
        if (_shortTriggered(positions[id], mk)) revert WouldLiquidate();
        if (limitPrice != 0) _setLimit(id, positions[id], limitPrice);
        emit Opened(id, msg.sender, token, true, m, stake, q, equity + proceeds);
    }

    // ---- close / liquidate -----------------------------------------------------------------------

    /// @param limit hedge: min USD out of the sale. short: max USD into the buy-back.
    function close(uint256 id, uint256 limit) external nonReentrant {
        Position memory pos = positions[id];
        if (pos.owner != msg.sender) revert NotOwner();
        if (pos.isShort) _closeShort(id, pos, false, limit);
        else _closeHedge(id, pos, false, limit);
    }

    function liquidate(uint256 id) external nonReentrant {
        if (!permissionlessLiquidation && !keepers[msg.sender]) revert NotKeeper();
        Position memory pos = positions[id];
        if (pos.owner == address(0)) revert NotLiquidatable();
        Market storage mk = markets[pos.token];
        if (pos.isShort) {
            if (!_shortTriggered(pos, mk)) revert NotLiquidatable();
            _closeShort(id, pos, true, type(uint256).max);
        } else {
            if (pos.m == 1 || !_hedgeTriggered(pos, mk)) revert NotLiquidatable();
            _closeHedge(id, pos, true, 0);
        }
    }

    /// @notice Set, move or cancel (0) the take-profit of an open position.
    function setLimit(uint256 id, uint256 limitPrice) external {
        Position storage pos = positions[id];
        if (pos.owner != msg.sender) revert NotOwner();
        _setLimit(id, pos, limitPrice);
    }

    /// @notice Closes a position at its limit once the TWAP has reached it (a one-block spike cannot).
    /// Hedge: the sale must fetch ≥ limit − limitSlip. Short: the buy-back may cost ≤ limit + limitSlip.
    /// The trader gets the normal close: principal to the issuers first, then p of the gain.
    function executeLimit(uint256 id) external nonReentrant {
        if (!permissionlessLiquidation && !keepers[msg.sender]) revert NotKeeper();
        Position memory pos = positions[id];
        if (pos.owner == address(0) || pos.limitValue == 0) revert LimitNotReached();
        Market storage mk = markets[pos.token];
        if (pos.isShort) {
            if (mk.oracle.usdValue(pos.token, pos.lent) > pos.limitValue) revert LimitNotReached();
            _closeShort(id, pos, false, uint256(pos.limitValue) * (BPS + limitSlipBps) / BPS);
        } else {
            if (mk.oracle.usdValue(pos.token, pos.amount) < pos.limitValue) revert LimitNotReached();
            _closeHedge(id, pos, false, uint256(pos.limitValue) * (BPS - limitSlipBps) / BPS);
        }
        emit LimitFilled(id);
    }

    function isLimitReached(uint256 id) external view returns (bool) {
        Position memory pos = positions[id];
        if (pos.owner == address(0) || pos.limitValue == 0) return false;
        Market storage mk = markets[pos.token];
        return pos.isShort
            ? mk.oracle.usdValue(pos.token, pos.lent) <= pos.limitValue
            : mk.oracle.usdValue(pos.token, pos.amount) >= pos.limitValue;
    }

    function isLiquidatable(uint256 id) external view returns (bool) {
        Position memory pos = positions[id];
        if (pos.owner == address(0)) return false;
        Market storage mk = markets[pos.token];
        return pos.isShort ? _shortTriggered(pos, mk) : (pos.m > 1 && _hedgeTriggered(pos, mk));
    }

    // ---- limit + crash cover --------------------------------------------------------------------

    function _setLimit(uint256 id, Position storage pos, uint256 limitPrice) internal {
        uint256 v;
        if (limitPrice != 0) {
            uint256 units = pos.isShort ? pos.lent : pos.amount;
            v = Math.mulDiv(units, limitPrice, 1e18);
            uint256 nowValue = markets[pos.token].oracle.usdValue(pos.token, units);
            // Hedge sells above today's price, Short buys back below it (else it is not a limit, it is a close).
            if (v == 0 || (pos.isShort ? v >= nowValue : v <= nowValue)) revert BadLimit();
        }
        pos.limitValue = SafeCast.toUint128(v);
        emit LimitSet(id, v);
    }

    /// (a − b) / BPS, floored at zero. Inputs already scaled by BPS.
    function _gap(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? (a - b) / BPS : 0;
    }

    /// Tracks the side's worst-case gap; when the Safe has switched the gate on, the fund must cover it.
    function _addStress(bool isShort, uint256 stress) internal {
        if (stress == 0) return;
        uint256 total = (isShort ? shortStressUsd : hedgeStressUsd) + stress;
        if (stressCoverBps != 0) {
            uint256 fund = (isShort ? shortFund : hedgeFund).balance();
            if (total * stressCoverBps > fund * BPS) revert FundTooSmall();
        }
        if (isShort) shortStressUsd = total;
        else hedgeStressUsd = total;
    }

    // ---- triggers -------------------------------------------------------------------------------

    function _hedgeThreshold(Position memory pos) internal view returns (uint256) {
        Params memory pr = _params[pos.m];
        return uint256(pos.lent) * (BPS + pr.bufHedgeBps) / BPS + uint256(pos.equity) * pr.eBps / BPS;
    }

    /// Net exit (what selling the coins returns now) at or below principal·(1+buf) + e·E, and the TWAP agrees.
    function _hedgeTriggered(Position memory pos, Market storage mk) internal view returns (bool) {
        uint256 threshold = _hedgeThreshold(pos);
        uint256 netExit = mk.adapter.quoteExactIn(pos.token, address(usd), pos.amount);
        if (netExit > threshold) return false;
        uint256 twap = mk.oracle.usdValue(pos.token, pos.amount);
        return twap * BPS <= threshold * (BPS + twapConfirmBps);
    }

    /// Buy-back cost·(1+buf) at or above C − e·E, and the TWAP agrees.
    function _shortTriggered(Position memory pos, Market storage mk) internal view returns (bool) {
        Params memory pr = _params[pos.m];
        uint256 eCut = uint256(pos.equity) * pr.eBps / BPS;
        uint256 limit = pos.amount > eCut ? pos.amount - eCut : 0;
        uint256 cost = mk.adapter.quoteExactOut(address(usd), pos.token, pos.lent);
        if (cost * (BPS + pr.bufShortBps) < limit * BPS) return false;
        uint256 twap = mk.oracle.usdValue(pos.token, pos.lent);
        return twap * (BPS + pr.bufShortBps) * BPS >= limit * BPS * (BPS - twapConfirmBps);
    }

    // ---- settlement -----------------------------------------------------------------------------

    function _closeHedge(uint256 id, Position memory pos, bool liquidated, uint256 minUsdOut) internal {
        Market storage mk = markets[pos.token];
        delete positions[id];
        mk.openHedgeUsd -= pos.lentUsd;
        hedgeStressUsd -= pos.stressUsd;

        // A liquidation may not sell more than liqMaxGap below the TWAP (no sandwich at the trigger).
        if (liquidated) minUsdOut = mk.oracle.usdValue(pos.token, pos.amount) * (BPS - liqMaxGapBps) / BPS;
        uint256 out = _swapIn(mk.adapter, pos.token, address(usd), pos.amount, minUsdOut);
        if (!liquidated && out < pos.lent) revert Underwater(); // past zero: keepers settle it
        Params memory pr = _params[pos.m];

        uint256 toTrader;
        uint256 toIssuers;
        uint256 covered;
        uint256 writtenOff;
        if (out >= pos.lent) {
            uint256 rest = out - pos.lent;
            if (liquidated) {
                toIssuers = rest * pr.sBps / BPS;
            } else if (rest > pos.stake && pos.m > 1) {
                // 1× borrows nothing: issuers get 0 %.
                toIssuers = (rest - pos.stake) * pr.pBps / BPS;
            }
            toTrader = rest - toIssuers;
            if (pos.lent > 0 || toIssuers > 0) {
                usd.forceApprove(address(mk.usdVault), pos.lent + toIssuers);
                mk.usdVault.repay(pos.lent, toIssuers);
            }
        } else {
            // Gap: everything goes to the issuers, the fund covers the rest, then a write-off.
            uint256 shortfall = pos.lent - out;
            covered = hedgeFund.cover(shortfall);
            writtenOff = shortfall - covered;
            usd.forceApprove(address(mk.usdVault), out + covered);
            mk.usdVault.repay(out + covered, 0);
            if (writtenOff > 0) mk.usdVault.writeOff(writtenOff);
        }
        if (toTrader > 0) usd.safeTransfer(pos.owner, toTrader);
        emit Closed(id, liquidated, toTrader, toIssuers, covered, writtenOff);
    }

    function _closeShort(uint256 id, Position memory pos, bool liquidated, uint256 maxUsdIn) internal {
        Market storage mk = markets[pos.token];
        delete positions[id];
        mk.openShortUsd -= pos.lentUsd;
        shortStressUsd -= pos.stressUsd;
        Params memory pr = _params[pos.m];

        uint256 cost = mk.adapter.quoteExactOut(address(usd), pos.token, pos.lent);
        uint256 toTrader;
        uint256 toIssuersUsd = pos.issuerUsd;
        uint256 covered;
        uint256 writtenOff;

        if (liquidated) {
            // A liquidation may not buy back more than liqMaxGap above the TWAP (no sandwich at the trigger).
            maxUsdIn = mk.oracle.usdValue(pos.token, pos.lent) * (BPS + liqMaxGapBps) / BPS;
        }
        if (cost <= pos.amount) {
            if (cost > maxUsdIn) revert Underwater();
            uint256 paid = _swapOut(mk.adapter, address(usd), pos.token, pos.lent, pos.amount < maxUsdIn ? pos.amount : maxUsdIn);
            uint256 rest = pos.amount - paid;
            uint256 share;
            if (liquidated) share = rest * pr.sBps / BPS;
            else if (rest > pos.stake) share = (rest - pos.stake) * pr.pBps / BPS;
            toTrader = rest - share;
            toIssuersUsd += share;
            IERC20(pos.token).forceApprove(address(mk.tokenVault), pos.lent);
            mk.tokenVault.repay(pos.lent, 0);
        } else {
            if (!liquidated) revert Underwater(); // owner cannot close a position past zero: keepers settle it
            // Gap: spend all USD (incl. the issuers' borrow fee) on the coin, the fund buys what is missing.
            uint256 budget = pos.amount + pos.issuerUsd;
            toIssuersUsd = 0;
            uint256 minGot = mk.oracle.tokenAmount(pos.token, budget) * (BPS - liqMaxGapBps) / BPS;
            uint256 got = _swapIn(mk.adapter, address(usd), pos.token, budget, minGot);
            uint256 missing = got >= pos.lent ? 0 : pos.lent - got;
            if (missing > 0) {
                uint256 need = mk.adapter.quoteExactOut(address(usd), pos.token, missing);
                covered = shortFund.cover(need);
                if (covered >= need) {
                    uint256 used = _swapOut(mk.adapter, address(usd), pos.token, missing, covered);
                    got += missing;
                    if (covered > used) usd.safeTransfer(address(shortFund), covered - used);
                    covered = used;
                } else if (covered > 0) {
                    got += _swapIn(mk.adapter, address(usd), pos.token, covered, 0);
                }
            }
            // Any coins beyond the principal (budget covered more than q) go to the issuers as earnings.
            uint256 principalBack = got > pos.lent ? pos.lent : got;
            uint256 extra = got - principalBack;
            writtenOff = pos.lent - principalBack; // in coins
            IERC20(pos.token).forceApprove(address(mk.tokenVault), got);
            mk.tokenVault.repay(principalBack, extra);
            if (writtenOff > 0) mk.tokenVault.writeOff(writtenOff);
        }

        // Issuers' USD (borrow fee + share) is bought as the coin: the token reserve stays one asset.
        uint256 issuerCoins;
        if (toIssuersUsd > 0) {
            uint256 minCoins = mk.oracle.tokenAmount(pos.token, toIssuersUsd) * (BPS - fees.oracleDevBps) / BPS;
            issuerCoins = _swapIn(mk.adapter, address(usd), pos.token, toIssuersUsd, minCoins);
            IERC20(pos.token).forceApprove(address(mk.tokenVault), issuerCoins);
            mk.tokenVault.addEarnings(issuerCoins);
        }
        if (toTrader > 0) usd.safeTransfer(pos.owner, toTrader);
        emit Closed(id, liquidated, toTrader, issuerCoins, covered, writtenOff);
    }

    // ---- swaps: exact approvals, reset to zero after -------------------------------------------

    function _swapIn(ISwapAdapter a, address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        internal
        returns (uint256 out)
    {
        IERC20(tokenIn).forceApprove(address(a), amountIn);
        out = a.swapExactIn(tokenIn, tokenOut, amountIn, minOut, address(this));
        IERC20(tokenIn).forceApprove(address(a), 0);
    }

    function _swapOut(ISwapAdapter a, address tokenIn, address tokenOut, uint256 amountOut, uint256 maxIn)
        internal
        returns (uint256 used)
    {
        IERC20(tokenIn).forceApprove(address(a), maxIn);
        used = a.swapExactOut(tokenIn, tokenOut, amountOut, maxIn, address(this));
        IERC20(tokenIn).forceApprove(address(a), 0);
    }
}
