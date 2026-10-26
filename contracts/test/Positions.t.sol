// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {BackxManagerBase} from "../src/BackxManagerBase.sol";
import {BackxReserveVault} from "../src/BackxReserveVault.sol";
import {BackxReserveSecurityFund} from "../src/BackxReserveSecurityFund.sol";

contract HedgeTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD); // deep pool
    }

    function test_hedge_5x_up10_issuersFirstThenShare() public {
        uint256 id = _hedge(100 * USD, 5); // $100 paid, everything included
        BackxManagerBase.Position memory p = _pos(hm, id);
        // Owner 2026-10-19: the amount typed is the amount paid. Margin X = (100 − gas) / (1 + 2.5 % + 4 · 0.28 %).
        assertEq(p.stake, (100 * USD - USD / 2) * 10_000 / 10_362, "margin after fees");
        assertEq(p.lent, 4 * uint256(p.stake), "L = (m-1)X");
        assertEq(p.gas, USD / 2, "validator gas escrowed in the position");
        assertEq(usdVault.lent(), p.lent);
        uint256 paid = 1_000_000 * USD - usd.balanceOf(trader);
        assertLe(paid, 100 * USD, "never more than the amount typed");
        assertGe(paid, 100 * USD - 5, "the whole amount, minus rounding dust");
        assertEq(usd.balanceOf(feeCollector), uint256(p.stake) * 200 / 10_000);
        uint256 borrow = uint256(p.lent) * 25 / 10_000;

        _move(1_000); // +10 %
        uint256 before = usd.balanceOf(trader);
        vm.prank(trader);
        hm.close(id, 0);
        uint256 got = usd.balanceOf(trader) - before;

        assertEq(usdVault.lent(), 0, "principal back");
        uint256 out = uint256(p.amount) * 2_200 * USD / 1e18;
        out = out * (10_000 - 5 - out * 10_000 / (10_000_000 * USD)) / 10_000;
        uint256 rest = out - p.lent;
        uint256 issuerShare = (rest - p.stake) * 1_000 / 10_000; // p = 10 % (v4)
        uint256 platformShare = (rest - p.stake) * 200 / 10_000; // 2 % of the gain to the Treasury (owner 2026-10-25)
        assertEq(got, rest - issuerShare - platformShare, "trader gets rest minus p and the platform's 2 %");
        assertEq(usd.balanceOf(feeCollector), uint256(p.stake) * 200 / 10_000 + platformShare + p.gas,
            "open fee + gain share + the unused validator gas (own close: never refunded, owner 2026-10-26)");
        vm.warp(block.timestamp + 1 days); // rewards stream in over 24 h
        assertApproxEqAbs(usdVault.pendingRewards(issuer), borrow + issuerShare, 2, "issuers: borrow fee + p, claimable USDC");
        assertGt(got, 135 * USD, "$100 in at 5x, +10 %: about +$39 net");
    }

    function test_hedge_1x_noLoan_noLiquidation_issuersZero() public {
        uint256 fundBefore = hedgeFund.balance();
        uint256 id = _hedge(100 * USD, 1);
        assertEq(_pos(hm, id).lent, 0);
        // Owner 2026-10-25: a 1x hedge pays only the low platform fee (0.3 %) + gas, no fund fee.
        uint256 x = _pos(hm, id).stake;
        assertEq(x, (100 * USD - USD / 2) * 10_000 / 10_030, "margin after 0.3 %");
        assertEq(usd.balanceOf(feeCollector), x * 30 / 10_000, "platform fee to the Treasury");
        assertEq(hedgeFund.balance(), fundBefore, "no fund fee when nothing is lent");
        _move(-5_000);
        assertFalse(hm.isLiquidatable(id), "1x never liquidates");
        _move(2_000);
        vm.prank(trader);
        hm.close(id, 0);
        vm.warp(block.timestamp + 1 days);
        assertEq(usdVault.pendingRewards(issuer), 0, "issuers get 0 % at 1x");
    }

    /// Contract trigger vs web/src/lib/hedge.ts and docs/backx/sim/sim4.py (v4): deep 30× hedge −2.10 %, 10× −7.62 %.
    function test_hedge_trigger_matches_sim() public {
        assertApproxEqAbs(_triggerBps(hm, _hedge(100 * USD, 30), false), -210, 6, "30x");
        assertApproxEqAbs(_triggerBps(hm, _hedge(100 * USD, 10), false), -762, 6, "10x");
    }

    function test_hedge_30x_liquidation_issuersWhole_validatorPaid() public {
        uint256 assetsBefore = usdVault.totalAssets();
        uint256 id = _hedge(100 * USD, 30);
        _move(-215); // just past the −2.10 % trigger
        assertTrue(hm.isLiquidatable(id));
        uint256 fundBefore = hedgeFund.balance();
        uint256 traderBefore = usd.balanceOf(trader);
        vm.prank(validator); // anyone
        hm.liquidate(id);
        assertEq(usdVault.lent(), 0);
        assertGe(usdVault.totalAssets(), assetsBefore, "issuers never lose on a normal liquidation");
        assertGe(hedgeFund.balance(), fundBefore, "fund untouched");
        assertGt(usd.balanceOf(trader), traderBefore, "trader keeps (1-s) of the rest");
        assertGt(hm.claimable(validator), USD / 2, "validator: gas + accuracy bonus");
        vm.prank(validator);
        hm.claim();
        assertGt(usd.balanceOf(validator), USD / 2);
        assertEq(hm.claimable(validator), 0);
    }

    /// A validator who comes late still earns: the $0.50 gas plus the late floor (20 % of the max bonus), so an
    /// overdue liquidation is always worth picking up (owner 2026-10-26).
    function test_lateLiquidation_stillPaysFloor() public {
        uint256 id = _hedge(100 * USD, 2);
        int256 trig = _triggerBps(hm, id, false);
        _move(trig - 300); // 3 % further down: well past the 1 % accuracy window
        assertTrue(hm.isLiquidatable(id));
        vm.prank(validator);
        hm.liquidate(id);
        uint256 got = hm.claimable(validator);
        assertGe(got, USD / 2, "never below the $0.50 minimum");
        assertGt(got, USD / 2, "late floor bonus on top of the gas");
    }

    function test_hedge_30x_gap_fundCovers() public {
        uint256 assetsBefore = usdVault.totalAssets();
        uint256 id = _hedge(100 * USD, 30);
        _move(-1_000); // −10 % in one jump: far past the trigger
        uint256 fundBefore = hedgeFund.balance();
        vm.prank(validator);
        hm.liquidate(id);
        assertLt(hedgeFund.balance(), fundBefore, "fund paid the gap");
        assertGe(usdVault.totalAssets() + 1, assetsBefore, "issuers whole: fund covered it");
        assertEq(usdVault.lent(), 0);
        assertEq(hm.claimable(validator), USD / 2, "nothing left: still the $0.50 gas minimum");
    }

    function test_hedge_gap_fundEmpty_writeOff() public {
        uint256 id = _hedge(100 * USD, 30);
        usd.burn(address(hedgeFund), hedgeFund.balance()); // the fund is empty
        _move(-1_400);
        uint256 assetsBefore = usdVault.totalAssets();
        vm.prank(validator);
        hm.liquidate(id);
        assertEq(usdVault.lent(), 0, "written off, not stuck");
        assertLt(usdVault.totalAssets(), assetsBefore, "loss shared by issuers pro rata");
    }

    function test_hedge_ownerCannotCloseUnderwater() public {
        uint256 id = _hedge(100 * USD, 30);
        _move(-1_000);
        vm.prank(trader);
        vm.expectRevert(BackxManagerBase.Underwater.selector);
        hm.close(id, 0);
    }
}

