// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {BackxManagerBase} from "../src/BackxManagerBase.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {BackxMarketFactory} from "../src/BackxMarketFactory.sol";
import {BackxReserveVault} from "../src/BackxReserveVault.sol";
import {BackxReserveSecurityFund} from "../src/BackxReserveSecurityFund.sol";

/// Security review 2026-10-20 (+ open validators 2026-10-25): the attacks the review looked for, each one shown to fail.
contract SecurityTest is Base {
    address attacker = makeAddr("attacker");

    function setUp() public {
        _deploy(5, 10_000_000 * USD);
        _setCfg(hm, _cfg(20, 150, 0)); // Major tier after the review
    }

    /// Liquidation sandwich: the position is at its trigger, the attacker crashes the pool in the same block and
    /// liquidates to sell the coins cheap. The sale may not leave the issuers short: it reverts.
    function test_liquidationSandwich_cannotTouchPrincipal() public {
        uint256 assetsBefore = usdVault.totalAssets();
        uint256 id = _hedge(1_000 * USD, 20);
        int256 t = _triggerBps(hm, id, false);
        _move(t - 5);
        assertTrue(hm.isLiquidatable(id));
        pool.setSpotOnly(P0 * uint256(10_000 + t - 5 - 1_000) / 10_000); // spot 10 % lower in the same block
        vm.prank(attacker);
        vm.expectRevert();
        hm.liquidate(id);
        _move(t - 5);
        vm.prank(attacker);
        hm.liquidate(id);
        assertEq(usdVault.lent(), 0);
        assertGe(usdVault.totalAssets(), assetsBefore, "issuers whole");
    }

    /// A smaller squeeze that stays inside the 2 % band still leaves the issuers whole and the fund untouched.
    function test_smallSqueeze_issuersStillWhole() public {
        uint256 assetsBefore = usdVault.totalAssets();
        uint256 fundBefore = hedgeFund.balance();
        uint256 id = _hedge(1_000 * USD, 20);
        int256 t = _triggerBps(hm, id, false);
        _move(t - 5);
        pool.setSpotOnly(P0 * uint256(10_000 + t - 5 - 150) / 10_000);
        vm.prank(attacker);
        try hm.liquidate(id) {} catch {}
        _move(t - 5);
        if (hm.isLiquidatable(id)) {
            vm.prank(validator);
            hm.liquidate(id);
        }
        assertGe(usdVault.totalAssets(), assetsBefore, "issuers whole");
        assertGe(hedgeFund.balance(), fundBefore, "fund never paid out (it only received the open fee)");
    }

    /// The fund can only be drawn through a liquidation that really cannot repay; a healthy or a sandwiched one
    /// never touches it, whoever calls.
    function test_fundOnlyInARealGap() public {
        uint256 id = _hedge(1_000 * USD, 20);
        uint256 f0 = hedgeFund.balance();
        pool.setSpotOnly(P0 / 2); // spot crash, oracle disagrees
        vm.prank(attacker);
        vm.expectRevert(BackxManagerBase.NotLiquidatable.selector);
        hm.liquidate(id);
        assertEq(hedgeFund.balance(), f0);
        vm.prank(attacker);
        vm.expectRevert(BackxReserveSecurityFund.NotManager.selector);
        hedgeFund.cover(1);
    }

    function test_lyingAdapter_refused() public {
        pool.setShortchange(500);
        vm.prank(trader);
        vm.expectRevert();
        hm.open(100 * USD, 5, 0, 0);
    }

    function test_configFootguns() public {
        vm.startPrank(safe);
        vm.expectRevert(BackxManagerBase.BadParams.selector);
        hm.setAddresses(address(0), ISwapAdapter(address(pool)), IPriceOracle(address(pool)));
        vm.expectRevert(BackxMarketFactory.BadValue.selector);
        factory.createMarket(BackxMarketFactory.NewMarket({
            token: address(usd), adapter: address(pool), oracle: address(pool), hedge: _cfg(5, 100, 0), short: _cfg(0, 0, 0)
        }));
        vm.expectRevert(BackxManagerBase.BadParams.selector);
        hm.setGuards(10, 25, 100, 0, 5_000); // liquidation gap under 0.5 %
        vm.stopPrank();
    }

    /// Nobody but the manager can move reserve or fund money; nobody can re-initialise anything.
    function test_onlyManagerMovesMoney() public {
        vm.startPrank(attacker);
        vm.expectRevert(BackxReserveVault.NotManager.selector);
        usdVault.lend(1);
        vm.expectRevert(BackxReserveVault.NotManager.selector);
        usdVault.writeOff(0);
        vm.expectRevert(BackxReserveVault.NotManager.selector);
        usdVault.addRewards(0);
        vm.expectRevert(BackxReserveSecurityFund.NotManager.selector);
        hedgeFund.cover(1);
        vm.expectRevert();
        usdVault.setManager(attacker);
        vm.expectRevert();
        hedgeFund.initialize(IERC20(address(usd)), attacker, attacker);
        vm.stopPrank();
    }

    /// Claims pay only what an address earned, to where it says.
    function test_claimsArePersonal() public {
        uint256 id = _hedge(100 * USD, 20);
        _move(-400);
        vm.prank(validator);
        hm.liquidate(id);
        uint256 owed = hm.claimable(validator);
        vm.prank(attacker);
        assertEq(hm.claim(), 0, "nothing for the attacker");
        vm.prank(validator);
        hm.claimTo(makeAddr("cold"));
        assertEq(usd.balanceOf(makeAddr("cold")), owed);
        assertEq(hm.totalClaimable(), 0);
    }

    function test_inflationAttack_fails() public {
        BackxReserveVault fresh = BackxReserveVault(address(new ERC1967Proxy(address(new BackxReserveVault()), abi.encodeCall(
            BackxReserveVault.initialize, (IERC20(address(usd)), "x", "x", safe, address(hm), IERC20(address(usd)))))));
        usd.mint(attacker, 1_000_001 * USD);
        vm.startPrank(attacker);
        usd.approve(address(fresh), type(uint256).max);
        fresh.deposit(1, attacker);
        usd.transfer(address(fresh), 1_000_000 * USD);
        vm.stopPrank();
        usd.mint(issuer, 10_000 * USD);
        vm.startPrank(issuer);
        usd.approve(address(fresh), type(uint256).max);
        uint256 shares = fresh.deposit(10_000 * USD, issuer);
        vm.stopPrank();
        assertGt(shares, 0, "victim gets shares");
        assertApproxEqRel(fresh.convertToAssets(shares), 10_000 * USD, 0.01e18, "and keeps its value");
    }

    function test_healthyPositionCannotBeLiquidated() public {
        uint256 id = _hedge(100 * USD, 5);
        pool.setSpotOnly(P0 / 2);
        vm.prank(attacker);
        vm.expectRevert(BackxManagerBase.NotLiquidatable.selector);
        hm.liquidate(id);
    }

    /// Order escrow and position money cannot be claimed: only rewards are claimable.
    function test_escrowNotClaimable() public {
        vm.prank(trader);
        hm.placeOrder(5, 1_000 * USD, 1_000 * USD, false, uint40(block.timestamp + 1 days), 0, 0);
        vm.prank(trader);
        assertEq(hm.claim(), 0);
        assertEq(usd.balanceOf(address(hm)), 1_000 * USD);
    }
}

