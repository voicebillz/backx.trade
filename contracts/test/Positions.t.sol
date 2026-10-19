// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {BackxPositionManager} from "../src/BackxPositionManager.sol";

contract HedgeTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD); // deep pool
    }

    function test_hedge_5x_up10_issuersFirstThenShare() public {
        uint256 assetsBefore = usdVault.totalAssets();
        uint256 id = _hedge(100 * USD, 5);
        (,,,,,, uint128 equity, uint128 lent, uint128 coins,,,,) = pm.positions(id);
        assertEq(lent, 400 * USD, "L = (m-1)X");
        assertEq(usdVault.lent(), 400 * USD);
        // v4: fees on top (holders 2 %, RSF 0.5 % + 0.03 % of L, borrow 0.25 % of L); equity = the full stake.
        assertEq(usd.balanceOf(feeCollector), 2 * USD);
        assertEq(equity, 100 * USD);
        assertEq(1_000_000 * USD - usd.balanceOf(trader), 100 * USD + 2 * USD + 500_000 + 120_000 + 1_000_000, "paid stake + fees");

        _move(1_000); // +10 %
        uint256 before = usd.balanceOf(trader);
        vm.prank(trader);
        pm.close(id, 0);
        uint256 got = usd.balanceOf(trader) - before;

        assertEq(usdVault.lent(), 0, "principal back");
        uint256 out = uint256(coins) * 2_200 * USD / 1e18;
        out = out * (10_000 - 5 - out * 10_000 / (10_000_000 * USD)) / 10_000;
        uint256 rest = out - 400 * USD;
        uint256 issuerShare = (rest - 100 * USD) * 1_000 / 10_000; // p = 10 % (v4)
        assertEq(got, rest - issuerShare, "trader gets rest minus p");
        assertEq(usdVault.totalAssets(), assetsBefore + 1_000_000 + issuerShare, "issuers: borrow fee + p");
        assertGt(got, 100 * USD + 49 * USD - 10 * USD, "5x, +10 %: about +$45 before the fees paid on top");
    }

    function test_hedge_1x_noLoan_noLiquidation_issuersZero() public {
        uint256 id = _hedge(100 * USD, 1);
        (,,,,,,, uint128 lent,,,,,) = pm.positions(id);
        assertEq(lent, 0);
        _move(-5_000);
        assertFalse(pm.isLiquidatable(id), "1x never liquidates");
        _move(2_000);
        uint256 assets = usdVault.totalAssets();
        vm.prank(trader);
        pm.close(id, 0);
        assertEq(usdVault.totalAssets(), assets, "issuers get 0 % at 1x");
    }

    /// Contract trigger vs web/src/lib/hedge.ts and docs/backx/sim/sim4.py (v4): deep 30× hedge −2.10 %, 10× −7.62 %.
    function test_hedge_trigger_matches_sim() public {
        int256 t30 = _triggerBps(_hedge(100 * USD, 30), false);
        assertApproxEqAbs(t30, -210, 6, "30x");
        int256 t10 = _triggerBps(_hedge(100 * USD, 10), false);
        assertApproxEqAbs(t10, -762, 6, "10x");
    }

    function test_hedge_30x_liquidation_issuersWhole() public {
        uint256 assetsBefore = usdVault.totalAssets();
        uint256 id = _hedge(100 * USD, 30);
        _move(-215); // just past the −2.10 % trigger
        assertTrue(pm.isLiquidatable(id));
        uint256 fundBefore = hedgeFund.balance();
        uint256 traderBefore = usd.balanceOf(trader);
        vm.prank(keeper);
        pm.liquidate(id);
        assertEq(usdVault.lent(), 0);
        assertGe(usdVault.totalAssets(), assetsBefore, "issuers never lose on a normal liquidation");
        assertGe(hedgeFund.balance(), fundBefore, "fund untouched");
        assertGt(usd.balanceOf(trader), traderBefore, "trader keeps (1-s) of the rest");
    }

    function test_hedge_30x_gap_fundCovers() public {
        uint256 assetsBefore = usdVault.totalAssets();
        uint256 id = _hedge(100 * USD, 30);
        _move(-1_000); // −10 % in one jump: far past the trigger
        uint256 fundBefore = hedgeFund.balance();
        vm.prank(keeper);
        pm.liquidate(id);
        assertLt(hedgeFund.balance(), fundBefore, "fund paid the gap");
        assertGe(usdVault.totalAssets() + 1, assetsBefore, "issuers whole: fund covered it");
        assertEq(usdVault.lent(), 0);
    }

    function test_hedge_gap_fundEmpty_writeOff() public {
        uint256 id = _hedge(100 * USD, 30); // opens while the fund still covers it
        uint256 seed = hedgeFund.balance();
        vm.prank(address(pm));
        hedgeFund.cover(seed); // then the fund is drained
        usd.burn(address(pm), usd.balanceOf(address(pm)));
        _move(-1_400);
        uint256 assetsBefore = usdVault.totalAssets();
        vm.prank(keeper);
        pm.liquidate(id);
        assertEq(usdVault.lent(), 0, "written off, not stuck");
        assertLt(usdVault.totalAssets(), assetsBefore, "loss shared by issuers pro rata");
    }

    function test_hedge_ownerCannotCloseUnderwater() public {
        uint256 id = _hedge(100 * USD, 30);
        _move(-1_000);
        vm.prank(trader);
        vm.expectRevert(BackxPositionManager.Underwater.selector);
        pm.close(id, 0);
    }
}