contract ShortTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
    }

    function test_short_5x_down10_sameCoinsBack_usdcRewards() public {
        uint256 coinsBefore = tokenVault.totalAssets();
        uint256 id = _short(100 * USD, 5);
        BackxManagerBase.Position memory p = _pos(sm, id);
        assertEq(tokenVault.lent(), p.lent, "q coins lent");
        assertGt(p.amount, p.lentUsd, "holds margin + sale proceeds");

        _move(-1_000);
        uint256 before = usd.balanceOf(trader);
        vm.prank(trader);
        sm.close(id, type(uint256).max);
        assertEq(tokenVault.lent(), 0, "exactly q coins back");
        assertEq(tokenVault.totalAssets(), coinsBefore, "same number of coins: nothing sold for rewards");
        vm.warp(block.timestamp + 1 days);
        assertGt(tokenVault.pendingRewards(issuer), 0, "coin issuers earn USDC");
        assertGt(usd.balanceOf(trader) - before, 100 * USD, "short won");
        uint256 r = tokenVault.pendingRewards(issuer);
        vm.prank(issuer);
        tokenVault.claimRewards();
        assertEq(usd.balanceOf(issuer), r, "claimed in USDC");
    }

    /// Contract trigger vs web/src/lib/hedge.ts shortQuote (buffer as Hedge since 2026-10-25): deep 30× +2.06 %, 10× +7.55 %.
    function test_short_trigger_matches_sim() public {
        assertApproxEqAbs(_triggerBps(sm, _short(100 * USD, 30), true), 206, 6, "30x");
        assertApproxEqAbs(_triggerBps(sm, _short(100 * USD, 10), true), 755, 8, "10x");
    }

    /// Owner 2026-10-25: 20× short on a Major (2 % margin) must work: liquidation still above +0.5 %.
    function test_short_20x_major() public {
        _setCfg(sm, _cfg(20, 200, 8_000));
        int256 t = _triggerBps(sm, _short(100 * USD, 20), true);
        assertGt(t, 50);
        assertLt(t, 300);
    }

    function test_short_30x_liquidation_issuersWhole() public {
        uint256 coinsBefore = tokenVault.totalAssets();
        uint256 id = _short(100 * USD, 30);
        _move(215); // just past the +2.06 % trigger
        assertTrue(sm.isLiquidatable(id));
        vm.prank(validator);
        sm.liquidate(id);
        assertEq(tokenVault.lent(), 0);
        assertGe(tokenVault.totalAssets(), coinsBefore, "same number of coins back");
        assertGt(sm.claimable(validator), 0);
    }

    function test_short_30x_gap_fundBuysMissingCoins() public {
        uint256 coinsBefore = tokenVault.totalAssets();
        uint256 id = _short(100 * USD, 30);
        _move(1_000); // +10 % pump
        uint256 fundBefore = shortFund.balance();
        vm.prank(validator);
        sm.liquidate(id);
        assertLt(shortFund.balance(), fundBefore, "fund bought the missing coins");
        assertEq(tokenVault.lent(), 0);
        assertGe(tokenVault.totalAssets(), coinsBefore, "issuers whole in coins");
    }

    function test_short_ownerCannotCloseUnderwater() public {
        uint256 id = _short(100 * USD, 30);
        _move(1_000);
        vm.prank(trader);
        vm.expectRevert(BackxManagerBase.Underwater.selector);
        sm.close(id, type(uint256).max);
    }

    /// Profit roof: every short has one. At −80 % the roof closes it automatically (anyone can run it).
    function test_short_roof_autoCloses() public {
        uint256 id = _short(100 * USD, 2);
        BackxManagerBase.Position memory p = _pos(sm, id);
        assertEq(p.limitValue, uint256(p.lentUsd) * 2_000 / 10_000, "roof = cost of q at -80 %");
        _move(-7_900);
        assertFalse(sm.isLimitReached(id));
        _move(-8_000);
        assertTrue(sm.isLimitReached(id));
        uint256 before = usd.balanceOf(trader);
        vm.prank(validator);
        sm.executeLimit(id);
        assertEq(tokenVault.lent(), 0, "coins back while the market can still sell them");
        uint256 won = usd.balanceOf(trader) - before;
        assertGt(won, 230 * USD, "2x short, -80 %: about $236 back on $100 paid");
        assertLt(won, 240 * USD, "capped at the roof");
    }

    function test_short_roof_cannotBeRemoved() public {
        uint256 id = _short(100 * USD, 2);
        uint256 roof = _pos(sm, id).limitValue; // set to the roof at open
        vm.startPrank(trader);
        sm.setLimit(id, 0);
        assertEq(_pos(sm, id).limitValue, roof, "0 puts it back on the roof");
        sm.setLimit(id, 100 * USD); // −95 %: past the roof
        assertEq(_pos(sm, id).limitValue, roof);
        sm.setLimit(id, 1_500 * USD); // −25 %: earlier take-profit is fine
        assertGt(_pos(sm, id).limitValue, roof);
        vm.stopPrank();
    }

    function test_short_noCoinsIssued_maxM0() public {
        vm.startPrank(issuer);
        tokenVault.redeem(tokenVault.balanceOf(issuer), issuer, issuer);
        vm.stopPrank();
        assertEq(sm.maxMFor(100 * USD), 0, "no coins issued: no short yet");
        vm.prank(trader);
        vm.expectRevert(BackxReserveVault.OverUtilised.selector);
        sm.open(100 * USD, 2, 0, 0);
    }
}

