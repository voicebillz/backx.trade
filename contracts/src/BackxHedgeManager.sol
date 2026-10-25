// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BackxManagerBase} from "./BackxManagerBase.sol";

/// @title backx.trade Hedge (price up): one per coin per chain.
/// @notice Fee model v4: the amount the trader pays IS the cost; fees and validator gas come out of it, the rest is
/// the margin X and the position is m · X. The USDC reserve lends L = (m − 1)·X; X + L buys the coin. On close the
/// coin is sold, the reserve gets L back FIRST, then p of the gain (or s of what is left after a liquidation) as
/// claimable USDC. Liquidation is measured on what selling the coins returns right now and must be confirmed by the
/// oracle. A gap is covered by the Hedge Reserve Security Fund (crises only), then written off pro rata.
contract BackxHedgeManager is BackxManagerBase {
    using SafeERC20 for IERC20;

    function initialize(Init calldata a) external initializer {
        _initBase(a, 30);
    }

    // ---- open / close ------------------------------------------------------------------------------

    function _open(address owner_, address payer, uint256 amount, uint8 m, uint256 minCoinsOut, uint256 limitPrice, uint16 slipBps)
        internal
        override
        returns (uint256 id)
    {
        Config memory c = config;
        if (!c.enabled) revert MarketOff();
        if (m == 0 || m > c.maxM) revert BadM();
        Fees memory f = fees;
        uint256 stake = _stakeFor(amount, uint256(m) - 1, f);
        uint256 lentUsd = (uint256(m) - 1) * stake;
        uint256 notional = stake + lentUsd;
        if (notional > c.maxNotionalUsd) revert TooLarge();
        if (openUsd + lentUsd > c.maxOpenUsd) revert OpenInterestFull();
        openUsd += lentUsd;
        (uint256 plBps, uint256 rsBps) = _rates(uint256(m) - 1, f);
        uint256 platform = stake * plBps / BPS;
        uint256 rsf = stake * rsBps / BPS + lentUsd * f.rsfLentBps / BPS;
        uint256 borrow = lentUsd * f.borrowBps / BPS;
        uint256 gas = validation.gasUsd;
        _collect(payer, stake + platform + rsf + borrow + gas, platform, rsf);
        // Worst case in one jump of stressBps: L·c − X·(1 − c) of the principal is not covered by the coins.
        uint256 stress = _gap(lentUsd * c.stressBps, stake * (BPS - (c.stressBps > BPS ? BPS : c.stressBps)));
        _addStress(stress);
        if (lentUsd > 0) {
            _toIssuers(borrow);
            vault.lend(lentUsd);
        }
        if (minCoinsOut == 0) minCoinsOut = oracle.tokenAmount(token, notional) * (BPS - slipBps) / BPS;
        uint256 coins = _swapIn(address(usd), token, notional, minCoinsOut);
        if (oracle.usdValue(token, coins) * BPS < notional * (BPS - f.oracleDevBps)) revert OracleMismatch();

        id = nextId++;
        positions[id] = Position({
            owner: owner_, m: m, openedAt: uint40(block.timestamp), gas: uint64(gas), stake: SafeCast.toUint128(stake),
            lent: SafeCast.toUint128(lentUsd), amount: SafeCast.toUint128(coins), lentUsd: SafeCast.toUint128(lentUsd),
            limitValue: 0, stressUsd: SafeCast.toUint128(stress)
        });
        if (m > 1 && _triggered(positions[id])) revert WouldLiquidate();
        if (limitPrice != 0) _setLimit(id, positions[id], limitPrice);
        emit Opened(id, owner_, m, stake, lentUsd, coins, positions[id].limitValue);
    }

    /// @notice Set, move or cancel (0) the take-profit of your position.
    function setLimit(uint256 id, uint256 limitPrice) external {
        Position storage pos = positions[id];
        if (pos.owner != msg.sender) revert NotOwner();
        _setLimit(id, pos, limitPrice);
    }

    function _setLimit(uint256 id, Position storage pos, uint256 limitPrice) internal {
        uint256 v;
        if (limitPrice != 0) {
            v = Math.mulDiv(pos.amount, limitPrice, 1e18);
            if (v <= oracle.usdValue(token, pos.amount)) revert BadLimit(); // a limit sells above today's price
        }
        pos.limitValue = SafeCast.toUint128(v);
        emit LimitSet(id, v);
    }

    // ---- validators --------------------------------------------------------------------------------

    function _due(uint256 id, uint8 kind, address v, uint256 arg) internal view override returns (Position memory pos, uint256) {
        pos = positions[id];
        if (kind == K_CLOSE) {
            if (pos.owner != v) revert NotOwner();
            return (pos, arg);
        }
        if (kind == K_LIQ) {
            if (pos.owner == address(0) || pos.m == 1 || !_triggered(pos)) revert NotLiquidatable();
            return (pos, 0);
        }
        uint256 value = oracle.usdValue(token, pos.amount);
        if (pos.owner == address(0) || pos.limitValue == 0 || value < pos.limitValue) revert LimitNotReached();
        // From today's price, not the limit: a late fill cannot hand the price move to a sandwich (review 2026-10-25).
        return (pos, value * (BPS - limitSlipBps) / BPS);
    }

    function isLiquidatable(uint256 id) external view override returns (bool) {
        Position memory pos = positions[id];
        return pos.owner != address(0) && pos.m > 1 && _triggered(pos);
    }

    function isLimitReached(uint256 id) external view override returns (bool) {
        Position memory pos = positions[id];
        return pos.owner != address(0) && pos.limitValue != 0 && oracle.usdValue(token, pos.amount) >= pos.limitValue;
    }

    /// @notice Liquidation threshold in USD (what the coins must fetch): principal·(1 + buf) + e·X + margin·N.
    function threshold(uint256 id) public view returns (uint256) {
        Position memory pos = positions[id];
        return _threshold(pos);
    }

    function _threshold(Position memory pos) internal view returns (uint256) {
        Params memory pr = _params[pos.m];
        return uint256(pos.lent) * (BPS + pr.bufBps) / BPS + uint256(pos.stake) * pr.eBps / BPS
            + (uint256(pos.stake) + pos.lent) * config.liqMarginBps / BPS;
    }

    /// Net exit (selling the coins now) at or below the threshold, and the oracle agrees.
    function _triggered(Position memory pos) internal view returns (bool) {
        uint256 t = _threshold(pos);
        if (adapter.quoteExactIn(token, address(usd), pos.amount) > t) return false;
        return oracle.usdValue(token, pos.amount) * BPS <= t * (BPS + twapConfirmBps);
    }

    /// @notice Highest multiplication a hedge paying `amount` can open with now: the market cap, limited by the
    /// USDC the issuers can lend, the max position and the open-interest cap. 0 = not even 1×.
    function maxMFor(uint256 amount) public view returns (uint8) {
        Config memory c = config;
        if (!c.enabled || amount <= validation.gasUsd) return 0;
        uint256 avail = vault.availableToLend();
        uint256 room = c.maxOpenUsd > openUsd ? c.maxOpenUsd - openUsd : 0;
        Fees memory f = fees;
        for (uint256 m = c.maxM; m >= 1; m--) {
            uint256 stake = _stakeFor(amount, m - 1, f);
            uint256 lent = (m - 1) * stake;
            if (lent <= avail && lent <= room && m * stake <= c.maxNotionalUsd) return uint8(m);
        }
        return 0;
    }

    function _canOpen(uint8 m, uint256 amount) internal view override returns (bool) {
        return maxMFor(amount) >= m;
    }

    // ---- settlement --------------------------------------------------------------------------------

    function _close(uint256 id, Position memory pos, uint8 kind, uint256 minUsdOut, address v) internal override {
        delete positions[id];
        openUsd -= pos.lentUsd;
        stressUsd -= pos.stressUsd;
        uint256 value = oracle.usdValue(token, pos.amount);
        uint256 target = kind == K_LIQ ? _threshold(pos) : pos.limitValue;
        if (kind == K_LIQ) minUsdOut = _liqMinOut(value, pos.lent);
        uint256 out = _swapIn(token, address(usd), pos.amount, minUsdOut);
        if (kind != K_LIQ && out < pos.lent) revert Underwater(); // past zero: validators settle it
        Params memory pr = _params[pos.m];

        uint256 toTrader;
        uint256 toIssuers;
        uint256 covered;
        uint256 writtenOff;
        uint256 bonus;
        if (out >= pos.lent) {
            uint256 rest = out - pos.lent;
            bonus = _settleBonus(kind, rest, value, target);
            if (pos.lent > 0) {
                usd.forceApprove(address(vault), pos.lent);
                vault.repay(pos.lent, 0);
            }
            uint256 platform;
            (toIssuers, platform) = _outcome(kind, rest - bonus, pos.stake, pr, pos.m > 1); // 1×: nothing to share
            toTrader = rest - bonus - toIssuers - platform;
        } else {
            // Gap: everything goes to the issuers. The fund covers only what the oracle confirms is missing (not a
            // loss a sandwich created inside the liqMaxGap band, review 2026-10-25); the rest is written off.
            uint256 shortfall = pos.lent - out;
            uint256 floor = value * (BPS - liqMaxGapBps / 2) / BPS; // swap cost, at most half the band below the oracle
            uint256 confirmed = floor < pos.lent ? pos.lent - floor : 0;
            covered = _cover(Math.min(shortfall, confirmed), pos.lentUsd);
            writtenOff = shortfall - covered;
            usd.forceApprove(address(vault), out + covered);
            vault.repay(out + covered, 0);
            if (writtenOff > 0) vault.writeOff(writtenOff);
        }
        if (kind == K_CLOSE) toTrader += pos.gas; // you settled it yourself: your gas comes back
        else _payValidator(v, id, kind, pos.gas, bonus);
        _payOwner(pos.owner, toTrader, kind == K_CLOSE);
        emit Closed(id, v, kind, toTrader, toIssuers, covered, writtenOff);
    }

    function _tpFits(uint256 entry, uint256 tp) internal pure override returns (bool) {
        return tp > entry;
    }

    function _minRoofBps() internal pure override returns (uint16) {
        return 0;
    }
}