contract ShortTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
    }

    function test_short_5x_down10_tokensBackFirst() public {
        uint256 coinsBefore = tokenVault.totalAssets();
        uint256 id = _short(100 * USD, 5);
        (,,,,,,, uint128 q, uint128 held, uint128 issuerUsd,,,) = pm.positions(id);
        assertEq(tokenVault.lent(), q, "q coins lent");
        assertGt(held, 0);
        assertGt(issuerUsd, 0);

        _move(-1_000);
        uint256 before = usd.balanceOf(trader);
        vm.prank(trader);
        pm.close(id, type(uint256).max);
        assertEq(tokenVault.lent(), 0, "exactly q coins back");
        assertGt(tokenVault.totalAssets(), coinsBefore, "issuers earn in the coin");
        assertGt(usd.balanceOf(trader) - before, 100 * USD, "short won");
    }

    /// Contract trigger vs hedge.ts / sim4 (v4): deep 30× short +1.75 %, 10× +7.23 %.
    function test_short_trigger_matches_sim() public {
        int256 t30 = _triggerBps(_short(100 * USD, 30), true);
        assertApproxEqAbs(t30, 175, 6, "30x");
        int256 t10 = _triggerBps(_short(100 * USD, 10), true);
        assertApproxEqAbs(t10, 723, 8, "10x");
    }

    function test_short_30x_liquidation_issuersWhole() public {
        uint256 coinsBefore = tokenVault.totalAssets();
        uint256 id = _short(100 * USD, 30);
        _move(180);
        assertTrue(pm.isLiquidatable(id));
        vm.prank(keeper);
        pm.liquidate(id);
        assertEq(tokenVault.lent(), 0);
        assertGe(tokenVault.totalAssets(), coinsBefore, "same number of coins back, plus earnings");
    }

    function test_short_30x_gap_fundBuysMissingCoins() public {
        uint256 coinsBefore = tokenVault.totalAssets();
        uint256 id = _short(100 * USD, 30);
        _move(1_000); // +10 % pump
        uint256 fundBefore = shortFund.balance();
        vm.prank(keeper);
        pm.liquidate(id);
        assertLt(shortFund.balance(), fundBefore, "fund bought the missing coins");
        assertEq(tokenVault.lent(), 0);
        assertGe(tokenVault.totalAssets(), coinsBefore, "issuers whole in coins");
    }

    function test_short_ownerCannotCloseUnderwater() public {
        uint256 id = _short(100 * USD, 30);
        _move(1_000);
        vm.prank(trader);
        vm.expectRevert(BackxPositionManager.Underwater.selector);
        pm.close(id, type(uint256).max);
    }
}