contract GuardsTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
    }

    /// A one-block spot move without the oracle following cannot liquidate anyone.
    function test_spotSpikeAloneCannotLiquidate() public {
        uint256 h = _hedge(100 * USD, 30);
        uint256 s = _short(100 * USD, 30);
        pool.setSpotOnly(P0 * 9_000 / 10_000);
        assertFalse(hm.isLiquidatable(h), "hedge: oracle disagrees");
        pool.setSpotOnly(P0 * 11_000 / 10_000);
        assertFalse(sm.isLiquidatable(s), "short: oracle disagrees");
        vm.prank(validator);
        vm.expectRevert(BackxManagerBase.NotLiquidatable.selector);
        sm.liquidate(s);
    }

    function test_openFailsIfBornLiquidated_thinPool() public {
        _deploy(30, 56_000 * USD); // GAZZ-like pool
        vm.prank(trader);
        vm.expectRevert(); // TooLarge or WouldLiquidate: $3,000 notional in a $56k pool
        hm.open(100 * USD, 30, 0, 0);
    }

    function test_caps() public {
        _setCfg(hm, _cfg(10, 0, 0));
        BackxManagerBase.Config memory off = _cfg(10, 0, 8_000);
        off.enabled = false;
        _setCfg(sm, off);
        vm.startPrank(trader);
        vm.expectRevert(BackxManagerBase.BadM.selector);
        hm.open(100 * USD, 11, 0, 0);
        vm.expectRevert(BackxManagerBase.MarketOff.selector);
        sm.open(100 * USD, 1, 0, 0);
        vm.expectRevert(BackxManagerBase.TooLarge.selector);
        hm.open(10_000 * USD, 10, 0, 0);
        vm.stopPrank();
    }

    function test_pauseStopsOpensNotCloses() public {
        uint256 id = _hedge(100 * USD, 5);
        vm.prank(safe);
        hm.pause();
        vm.prank(trader);
        vm.expectRevert();
        hm.open(100 * USD, 5, 0, 0);
        vm.prank(trader);
        hm.close(id, 0); // still works
    }

    function test_access() public {
        uint256 id = _hedge(100 * USD, 30);
        _move(-215);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(BackxManagerBase.NotOwner.selector);
        hm.close(id, 0);
        vm.prank(makeAddr("stranger"));
        hm.liquidate(id); // open validators: anyone can liquidate a due position
        vm.expectRevert(); // only the Safe configures
        hm.setFees(BackxManagerBase.Fees(0, 0, 0, 0, 0, 0, 0, 0));
        vm.expectRevert(BackxManagerBase.OnlySelf.selector);
        hm.selfSettle(1, 1, address(this), 0);
    }

    function test_vault_onlyIdleWithdrawable_andUtilCap() public {
        uint256 id = _hedge(1_000 * USD, 30); // lends $29k
        assertEq(usdVault.maxWithdraw(issuer), usdVault.idle());
        uint256 all = usdVault.totalAssets();
        vm.prank(issuer);
        vm.expectRevert();
        usdVault.withdraw(all, issuer, issuer);
        vm.prank(trader);
        hm.close(id, 0);
        assertEq(usdVault.lent(), 0);
    }

    function test_paramBounds() public {
        vm.startPrank(safe);
        vm.expectRevert(BackxManagerBase.BadParams.selector);
        hm.setParams(30, BackxManagerBase.Params(100, 9000, 3000, 70)); // e below 5 %
        vm.expectRevert(BackxManagerBase.BadParams.selector);
        hm.setFees(BackxManagerBase.Fees(500, 50, 3, 20, 200, 30, 200, 500)); // platform above 3 %
        vm.expectRevert(BackxManagerBase.BadParams.selector);
        hm.setValidation(BackxManagerBase.Validation(uint64(6 * USD), 50, 10, 100, 1500, 2000)); // gas above $5
        vm.expectRevert(BackxManagerBase.BadParams.selector);
        hm.setConfig(_cfg(31, 0, 0));
        vm.stopPrank();
    }
}

