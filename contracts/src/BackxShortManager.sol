// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BackxManagerBase} from "./BackxManagerBase.sol";

/// @title backx.trade Short (price down), old-school: borrow the coin, sell it, buy it back. One per coin per chain.
/// @notice docs/backx/SHORT-SPEC.md (redesign 2026-10-25), sim: docs/backx/sim/short_roof.py.
/// Issuers deposit the COIN itself (PONS, BTC …) into the coin's reserve; Hedge issuers deposit USDC.
/// The trader pays `amount` USDC; fees and validator gas come out of it, the rest is the margin X.
/// q coins worth m · X are borrowed and sold; the position holds C = X + sale proceeds in USDC.
/// Every swap cost both ways is the trader's: on close exactly q coins are bought back and returned to the
/// issuers FIRST, so they always get the same number of coins back, plus USDC rewards (borrow fee + p of the
/// gain, or s of the rest after a liquidation), claimable from the reserve.
/// Profit roof: the short closes automatically when the price has fallen roofBps (Major 80 % … Small 50 %): the
/// gain is paid from C, never from issuers, and the coins are bought back while the market can still sell them.
/// Price up: liquidated when C ≤ (1 + margin) · buy-back cost. A gap goes to the Short Reserve Security Fund
/// (crises only), the rest is written off in coins. No coins issued yet? Place an order: it fills when they are.
contract BackxShortManager is BackxManagerBase {
    using SafeERC20 for IERC20;

    function initialize(Init calldata a) external initializer {
        _initBase(a, 30); // buffer as Hedge: the short margin (2–5 %) is already larger
    }

    // ---- open / close ------------------------------------------------------------------------------

    function _open(address owner_, address payer, uint256 amount, uint8 m, uint256 minUsdOut, uint256 limitPrice, uint16 slipBps)
        internal
        override
        returns (uint256 id)
    {
        Config memory c = config;
        if (!c.enabled) revert MarketOff();
        if (m == 0 || m > c.maxM) revert BadM();
        Fees memory f = fees;
        uint256 stake = _stakeFor(amount, m, f);
        uint256 notional = uint256(m) * stake;
        if (notional > c.maxNotionalUsd) revert TooLarge();
        if (openUsd + notional > c.maxOpenUsd) revert OpenInterestFull();
        openUsd += notional;
        uint256 platform = stake * f.platformBps / BPS;
        uint256 rsf = stake * f.rsfStakeBps / BPS + notional * f.rsfLentBps / BPS;
        uint256 borrow = notional * f.borrowBps / BPS;
        uint256 gas = validation.gasUsd;
        _collect(payer, stake + platform + rsf + borrow + gas, platform, rsf);
        _toIssuers(borrow); // the coin's issuers earn USDC, claimable
        // Worst case in one jump of stressBps: buying q back costs N·(1 + c) but the position holds ≈ X + N.
        uint256 stress = _gap(notional * c.stressBps, stake * BPS);
        _addStress(stress);

        uint256 q = oracle.tokenAmount(token, notional);
        vault.lend(q);
        if (minUsdOut == 0) minUsdOut = notional * (BPS - slipBps) / BPS;
        uint256 proceeds = _swapIn(token, address(usd), q, minUsdOut);
        if (proceeds * BPS < notional * (BPS - f.oracleDevBps)) revert OracleMismatch();

        id = nextId++;
        positions[id] = Position({
            owner: owner_, m: m, openedAt: uint40(block.timestamp), gas: uint64(gas), stake: SafeCast.toUint128(stake),
            lent: SafeCast.toUint128(q), amount: SafeCast.toUint128(stake + proceeds), lentUsd: SafeCast.toUint128(notional),
            limitValue: 0, stressUsd: SafeCast.toUint128(stress)
        });
        if (_triggered(positions[id])) revert WouldLiquidate();
        _setLimit(id, positions[id], limitPrice);
        emit Opened(id, owner_, m, stake, q, stake + proceeds, positions[id].limitValue);
    }

    /// @notice Move the take-profit; 0 (or anything past the roof) puts it back on the roof. It cannot be removed.
    function setLimit(uint256 id, uint256 limitPrice) external {
        Position storage pos = positions[id];
        if (pos.owner != msg.sender) revert NotOwner();
        _setLimit(id, pos, limitPrice);
    }

    function _setLimit(uint256 id, Position storage pos, uint256 limitPrice) internal {
        uint256 roof = uint256(pos.lentUsd) * (BPS - config.roofBps) / BPS;
        uint256 v = limitPrice == 0 ? 0 : Math.mulDiv(pos.lent, limitPrice, 1e18);
        if (v != 0 && v >= oracle.usdValue(token, pos.lent)) revert BadLimit(); // a limit buys back below today's price
        if (v < roof) v = roof;
        pos.limitValue = SafeCast.toUint128(v);
        emit LimitSet(id, v);
    }

    // ---- validators --------------------------------------------------------------------------------

    /// Close: your own. Liquidation: price up to the threshold. Take-profit or roof: the oracle says buying the q
    /// coins back costs at most the limit.
    function _due(uint256 id, uint8 kind, address v, uint256 arg) internal view override returns (Position memory pos, uint256) {
        pos = positions[id];
        if (kind == K_CLOSE) {
            if (pos.owner != v) revert NotOwner();
            return (pos, arg);
        }
        if (kind == K_LIQ) {
            if (pos.owner == address(0) || !_triggered(pos)) revert NotLiquidatable();
            return (pos, type(uint256).max);
        }
        uint256 value = oracle.usdValue(token, pos.lent);
        if (pos.owner == address(0) || pos.limitValue == 0 || value > pos.limitValue) revert LimitNotReached();
        // From today's price, not the limit: a late roof / take-profit fill cannot hand the move to a sandwich.
        return (pos, value * (BPS + limitSlipBps) / BPS);
    }

    function isLiquidatable(uint256 id) external view override returns (bool) {
        Position memory pos = positions[id];
        return pos.owner != address(0) && _triggered(pos);
    }

    function isLimitReached(uint256 id) external view override returns (bool) {
        Position memory pos = positions[id];
        return pos.owner != address(0) && pos.limitValue != 0 && oracle.usdValue(token, pos.lent) <= pos.limitValue;
    }

    /// @notice Liquidation threshold: the buy-back cost (USD) at which the short is liquidated.
    function threshold(uint256 id) public view returns (uint256) {
        return _threshold(positions[id]);
    }

    /// (C − e·X − margin·N) / (1 + buf): the buy-back cost that still leaves the issuers' cushion.
    function _threshold(Position memory pos) internal view returns (uint256) {
        Params memory pr = _params[pos.m];
        uint256 cut = uint256(pos.stake) * pr.eBps / BPS + uint256(pos.lentUsd) * config.liqMarginBps / BPS;
        return pos.amount > cut ? (pos.amount - cut) * BPS / (BPS + pr.bufBps) : 0;
    }

    /// Buy-back cost on the pool at or above the threshold, and the oracle agrees.
    function _triggered(Position memory pos) internal view returns (bool) {
        uint256 t = _threshold(pos);
        if (adapter.quoteExactOut(address(usd), token, pos.lent) < t) return false;
        return oracle.usdValue(token, pos.lent) * BPS >= t * (BPS - twapConfirmBps);
    }

    /// @notice Highest multiplication a short paying `amount` can open with now: the market cap, limited by the
    /// coins the issuers can lend, the max position and the open-interest cap. 0 = no coins issued yet.
    function maxMFor(uint256 amount) public view returns (uint8) {
        Config memory c = config;
        if (!c.enabled || amount <= validation.gasUsd) return 0;
        uint256 avail = vault.availableToLend();
        uint256 room = c.maxOpenUsd > openUsd ? c.maxOpenUsd - openUsd : 0;
        Fees memory f = fees;
        for (uint256 m = c.maxM; m >= 1; m--) {
            uint256 n = m * _stakeFor(amount, m, f);
            if (n <= room && n <= c.maxNotionalUsd && oracle.tokenAmount(token, n) <= avail) return uint8(m);
        }
        return 0;
    }

    function _canOpen(uint8 m, uint256 amount) internal view override returns (bool) {
        return maxMFor(amount) >= m;
    }

    // ---- settlement --------------------------------------------------------------------------------

    function _close(uint256 id, Position memory pos, uint8 kind, uint256 maxUsdIn, address v) internal override {
        delete positions[id];
        openUsd -= pos.lentUsd;
        stressUsd -= pos.stressUsd;
        Params memory pr = _params[pos.m];
        uint256 value = oracle.usdValue(token, pos.lent); // oracle cost of the q coins
        uint256 target = kind == K_LIQ ? _threshold(pos) : pos.limitValue;
        uint256 cost = adapter.quoteExactOut(address(usd), token, pos.lent);
        if (kind == K_LIQ) maxUsdIn = value * (BPS + liqMaxGapBps) / BPS;

        uint256 toTrader;
        uint256 toIssuers;
        uint256 covered;
        uint256 writtenOff;
        uint256 bonus;
        // Liquidation: the ORACLE decides whether there is a gap, never the pool (a pushed spot price must not steer a
        // healthy liquidation into the fund or take the trader's rest; review 2026-10-25).
        bool gap = kind == K_LIQ ? maxUsdIn > pos.amount : cost > pos.amount;
        if (!gap) {
            if (cost > maxUsdIn) revert Underwater(); // the pool is off the oracle (or past your limit): try again
            uint256 paid = _swapOut(address(usd), token, pos.lent, Math.min(pos.amount, maxUsdIn));
            uint256 rest = pos.amount - paid;
            if (kind == K_LIQ) {
                bonus = Math.min(rest, _accuracyBonus(value * validation.liqBonusBps / BPS, value, target));
                toIssuers = (rest - bonus) * pr.sBps / BPS;
            } else {
                if (kind == K_LIMIT) bonus = Math.min(rest, _accuracyBonus(value * validation.fillBonusBps / BPS, value, target));
                if (rest - bonus > pos.stake) toIssuers = (rest - bonus - pos.stake) * pr.pBps / BPS;
            }
            toTrader = rest - bonus - toIssuers;
            IERC20(token).forceApprove(address(vault), pos.lent);
            vault.repay(pos.lent, 0);
            _toIssuers(toIssuers);
        } else {
            if (kind != K_LIQ) revert Underwater(); // past zero: validators settle it
            // Gap: the fund adds what the oracle confirms is missing (within its guardrails), then ONE purchase
            // buys the coins, never more than liqMaxGap worse than the oracle. Short of q: written off in coins.
            // Swap cost included, but never more than half the liqMaxGap band above the oracle.
            uint256 fair = Math.min(cost, value * (BPS + liqMaxGapBps / 2) / BPS);
            covered = _cover(fair > pos.amount ? fair - pos.amount : 0, pos.lentUsd);
            uint256 budget = pos.amount + covered;
            uint256 got;
            if (budget >= cost) {
                // Enough to buy back every coin lent: buy exactly that (budget ≤ the oracle band), the rest back to the fund.
                uint256 left = budget - _swapOut(address(usd), token, pos.lent, budget);
                if (left > 0) usd.safeTransfer(address(fund), left);
                got = pos.lent;
            } else {
                got = _swapIn(address(usd), token, budget, oracle.tokenAmount(token, budget) * (BPS - liqMaxGapBps) / BPS);
            }
            uint256 back = got > pos.lent ? pos.lent : got;
            writtenOff = pos.lent - back; // in coins
            IERC20(token).forceApprove(address(vault), got);
            vault.repay(back, got - back); // coins beyond the principal stay with the issuers
            if (writtenOff > 0) vault.writeOff(writtenOff);
        }
        if (kind == K_CLOSE) toTrader += pos.gas;
        else _payValidator(v, id, kind, pos.gas, bonus);
        _payOwner(pos.owner, toTrader, kind == K_CLOSE);
        emit Closed(id, v, kind, toTrader, toIssuers, covered, writtenOff);
    }

    function _tpFits(uint256 entry, uint256 tp) internal pure override returns (bool) {
        return tp < entry;
    }

    /// The roof can be tuned per market but never switched off: at least a 20 % fall closes a short.
    function _minRoofBps() internal pure override returns (uint16) {
        return 2_000;
    }
}
