// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {BackxPositionManager} from "../src/BackxPositionManager.sol";
import {BackxMarketFactory} from "../src/BackxMarketFactory.sol";
import {BackxReserveVault} from "../src/BackxReserveVault.sol";
import {BackxReserveSecurityFund} from "../src/BackxReserveSecurityFund.sol";

/// Security review 2026-10-20: the attacks the review looked for, each one shown to fail.
contract SecurityTest is Base {
    address attacker = makeAddr("attacker");

    function setUp() public {
        _deploy(5, 10_000_000 * USD);
        BackxPositionManager.Market memory mk = _market(20, 0);
        mk.liqMarginBps = 150; // Major tier after the review
        vm.prank(safe);
        pm.setMarket(address(coin), mk);
    }

    /// Liquidation sandwich: the position is at its trigger, the attacker crashes the pool in the same block and
    /// liquidates (permissionless) to sell the coins cheap. The sale may not leave the issuers short: it reverts.
    function test_liquidationSandwich_cannotTouchPrincipal() public {
        vm.prank(safe);
        pm.setPermissionlessLiquidation(true);
        uint256 assetsBefore = usdVault.totalAssets();
        uint256 id = _hedge(1_000 * USD, 20);
        int256 t = _triggerBps(id, false);
        _move(t - 5);                             // genuinely liquidatable (TWAP agrees)
        assertTrue(pm.isLiquidatable(id));
        pool.setSpotOnly(P0 * uint256(10_000 + t - 5 - 1_000) / 10_000); // spot 10 % lower in the same block
        vm.prank(attacker);
        vm.expectRevert();
        pm.liquidate(id);
        // Once the pool is back in line, the normal liquidation repays the issuers in full.
        _move(t - 5);
        vm.prank(attacker);
        pm.liquidate(id);
        assertEq(usdVault.lent(), 0);
        assertGe(usdVault.totalAssets(), assetsBefore, "issuers whole");
    }

    /// A smaller squeeze that stays inside the 2 % TWAP band still leaves the issuers whole.
    function test_smallSqueeze_issuersStillWhole() public {
        uint256 assetsBefore = usdVault.totalAssets();
        uint256 fundBefore = hedgeFund.balance();
        uint256 id = _hedge(1_000 * USD, 20);
        int256 t = _triggerBps(id, false);
        _move(t - 5);
        pool.setSpotOnly(P0 * uint256(10_000 + t - 5 - 150) / 10_000); // 1.5 % below the TWAP
        vm.prank(keeper);
        try pm.liquidate(id) {} catch {}
        _move(t - 5);
        if (pm.isLiquidatable(id)) {
            vm.prank(keeper);
            pm.liquidate(id);
        }
        assertGe(usdVault.totalAssets(), assetsBefore, "issuers whole");
        assertGe(hedgeFund.balance(), fundBefore, "fund never paid out (it only received the open fee)");
    }

    /// A buggy adapter (or a fee-on-transfer token) reports more than it delivers: the books follow the real
    /// balance, so the position cannot be credited with coins that never arrived.
    function test_lyingAdapter_refused() public {
        pool.setShortchange(500);
        vm.prank(trader);
        vm.expectRevert();
        pm.openHedge(address(coin), 100 * USD, 5, 0, 0);
    }

    /// The Safe cannot point open positions at another reserve (their principal would be repaid to the wrong pool).
    function test_cannotSwapReserveUnderOpenPositions() public {
        _hedge(100 * USD, 5);
        BackxPositionManager.Market memory mk = _market(20, 0);
        mk.usdVault = BackxReserveVault(makeAddr("otherVault"));
        vm.prank(safe);
        vm.expectRevert(BackxPositionManager.BadParams.selector);
        pm.setMarket(address(coin), mk);
    }

    function test_configFootguns() public {
        vm.startPrank(safe);
        vm.expectRevert(BackxPositionManager.BadParams.selector);
        pm.setFeeCollector(address(0));
        vm.expectRevert(BackxMarketFactory.BadValue.selector);
        factory.createMarket(BackxMarketFactory.NewMarket({
            token: address(usd), adapter: address(pool), oracle: address(pool), maxHedgeM: 5, maxShortM: 0,
            maxNotionalUsd: 1, maxOpenHedgeUsd: 1, maxOpenShortUsd: 0, crashBps: 3_000, pumpBps: 3_000, liqMarginBps: 100
        }));
        vm.stopPrank();
    }

    /// Nobody but the PositionManager can move reserve or fund money; nobody can re-initialise anything.
    function test_onlyManagerMovesMoney() public {
        vm.startPrank(attacker);
        vm.expectRevert(BackxReserveVault.NotManager.selector);
        usdVault.lend(1);
        vm.expectRevert(BackxReserveVault.NotManager.selector);
        usdVault.writeOff(0);
        vm.expectRevert(BackxReserveSecurityFund.NotManager.selector);
        hedgeFund.cover(1);
        vm.expectRevert();
        usdVault.setManager(attacker);
        vm.expectRevert();
        hedgeFund.initialize(IERC20(address(usd)), attacker, attacker);
        vm.stopPrank();
    }

    /// First-depositor inflation attack on a fresh reserve: donating to the vault does not steal the next deposit.
    function test_inflationAttack_fails() public {
        BackxReserveVault fresh = BackxReserveVault(address(new ERC1967Proxy(address(new BackxReserveVault()), abi.encodeCall(
            BackxReserveVault.initialize, (IERC20(address(usd)), "x", "x", safe, address(pm))))));
        usd.mint(attacker, 1_000_001 * USD);
        vm.startPrank(attacker);
        usd.approve(address(fresh), type(uint256).max);
        fresh.deposit(1, attacker);
        usd.transfer(address(fresh), 1_000_000 * USD); // donation to inflate the share price
        vm.stopPrank();
        usd.mint(issuer, 10_000 * USD);
        vm.startPrank(issuer);
        usd.approve(address(fresh), type(uint256).max);
        uint256 shares = fresh.deposit(10_000 * USD, issuer);
        vm.stopPrank();
        assertGt(shares, 0, "victim gets shares");
        assertApproxEqRel(fresh.convertToAssets(shares), 10_000 * USD, 0.01e18, "and keeps its value");
    }

    /// Keeper/attacker cannot liquidate a healthy position, even by moving only the spot price.
    function test_healthyPositionCannotBeLiquidated() public {
        vm.prank(safe);
        pm.setPermissionlessLiquidation(true);
        uint256 id = _hedge(100 * USD, 5);
        pool.setSpotOnly(P0 / 2);
        vm.prank(attacker);
        vm.expectRevert(BackxPositionManager.NotLiquidatable.selector);
        pm.liquidate(id);
    }
}