/// Take-profit orders: filled by any validator once the oracle reaches the limit, never worse than limit − slip.
contract LimitTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
    }

    function test_hedge_limit_fillsAtTarget_validatorBonusLargestAtTarget() public {
        vm.prank(trader);
        uint256 a = hm.open(100 * USD, 5, 0, 2_200 * USD); // sell at $2,200 (+10 %)
        vm.prank(trader);
        uint256 b = hm.open(100 * USD, 5, 0, 2_200 * USD);
        _move(500);
        assertFalse(hm.isLimitReached(a));
        vm.prank(validator);
        vm.expectRevert(BackxManagerBase.LimitNotReached.selector);
        hm.executeLimit(a);

        _move(1_000); // exactly at the limit
        uint256 before = usd.balanceOf(trader);
        address v1 = makeAddr("v1");
        vm.prank(v1);
        hm.executeLimit(a);
        assertEq(_pos(hm, a).owner, address(0));
        assertGt(usd.balanceOf(trader) - before, 100 * USD, "trader took the profit");

        _move(1_080); // 0.8 % past the limit: a late fill earns a much smaller bonus
        address v2 = makeAddr("v2");
        vm.prank(v2);
        hm.executeLimit(b);
        assertGt(hm.claimable(v1), hm.claimable(v2), "more accurate, more reward");
        assertGt(hm.claimable(v2), USD / 2 - 1, "both get the gas");
        assertEq(usdVault.lent(), 0, "principal back first");
        assertEq(hm.stressUsd(), 0, "crash cover released");
    }

    function test_short_limit_fillsAtTarget() public {
        vm.prank(trader);
        uint256 id = sm.open(100 * USD, 5, 0, 1_800 * USD); // buy back at $1,800 (−10 %)
        _move(-500);
        assertFalse(sm.isLimitReached(id));
        _move(-1_000);
        uint256 before = usd.balanceOf(trader);
        vm.prank(validator);
        sm.executeLimit(id);
        assertEq(tokenVault.lent(), 0, "exactly q coins back");
        assertGt(usd.balanceOf(trader) - before, 100 * USD);
        assertEq(sm.stressUsd(), 0);
    }

    function test_hedge_stopLoss_sellsBeforeLiquidation() public {
        uint256 id = _hedge(100 * USD, 5); // liquidation near −12 %
        vm.prank(trader);
        hm.setStop(id, 1_900 * USD); // stop at −5 %
        _move(-300);
        assertFalse(hm.isLimitReached(id));
        _move(-600);
        assertTrue(hm.isLimitReached(id));
        assertFalse(hm.isLiquidatable(id));
        uint256 before = usd.balanceOf(trader);
        vm.prank(validator);
        hm.executeLimit(id);
        uint256 got = usd.balanceOf(trader) - before;
        assertGt(got, 50 * USD, "the stop kept most of the margin");
        assertLt(got, 100 * USD);
        assertEq(usdVault.lent(), 0, "principal back first");
        assertGt(hm.claimable(validator), USD / 2 - 1, "validator paid");
    }

    function test_short_stopLoss_buysBackOnRise() public {
        uint256 id = _short(100 * USD, 5);
        vm.prank(trader);
        sm.setStop(id, 2_100 * USD); // stop at +5 %
        _move(300);
        assertFalse(sm.isLimitReached(id));
        _move(600);
        assertTrue(sm.isLimitReached(id));
        vm.prank(validator);
        sm.executeLimit(id);
        assertEq(tokenVault.lent(), 0, "exactly q coins back");
        assertEq(_pos(sm, id).owner, address(0));
    }

    function test_stop_rules() public {
        uint256 h = _hedge(100 * USD, 5);
        uint256 s = _short(100 * USD, 5);
        vm.startPrank(trader);
        vm.expectRevert(BackxManagerBase.BadLimit.selector); // a hedge stop must be below today's price
        hm.setStop(h, 2_100 * USD);
        vm.expectRevert(BackxManagerBase.BadLimit.selector); // a short stop must be above today's price
        sm.setStop(s, 1_900 * USD);
        hm.setStop(h, 1_900 * USD);
        hm.setStop(h, 0); // cancel
        vm.stopPrank();
        assertEq(_pos(hm, h).stopValue, 0);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(BackxManagerBase.NotOwner.selector);
        hm.setStop(h, 1_900 * USD);
    }

    function test_limit_spikeAloneCannotFill() public {
        vm.prank(trader);
        uint256 id = hm.open(100 * USD, 5, 0, 2_200 * USD);
        pool.setSpotOnly(P0 * 12_000 / 10_000); // oracle still at $2,000
        assertFalse(hm.isLimitReached(id));
        vm.prank(validator);
        vm.expectRevert(BackxManagerBase.LimitNotReached.selector);
        hm.executeLimit(id);
    }

    function test_limit_rules() public {
        vm.startPrank(trader);
        vm.expectRevert(BackxManagerBase.BadLimit.selector); // hedge limit below today's price
        hm.open(100 * USD, 5, 0, 1_900 * USD);
        vm.expectRevert(BackxManagerBase.BadLimit.selector); // short limit above today's price
        sm.open(100 * USD, 5, 0, 2_100 * USD);
        uint256 id = hm.open(100 * USD, 5, 0, 0);
        hm.setLimit(id, 2_500 * USD);
        vm.stopPrank();
        assertGt(_pos(hm, id).limitValue, 0);

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(BackxManagerBase.NotOwner.selector);
        hm.setLimit(id, 3_000 * USD);

        vm.prank(trader);
        hm.setLimit(id, 0); // cancel
        _move(3_000);
        vm.prank(validator);
        vm.expectRevert(BackxManagerBase.LimitNotReached.selector);
        hm.executeLimit(id);
        vm.prank(trader);
        hm.close(id, 0); // closing by hand always works
    }
}