contract GuardsTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
    }

    /// A one-block spot move without the TWAP following cannot liquidate anyone.
    function test_spotSpikeAloneCannotLiquidate() public {
        uint256 h = _hedge(100 * USD, 30);
        uint256 s = _short(100 * USD, 30);
        pool.setSpotOnly(P0 * 9_000 / 10_000);
        assertFalse(pm.isLiquidatable(h), "hedge: TWAP disagrees");
        pool.setSpotOnly(P0 * 11_000 / 10_000);
        assertFalse(pm.isLiquidatable(s), "short: TWAP disagrees");
        vm.prank(keeper);
        vm.expectRevert(BackxPositionManager.NotLiquidatable.selector);
        pm.liquidate(s);
    }

    function test_openFailsIfBornLiquidated_thinPool() public {
        _deploy(30, 56_000 * USD); // GAZZ-like pool
        vm.prank(trader);
        vm.expectRevert(); // TooLarge or WouldLiquidate: $3,000 notional in a $56k pool
        pm.openHedge(address(coin), 100 * USD, 30, 0, 0);
    }

    function test_caps() public {
        vm.prank(safe);
        pm.setMarket(address(coin), _market(10, 0));
        vm.startPrank(trader);
        vm.expectRevert(BackxPositionManager.BadM.selector);
        pm.openHedge(address(coin), 100 * USD, 11, 0, 0);
        vm.expectRevert(BackxPositionManager.BadM.selector);
        pm.openShort(address(coin), 100 * USD, 1, 0, 0);
        vm.expectRevert(BackxPositionManager.TooLarge.selector);
        pm.openHedge(address(coin), 10_000 * USD, 10, 0, 0);
        vm.expectRevert(BackxPositionManager.MarketOff.selector);
        pm.openHedge(address(0xBEEF), 100 * USD, 2, 0, 0);
        vm.stopPrank();
    }

    function test_pauseStopsOpensNotCloses() public {
        uint256 id = _hedge(100 * USD, 5);
        vm.prank(safe);
        pm.pause();
        vm.prank(trader);
        vm.expectRevert();
        pm.openHedge(address(coin), 100 * USD, 5, 0, 0);
        vm.prank(trader);
        pm.close(id, 0); // still works
    }

    function test_access() public {
        uint256 id = _hedge(100 * USD, 30);
        _move(-215);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(BackxPositionManager.NotOwner.selector);
        pm.close(id, 0);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(BackxPositionManager.NotKeeper.selector);
        pm.liquidate(id);
        vm.prank(safe);
        pm.setPermissionlessLiquidation(true);
        vm.prank(makeAddr("stranger"));
        pm.liquidate(id);
        vm.expectRevert(); // only the Safe configures
        pm.setFees(BackxPositionManager.Fees(0, 0, 0, 0, 0));
    }

    function test_vault_onlyIdleWithdrawable_andUtilCap() public {
        uint256 id = _hedge(1_000 * USD, 30); // lends $29k
        assertEq(usdVault.maxWithdraw(issuer), usdVault.idle());
        uint256 all = usdVault.totalAssets();
        vm.prank(issuer);
        vm.expectRevert();
        usdVault.withdraw(all, issuer, issuer);
        vm.prank(trader);
        pm.close(id, 0);
        assertEq(usdVault.lent(), 0);
    }

    function test_paramBounds() public {
        vm.startPrank(safe);
        vm.expectRevert(BackxPositionManager.BadParams.selector);
        pm.setParams(30, BackxPositionManager.Params(100, 9000, 3000, 70, 100)); // e below 5 %
        vm.expectRevert(BackxPositionManager.BadParams.selector);
        pm.setFees(BackxPositionManager.Fees(500, 50, 3, 20, 200)); // holders above 3 %
        vm.stopPrank();
    }
}

