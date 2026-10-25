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
        hm.placeOrder(5, 1_000 * USD, 1_000 * USD, false, uint40(block.timestamp + 1 days), 0);
        vm.prank(trader);
        assertEq(hm.claim(), 0);
        assertEq(usd.balanceOf(address(hm)), 1_000 * USD);
    }
}