/// Entry orders (buy for Hedge, sell for Short): USDC escrowed, any validator opens the position when due.
contract OrderTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
    }

    function test_hedge_buyTheDip() public {
        vm.prank(trader);
        uint256 oid = hm.placeOrder(5, 100 * USD, 1_900 * USD, false, uint40(block.timestamp + 1 days), 0, 0);
        assertEq(usd.balanceOf(address(hm)), 100 * USD, "escrowed");
        assertFalse(hm.isOrderFillable(oid));
        vm.prank(validator);
        vm.expectRevert(BackxManagerBase.NotFillable.selector);
        hm.fillOrder(oid);
        _move(-500); // $1,900
        assertTrue(hm.isOrderFillable(oid));
        vm.prank(validator);
        hm.fillOrder(oid);
        uint256 id = hm.nextId() - 1;
        BackxManagerBase.Position memory p = _pos(hm, id);
        assertEq(p.owner, trader, "the position is the trader's");
        assertEq(p.m, 5);
        assertGt(hm.claimable(validator), USD / 2, "filler: gas + accuracy bonus");
    }

    function test_short_orderWaitsForIssuedCoins() public {
        vm.startPrank(issuer);
        tokenVault.redeem(tokenVault.balanceOf(issuer), issuer, issuer);
        vm.stopPrank();
        vm.prank(trader); // no coins issued yet: place the order, it fills when there are
        uint256 oid = sm.placeOrder(3, 100 * USD, 0, false, uint40(block.timestamp + 7 days), 0, 0);
        assertFalse(sm.isOrderFillable(oid), "nothing to borrow yet");
        vm.prank(issuer);
        tokenVault.deposit(10 * COIN, issuer);
        assertTrue(sm.isOrderFillable(oid));
        uint256[] memory ids = new uint256[](1);
        ids[0] = oid;
        vm.prank(validator);
        assertEq(sm.fillOrderBatch(ids), 1);
        assertGt(tokenVault.lent(), 0, "coins borrowed and sold");
        assertEq(sm.claimable(validator), USD / 2, "no trigger: gas only");
    }

    function test_cancelAndExpiry() public {
        uint256 before = usd.balanceOf(trader);
        vm.prank(trader);
        uint256 oid = hm.placeOrder(2, 100 * USD, 2_500 * USD, true, uint40(block.timestamp + 1 hours), 0, 0);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(BackxManagerBase.NotOwner.selector);
        hm.cancelOrder(oid);
        vm.warp(block.timestamp + 2 hours);
        assertFalse(hm.isOrderFillable(oid), "expired");
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        hm.cancelOrder(oid); // anyone clears an expired order: paid the order's gas, the rest goes home
        assertEq(hm.claimable(stranger), USD / 2, "whoever clears it earns the escrowed $0.50");
        assertEq(usd.balanceOf(trader), before - USD / 2);
    }

    function test_ownCancelIsFullRefund() public {
        uint256 before = usd.balanceOf(trader);
        vm.prank(trader);
        uint256 oid = hm.placeOrder(2, 100 * USD, 2_500 * USD, true, uint40(block.timestamp + 1 hours), 0, 0);
        vm.prank(trader);
        hm.cancelOrder(oid);
        assertEq(usd.balanceOf(trader), before, "own cancel: everything back");
    }

    /// The gas is fixed when the order is placed: a later change of validation.gasUsd never strands or shortchanges it.
    function test_orderGasFixedAtPlacement() public {
        vm.prank(trader);
        uint256 oid = hm.placeOrder(2, 100 * USD, 0, true, uint40(block.timestamp + 1 hours), 0, 0);
        BackxManagerBase.Validation memory v;
        (v.gasUsd, v.liqBonusBps, v.fillBonusBps, v.accuracyBps, v.restCapBps, v.lateBps) = hm.validation();
        v.gasUsd = uint64(2 * USD);
        vm.prank(safe);
        hm.setValidation(v);
        vm.prank(validator);
        hm.fillOrder(oid);
        assertEq(hm.claimable(validator), USD / 2, "filler gets the $0.50 escrowed at placement");
    }
}

