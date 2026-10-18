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
        (,,,,,, uint128 equity, uint128 lent, uint128 coins,,) = pm.positions(id);
        assertEq(lent, 400 * USD, "L = (m-1)X");
        assertEq(usdVault.lent(), 400 * USD);
        // fees: holders 2 %, RSF 0.5 % + 0.03 % of L, borrow 0.2 % of L
        assertEq(usd.balanceOf(feeCollector), 2 * USD);
        assertEq(equity, 100 * USD - 2 * USD - 500_000 - 120_000 - 800_000);

        _move(1_000); // +10 %
        uint256 before = usd.balanceOf(trader);
        vm.prank(trader);
        pm.close(id, 0);
        uint256 got = usd.balanceOf(trader) - before;

        assertEq(usdVault.lent(), 0, "principal back");
        uint256 out = uint256(coins) * 2_200 * USD / 1e18;
        out = out * (10_000 - 5 - out * 10_000 / (10_000_000 * USD)) / 10_000;
        uint256 rest = out - 400 * USD;
        uint256 issuerShare = (rest - 100 * USD) * 2_500 / 10_000; // p = 25 % at 5×
        assertEq(got, rest - issuerShare, "trader gets rest minus p");
        assertEq(usdVault.totalAssets(), assetsBefore + 800_000 + issuerShare, "issuers: borrow fee + p");
    }

    function test_hedge_1x_noLoan_noLiquidation_issuersZero() public {
        uint256 id = _hedge(100 * USD, 1);
        (,,,,,,, uint128 lent,,,) = pm.positions(id);
        assertEq(lent, 0);
        _move(-5_000);
        assertFalse(pm.isLiquidatable(id), "1x never liquidates");
        _move(2_000);
        uint256 assets = usdVault.totalAssets();
        vm.prank(trader);
        pm.close(id, 0);
        assertEq(usdVault.totalAssets(), assets, "issuers get 0 % at 1x");
    }

    /// Contract trigger vs docs/backx/sim/sim3.py (v3): deep 30× hedge −1.84 %, 10× −7.29 %.
    function test_hedge_trigger_matches_sim() public {
        int256 t30 = _triggerBps(_hedge(100 * USD, 30), false);
        assertApproxEqAbs(t30, -184, 6, "30x");
        int256 t10 = _triggerBps(_hedge(100 * USD, 10), false);
        assertApproxEqAbs(t10, -729, 6, "10x");
    }

    function test_hedge_30x_liquidation_issuersWhole() public {
        uint256 assetsBefore = usdVault.totalAssets();
        uint256 id = _hedge(100 * USD, 30);
        _move(-190); // just past the −1.84 % trigger
        assertTrue(pm.isLiquidatable(id));
        uint256 fundBefore = hedgeFund.balance();
        vm.prank(keeper);
        pm.liquidate(id);
        assertEq(usdVault.lent(), 0);
        assertGe(usdVault.totalAssets(), assetsBefore, "issuers never lose on a normal liquidation");
        assertGe(hedgeFund.balance(), fundBefore, "fund untouched");
        assertGt(usd.balanceOf(trader), 1_000_000 * USD - 100 * USD, "trader keeps (1-s) of the rest");
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
        uint256 seed = hedgeFund.balance();
        vm.prank(address(pm));
        hedgeFund.cover(seed); // drain the seed
        usd.burn(address(pm), usd.balanceOf(address(pm)));
        uint256 id = _hedge(100 * USD, 30);
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
        (,,,,,,, uint128 q, uint128 held, uint128 issuerUsd,) = pm.positions(id);
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

    /// Contract trigger vs sim3 v3: deep 30× short +1.55 %, 10× +7.05 %.
    function test_short_trigger_matches_sim() public {
        int256 t30 = _triggerBps(_short(100 * USD, 30), true);
        assertApproxEqAbs(t30, 155, 6, "30x");
        int256 t10 = _triggerBps(_short(100 * USD, 10), true);
        assertApproxEqAbs(t10, 705, 8, "10x");
    }

    function test_short_30x_liquidation_issuersWhole() public {
        uint256 coinsBefore = tokenVault.totalAssets();
        uint256 id = _short(100 * USD, 30);
        _move(160);
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
        pm.openHedge(address(coin), 100 * USD, 30, 0);
    }

    function test_caps() public {
        vm.prank(safe);
        pm.setMarket(address(coin), _market(10, 0));
        vm.startPrank(trader);
        vm.expectRevert(BackxPositionManager.BadM.selector);
        pm.openHedge(address(coin), 100 * USD, 11, 0);
        vm.expectRevert(BackxPositionManager.BadM.selector);
        pm.openShort(address(coin), 100 * USD, 1, 0);
        vm.expectRevert(BackxPositionManager.TooLarge.selector);
        pm.openHedge(address(coin), 10_000 * USD, 10, 0);
        vm.expectRevert(BackxPositionManager.MarketOff.selector);
        pm.openHedge(address(0xBEEF), 100 * USD, 2, 0);
        vm.stopPrank();
    }

    function test_pauseStopsOpensNotCloses() public {
        uint256 id = _hedge(100 * USD, 5);
        vm.prank(safe);
        pm.pause();
        vm.prank(trader);
        vm.expectRevert();
        pm.openHedge(address(coin), 100 * USD, 5, 0);
        vm.prank(trader);
        pm.close(id, 0); // still works
    }

    function test_access() public {
        uint256 id = _hedge(100 * USD, 30);
        _move(-190);
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