/// Take-profit (limit) orders: filled by a keeper once the TWAP reaches the limit, never worse than limit − slip.
contract LimitTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
    }

    function test_hedge_limit_fillsAtTarget() public {
        vm.prank(trader);
        uint256 id = pm.openHedge(address(coin), 100 * USD, 5, 0, 2_200 * USD); // sell at $2,200 (+10 %)
        _move(500);
        assertFalse(pm.isLimitReached(id));
        vm.prank(keeper);
        vm.expectRevert(BackxPositionManager.LimitNotReached.selector);
        pm.executeLimit(id);

        _move(1_000);
        assertTrue(pm.isLimitReached(id));
        uint256 before = usd.balanceOf(trader);
        vm.prank(keeper);
        pm.executeLimit(id);
        assertEq(usdVault.lent(), 0, "principal back first");
        assertGt(usd.balanceOf(trader) - before, 100 * USD, "trader took the profit");
        assertEq(pm.hedgeStressUsd(), 0, "crash cover released");
    }

    function test_short_limit_fillsAtTarget() public {
        vm.prank(trader);
        uint256 id = pm.openShort(address(coin), 100 * USD, 5, 0, 1_800 * USD); // buy back at $1,800 (−10 %)
        _move(-500);
        assertFalse(pm.isLimitReached(id));
        _move(-1_000);
        uint256 before = usd.balanceOf(trader);
        vm.prank(keeper);
        pm.executeLimit(id);
        assertEq(tokenVault.lent(), 0, "exactly q coins back");
        assertGt(usd.balanceOf(trader) - before, 100 * USD);
        assertEq(pm.shortStressUsd(), 0);
    }

    function test_limit_spikeAloneCannotFill() public {
        vm.prank(trader);
        uint256 id = pm.openHedge(address(coin), 100 * USD, 5, 0, 2_200 * USD);
        pool.setSpotOnly(P0 * 12_000 / 10_000); // TWAP still at $2,000
        assertFalse(pm.isLimitReached(id));
        vm.prank(keeper);
        vm.expectRevert(BackxPositionManager.LimitNotReached.selector);
        pm.executeLimit(id);
    }

    function test_limit_rules() public {
        vm.startPrank(trader);
        vm.expectRevert(BackxPositionManager.BadLimit.selector); // hedge limit below today's price
        pm.openHedge(address(coin), 100 * USD, 5, 0, 1_900 * USD);
        vm.expectRevert(BackxPositionManager.BadLimit.selector); // short limit above today's price
        pm.openShort(address(coin), 100 * USD, 5, 0, 2_100 * USD);
        uint256 id = pm.openHedge(address(coin), 100 * USD, 5, 0, 0);
        pm.setLimit(id, 2_500 * USD);
        vm.stopPrank();
        (,,,,,,,,,,, uint128 limitValue,) = pm.positions(id);
        assertGt(limitValue, 0);

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(BackxPositionManager.NotOwner.selector);
        pm.setLimit(id, 3_000 * USD);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(BackxPositionManager.NotKeeper.selector);
        pm.executeLimit(id);

        vm.prank(trader);
        pm.setLimit(id, 0); // cancel
        _move(3_000);
        vm.prank(keeper);
        vm.expectRevert(BackxPositionManager.LimitNotReached.selector);
        pm.executeLimit(id);
        vm.prank(trader);
        pm.close(id, 0); // closing by hand always works
    }
}