/// Crash cover and the fund's guardrails (owner 2026-10-25: crises only).
contract FundTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
    }

    function test_gateOffByDefault_reservesUsedInFull() public {
        assertEq(hm.stressCoverBps(), 0);
        for (uint256 i; i < 200; i++) _hedge(100 * USD, 30);
        assertGt(hm.stressUsd(), hedgeFund.balance(), "exposure above the fund is allowed");
    }

    function test_onlyManagerDraws_andGuardrails() public {
        vm.prank(trader);
        vm.expectRevert(BackxReserveSecurityFund.NotManager.selector);
        hedgeFund.cover(1);
        uint256 bal = hedgeFund.balance();
        vm.prank(address(hm));
        uint256 paid = hedgeFund.cover(bal);
        assertEq(paid, bal / 4, "one payment at most 25 % of the fund");
        vm.prank(address(hm));
        paid = hedgeFund.cover(bal);
        assertApproxEqAbs(paid, bal * 3 / 16, 2, "next one 25 % of what is left");
        vm.prank(address(hm));
        hedgeFund.cover(bal);
        assertGe(hedgeFund.balance(), bal / 2, "never more than 50 % in 24 h");
        vm.warp(block.timestamp + 1 days);
        assertGt(hedgeFund.available(), 0, "a new window opens");
        vm.prank(trader);
        vm.expectRevert();
        hedgeFund.setLimits(0, 0);
    }

    function test_stressCoversRealGap() public {
        uint256 h = _hedge(100 * USD, 30);
        uint256 s = _short(100 * USD, 30);
        uint256 hs = _pos(hm, h).stressUsd;
        uint256 ss = _pos(sm, s).stressUsd;
        _move(-3_000);
        uint256 f0 = hedgeFund.balance();
        vm.prank(validator);
        hm.liquidate(h);
        assertLe(f0 - hedgeFund.balance(), hs * 105 / 100, "hedge gap within 5 % of the estimate");
        _move(3_000);
        f0 = shortFund.balance();
        vm.prank(validator);
        sm.liquidate(s);
        assertLe(f0 - shortFund.balance(), ss * 115 / 100, "short gap within 15 % of the estimate (swap costs on top)");
        assertEq(hm.stressUsd() + sm.stressUsd(), 0);
    }

    function test_shortPaysIntoItsOwnFund() public {
        uint256 f0 = shortFund.balance();
        uint256 h0 = hedgeFund.balance();
        _short(100 * USD, 5);
        assertGt(shortFund.balance(), f0, "the RSF fee is baked into every short");
        assertEq(hedgeFund.balance(), h0, "and kept apart from the hedge fund");
    }
}