/// Regression tests for the security review of 2026-10-25 (each one failed before the fix).
contract Review20261025Test is Base {
    address attacker = makeAddr("attacker");

    function setUp() public {
        _deploy(5, 10_000_000 * USD);
    }

    /// HIGH-1: thousands of cancelled withdrawal requests cannot make settlements run out of gas.
    function test_queueSpamCannotBlockSettlements() public {
        vm.startPrank(issuer);
        usdVault.withdraw(4_990_000 * USD, issuer, issuer); // small reserve so requests wait
        vm.stopPrank();
        uint256 id = _hedge(1_000 * USD, 9);
        uint256 own = usdVault.balanceOf(issuer);
        vm.prank(issuer);
        usdVault.requestRedeem(own); // waits at the head (most of the reserve is lent)
        usd.mint(attacker, 1_000 * USD);
        vm.startPrank(attacker);
        usd.approve(address(usdVault), type(uint256).max);
        usdVault.deposit(1_000 * USD, attacker);
        uint256 each = usdVault.balanceOf(attacker) / 2_000;
        for (uint256 i; i < 1_500; i++) usdVault.cancelRequest(usdVault.requestRedeem(each));
        vm.stopPrank();
        _move(500);
        uint256 g = gasleft();
        vm.prank(trader);
        hm.close(id, 0);
        assertLt(g - gasleft(), 2_000_000, "close stays cheap: the queue work is bounded");
        assertEq(usdVault.lent(), 0);
        for (uint256 i; i < 60; i++) usdVault.processQueue(1); // anyone walks the rest in bounded steps
        assertEq(usdVault.queueHead(), usdVault.queueTail(), "queue drained");
    }

    /// MEDIUM-4: a request that owes nothing is refused (it would block the queue head).
    function test_dustRequestRefused() public {
        vm.prank(issuer);
        vm.expectRevert(BackxReserveVault.BadValue.selector);
        usdVault.requestRedeem(1);
    }

    /// HIGH-1 (b): a payout the token refuses is kept for its owner, everyone else is still paid and settled.
    function test_blacklistedQueueOwnerCannotBlock() public {
        vm.startPrank(issuer);
        usdVault.withdraw(4_990_000 * USD, issuer, issuer);
        vm.stopPrank();
        uint256 id = _hedge(1_000 * USD, 9);
        uint256 own = usdVault.balanceOf(issuer);
        vm.prank(issuer);
        usdVault.requestRedeem(own);
        usd.setBlocked(issuer, true);
        _move(500);
        vm.prank(trader);
        hm.close(id, 0); // must not revert
        assertGt(usdVault.owedTo(issuer), 0, "kept for the issuer");
        usd.setBlocked(issuer, false);
        vm.prank(issuer);
        usdVault.withdrawOwed(issuer);
        assertEq(usdVault.owedTo(issuer), 0);
    }

    /// HIGH-2: pushing the pool price cannot steer a covered short liquidation into the fund or take the trader's rest.
    function test_shortLiquidation_spotPushCannotDrainFund() public {
        _setCfg(sm, _cfg(10, 0, 8_000));
        uint256 id = _short(1_000 * USD, 10);
        int256 t = _triggerBps(sm, id, true);
        _move(t); // genuinely liquidatable, the oracle says C still covers the buy-back
        uint256 f0 = shortFund.balance();
        uint256 tr0 = usd.balanceOf(trader);
        pool.setSpotOnly(P0 * uint256(10_000 + t + 150) / 10_000); // spot pushed 1.5 % above the oracle
        vm.prank(attacker);
        try sm.liquidate(id) {} catch {}
        assertEq(shortFund.balance(), f0, "fund untouched");
        _move(t);
        if (sm.isLiquidatable(id)) { vm.prank(attacker); sm.liquidate(id); }
        assertEq(shortFund.balance(), f0, "fund untouched by a normal liquidation");
        assertGt(usd.balanceOf(trader), tr0, "trader keeps its rest");
        assertEq(tokenVault.lent(), 0, "same coins back");
    }

    /// MEDIUM-1: a late take-profit fill pays the trader at today's price (minus slip), not at the old limit.
    function test_lateTakeProfit_tradeGetsTodaysPrice() public {
        vm.prank(trader);
        uint256 id = hm.open(1_000 * USD, 5, 0, 2_200 * USD);
        _move(3_000); // far past the limit ($2,600 vs $2,200)
        pool.setSpotOnly(P0 * 12_000 / 10_000); // a sandwich drags the pool down to $2,400
        vm.prank(attacker);
        vm.expectRevert(); // the sale must fetch today's value minus 1 %
        hm.executeLimit(id);
        _move(3_000);
        uint256 before = usd.balanceOf(trader);
        vm.prank(attacker);
        hm.executeLimit(id);
        assertGt(usd.balanceOf(trader) - before, 2_200 * USD, "about the +30 % move, not the +10 % limit");
    }

    /// MEDIUM-3: inside the liqMaxGap band the hedge fund pays only what the oracle confirms is missing.
    function test_hedgeFundPaysOnlyConfirmedShortfall() public {
        _setCfg(hm, _cfg(20, 0, 0));
        uint256 id = _hedge(1_000 * USD, 20);
        int256 t = _triggerBps(hm, id, false);
        _move(t - 10);
        pool.setSpotOnly(P0 * uint256(10_000 + t - 10 - 190) / 10_000); // 1.9 % sandwich
        uint256 f0 = hedgeFund.balance();
        vm.prank(attacker);
        try hm.liquidate(id) {} catch {}
        assertEq(hedgeFund.balance(), f0, "the oracle says the coins still cover the loan: no fund payment");
    }

    /// LOW: a blacklisted trader cannot make its position impossible to liquidate; the payout waits for it.
    function test_blacklistedTraderCannotBlockLiquidation() public {
        uint256 id = _hedge(1_000 * USD, 5);
        usd.setBlocked(trader, true);
        _move(-1_800);
        vm.prank(attacker);
        hm.liquidate(id);
        assertEq(usdVault.lent(), 0);
        assertGt(hm.claimable(trader), 0, "payout kept claimable");
    }

    /// LOW: owner settings keep safe floors.
    function test_settingFloors() public {
        vm.startPrank(safe);
        vm.expectRevert(BackxReserveVault.BadValue.selector);
        usdVault.setVestPeriod(0);
        vm.expectRevert(BackxManagerBase.BadParams.selector);
        sm.setConfig(_cfg(5, 300, 0)); // a short without a roof
        vm.expectRevert(BackxManagerBase.BadParams.selector);
        hm.setGuards(5_000, 25, 100, 0, 5_000); // 50 % liquidation gap
        vm.stopPrank();
    }

    /// LOW: an order whose take-profit could never fill is refused when placed; slip bounded.
    function test_orderChecks() public {
        vm.startPrank(trader);
        vm.expectRevert(BackxManagerBase.BadLimit.selector);
        hm.placeOrder(5, 100 * USD, 1_900 * USD, false, uint40(block.timestamp + 1 days), 1_800 * USD, 0);
        vm.expectRevert(BackxManagerBase.BadParams.selector);
        hm.placeOrder(5, 100 * USD, 1_900 * USD, false, uint40(block.timestamp + 1 days), 0, 600);
        vm.stopPrank();
    }
}
