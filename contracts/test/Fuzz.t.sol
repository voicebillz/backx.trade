// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {BackxPositionManager} from "../src/BackxPositionManager.sol";

/// Random m (1..30), side and price move (−30 %..+30 %). Every position settles one way or the other, and:
///  - all principal is back with the issuers (lent == 0) or explicitly written off,
///  - nothing is left in the PositionManager,
///  - issuers only lose if the Reserve Security Fund is empty (it is well funded here).
contract FuzzTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
        usd.mint(address(hedgeFund), 100_000 * USD);
        usd.mint(address(shortFund), 100_000 * USD);
    }

    function testFuzz_settlesCleanly(uint8 mRaw, bool isShort, int16 moveRaw, uint32 stakeRaw) public {
        uint8 m = uint8(bound(mRaw, 1, 30));
        int256 move = bound(int256(moveRaw), -3_000, 3_000);
        uint256 stake = bound(uint256(stakeRaw), 10 * USD, 1_500 * USD);
        uint256 usdAssets = usdVault.totalAssets();
        uint256 coinAssets = tokenVault.totalAssets();

        uint256 id = isShort ? _short(stake, m) : _hedge(stake, m);
        _move(move);

        if (pm.isLiquidatable(id)) {
            vm.prank(keeper);
            pm.liquidate(id);
        } else {
            vm.prank(trader);
            pm.close(id, isShort ? type(uint256).max : 0);
        }

        assertEq(usdVault.lent(), 0, "usd principal back");
        assertEq(tokenVault.lent(), 0, "coin principal back");
        assertEq(usd.balanceOf(address(pm)), 0, "no usd stuck");
        assertEq(coin.balanceOf(address(pm)), 0, "no coins stuck");
        // Issuers never end below where they started (fund covers gaps; rounding ≤ 2 units).
        assertGe(usdVault.totalAssets() + 2, usdAssets, "usd issuers whole");
        assertGe(tokenVault.totalAssets() + 2, coinAssets, "coin issuers whole");
        (address owner,,,,,,,,,,) = pm.positions(id);
        assertEq(owner, address(0), "position gone");
    }
}