/// Execution margin: liquidation comes earlier so a slow validator and a price discrepancy still repay issuers.
contract LiqMarginTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
        _setCfg(hm, _cfg(20, 100, 0)); // 1 % of the position
    }

    function test_trigger_matches_sim() public {
        assertApproxEqAbs(_triggerBps(hm, _hedge(100 * USD, 20), false), -270, 6);
    }

    function test_slowValidator_issuersWhole() public {
        uint256 assetsBefore = usdVault.totalAssets();
        uint256 id = _hedge(100 * USD, 20);
        _move(-270 - 150);
        uint256 fundBefore = hedgeFund.balance();
        vm.prank(validator);
        hm.liquidate(id);
        assertEq(usdVault.lent(), 0);
        assertGe(usdVault.totalAssets(), assetsBefore, "issuers whole");
        assertEq(hedgeFund.balance(), fundBefore, "fund untouched");
    }
}

/// Issuer rewards (owner 2026-10-25): USDC, claimable, split pro rata, streamed in over 24 h.
contract RewardsTest is Base {
    address issuer2 = makeAddr("issuer2");
    address jit = makeAddr("jit");

    function setUp() public {
        _deploy(5, 10_000_000 * USD);
        usd.mint(issuer2, 5_000_000 * USD);
        vm.startPrank(issuer2);
        usd.approve(address(usdVault), type(uint256).max);
        usdVault.deposit(5_000_000 * USD, issuer2); // same size as issuer: 50 / 50
        vm.stopPrank();
    }

    function _reward(uint256 amount) internal {
        usd.mint(address(hm), amount);
        vm.startPrank(address(hm));
        usd.approve(address(usdVault), amount);
        usdVault.addRewards(amount);
        vm.stopPrank();
    }

    function test_rewardsSplitProRata_andClaimable() public {
        uint256 assets = usdVault.totalAssets();
        _reward(10_000 * USD);
        assertEq(usdVault.totalAssets(), assets, "rewards are not principal");
        vm.warp(block.timestamp + 1 days);
        assertApproxEqAbs(usdVault.pendingRewards(issuer), 5_000 * USD, 2, "half");
        assertApproxEqAbs(usdVault.pendingRewards(issuer2), 5_000 * USD, 2, "half");
        address agent = makeAddr("agentWallet");
        vm.prank(issuer2);
        usdVault.claimRewardsTo(agent);
        assertApproxEqAbs(usd.balanceOf(agent), 5_000 * USD, 2, "claimed to any address");
        assertEq(usdVault.pendingRewards(issuer2), 0);
    }

    function test_claimRewardsFor_paysOwnerOnly_oneTxForAllPools() public {
        _reward(10_000 * USD);
        vm.warp(block.timestamp + 1 days);
        uint256 before = usd.balanceOf(issuer);
        address stranger = makeAddr("stranger");
        vm.prank(stranger); // e.g. the app's Multicall3 batch: anyone can trigger it, the money goes to the issuer
        uint256 got = usdVault.claimRewardsFor(issuer);
        assertApproxEqAbs(got, 5_000 * USD, 2);
        assertEq(usd.balanceOf(issuer) - before, got, "paid to the issuer");
        assertEq(usd.balanceOf(stranger), 0, "never to the caller");
        assertEq(usdVault.claimRewardsFor(issuer), 0, "nothing twice");
    }

    function test_justInTimeDepositGetsLittle() public {
        _reward(10_000 * USD);
        usd.mint(jit, 10_000_000 * USD);
        vm.startPrank(jit);
        usd.approve(address(usdVault), type(uint256).max);
        usdVault.deposit(10_000_000 * USD, jit); // half the pool, right after the reward
        vm.warp(block.timestamp + 1 hours);
        usdVault.redeem(usdVault.balanceOf(jit), jit, jit);
        vm.stopPrank();
        assertLt(usdVault.pendingRewards(jit), 10_000 * USD * 3 / 100, "under 3 % of a reward it did not back");
        vm.warp(block.timestamp + 1 days);
        assertGt(usdVault.pendingRewards(issuer) + usdVault.pendingRewards(issuer2), 9_700 * USD, "the backers keep the rest");
    }

    function test_transferMovesFutureRewardsOnly() public {
        _reward(10_000 * USD);
        vm.warp(block.timestamp + 1 days);
        uint256 shares = usdVault.balanceOf(issuer2);
        vm.prank(issuer2);
        usdVault.transfer(jit, shares);
        assertApproxEqAbs(usdVault.pendingRewards(issuer2), 5_000 * USD, 2, "earned rewards stay with the earner");
        assertEq(usdVault.pendingRewards(jit), 0);
    }

    function test_queuedSharesStopEarning() public {
        uint256 shares = usdVault.balanceOf(issuer2);
        _hedge(1_000 * USD, 20); // some money lent so the request waits
        vm.prank(issuer2);
        usdVault.requestRedeem(shares);
        _reward(10_000 * USD);
        vm.warp(block.timestamp + 1 days);
        assertApproxEqAbs(usdVault.pendingRewards(issuer), 10_000 * USD, 60 * USD, "all to the issuer still in (+ the hedge's borrow fee)");
    }

    function test_writeOffTakesStreamingRewardsFirst() public {
        _reward(10_000 * USD);
        uint256 before = usdVault.totalAssets();
        _hedge(100 * USD, 20);
        uint256 streaming = usdVault.rewardsStreaming();
        vm.prank(address(hm));
        usdVault.writeOff(1_000 * USD);
        assertApproxEqAbs(usdVault.rewardsStreaming(), streaming - 1_000 * USD, 2, "loss taken from rewards still streaming");
        assertGe(usdVault.totalAssets() + 2, before, "principal untouched");
    }
}