/// Crash cover: the open positions' worst-case gap per side may never exceed what that side's fund holds.
contract CrashCoverTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
    }

    /// Default: the gate is off and issuer reserves are used in full; exposure is still tracked.
    function test_gateOffByDefault_reservesUsedInFull() public {
        assertEq(pm.stressCoverBps(), 0);
        for (uint256 i; i < 200; i++) _hedge(100 * USD, 30); // ≈ $160k worst case vs a $100k fund
        assertGt(pm.hedgeStressUsd(), hedgeFund.balance(), "exposure above the fund is allowed");
    }

    function test_fundLimitsOpenPositions_whenSwitchedOn() public {
        vm.prank(safe);
        pm.setStressCover(10_000);
        // Hedge 30× $100, −30 % in one jump: L·c − E·(1 − c) = 2,900·0.3 − 100·0.7 = $800 per position.
        uint256 id = _hedge(100 * USD, 30);
        (,,,,,,,,,,,, uint128 stress) = pm.positions(id);
        assertApproxEqAbs(stress, 800 * USD, 1 * USD);
        // $100k fund: about 125 such positions, then it stops.
        uint256 n = 1;
        vm.startPrank(trader);
        while (true) {
            try pm.openHedge(address(coin), 100 * USD, 30, 0, 0) { n++; } catch (bytes memory err) {
                assertEq(bytes4(err), BackxPositionManager.FundTooSmall.selector);
                break;
            }
        }
        vm.stopPrank();
        assertApproxEqAbs(n, 125, 3);
        assertLe(pm.hedgeStressUsd(), hedgeFund.balance());
        // 1× borrows nothing: no crash risk, always allowed.
        _hedge(100 * USD, 1);
        // Shorts use their own fund.
        _short(100 * USD, 10);
    }

    /// The estimate is never below what the fund really pays when the crash happens in one jump.
    function test_stressCoversRealGap() public {
        uint256 h = _hedge(100 * USD, 30);
        uint256 s = _short(100 * USD, 30);
        (,,,,,,,,,,,, uint128 hs) = pm.positions(h);
        (,,,,,,,,,,,, uint128 ss) = pm.positions(s);
        _move(-3_000);
        uint256 f0 = hedgeFund.balance();
        vm.prank(keeper);
        pm.liquidate(h);
        assertLe(f0 - hedgeFund.balance(), uint256(hs) * 105 / 100, "hedge gap within 5 % of the estimate");
        _move(3_000);
        f0 = shortFund.balance();
        vm.prank(keeper);
        pm.liquidate(s);
        assertLe(f0 - shortFund.balance(), uint256(ss) * 110 / 100, "short gap within 10 % of the estimate");
        assertEq(pm.hedgeStressUsd() + pm.shortStressUsd(), 0);
    }

    function test_crashLevelsBounded() public {
        BackxPositionManager.Market memory mk = _market(30, 30);
        mk.crashBps = 0;
        vm.prank(safe);
        vm.expectRevert(BackxPositionManager.BadParams.selector);
        pm.setMarket(address(coin), mk);
        vm.prank(safe);
        vm.expectRevert(BackxPositionManager.BadParams.selector);
        pm.setStressCover(1_000);
        vm.prank(safe);
        pm.setStressCover(0); // off again
    }
}

/// Execution margin: liquidation comes earlier so a slow keeper and a price discrepancy still repay issuers.
contract LiqMarginTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
        BackxPositionManager.Market memory mk = _market(20, 0);
        mk.liqMarginBps = 100; // 1 % of the position, as the server's Major tier
        vm.prank(safe);
        pm.setMarket(address(coin), mk);
    }

    /// 20× deep with 1 % margin: web/src/lib/hedge.ts and sim5 say −2.7 %.
    function test_trigger_matches_sim() public {
        assertApproxEqAbs(_triggerBps(_hedge(100 * USD, 20), false), -270, 6);
    }

    /// The keeper is late: price is 1.5 % past the trigger when the sale fills. Issuers are still whole and the
    /// fund is not touched.
    function test_slowKeeper_issuersWhole() public {
        uint256 assetsBefore = usdVault.totalAssets();
        uint256 id = _hedge(100 * USD, 20);
        _move(-270 - 150);
        uint256 fundBefore = hedgeFund.balance();
        vm.prank(keeper);
        pm.liquidate(id);
        assertEq(usdVault.lent(), 0);
        assertGe(usdVault.totalAssets(), assetsBefore, "issuers whole");
        assertEq(hedgeFund.balance(), fundBefore, "fund untouched");
    }

    function test_marginBounded() public {
        BackxPositionManager.Market memory mk = _market(20, 0);
        mk.liqMarginBps = 600;
        vm.prank(safe);
        vm.expectRevert(BackxPositionManager.BadParams.selector);
        pm.setMarket(address(coin), mk);
    }
}