/// Multiplication follows the issued capital: a position can never borrow more than the reserve can lend.
contract ReserveLimitTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
        vm.startPrank(issuer);
        usdVault.withdraw(4_999_000 * USD, issuer, issuer); // $900 can be lent (90 % cap)
        vm.stopPrank();
    }

    function test_maxMFollowsAvailableUsdc() public {
        assertEq(hm.maxMFor(100 * USD), 10, "$900 available: (m-1)*$100 <= $900");
        assertEq(hm.maxMFor(1_000 * USD), 1, "too little for a $1,000 stake to multiply");
        vm.prank(trader);
        vm.expectRevert(BackxReserveVault.OverUtilised.selector);
        hm.open(100 * USD, 11, 0, 0);
        _hedge(100 * USD, 10);
        assertLe(hm.maxMFor(100 * USD), 1, "reserve used up");
        _hedge(100 * USD, 1); // 1× borrows nothing: always possible
    }

    function test_shortMaxMFollowsIssuedCoins() public {
        assertEq(sm.maxMFor(100 * USD), 30, "deep coin reserve: market cap");
        vm.startPrank(issuer);
        tokenVault.withdraw(2_499 * COIN + COIN / 2, issuer, issuer); // 0.5 coin ($1,000) left
        vm.stopPrank();
        assertLt(sm.maxMFor(100 * USD), 30, "thin coin reserve: less");
    }
}
