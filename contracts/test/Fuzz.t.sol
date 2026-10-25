// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {BackxManagerBase} from "../src/BackxManagerBase.sol";

/// Random m (1..30), side and price move (−30 %..+30 %). Every position settles one way or the other, and:
///  - all principal is back with the issuers (lent == 0) or explicitly written off,
///  - nothing is left in the manager but what validators can claim,
///  - issuers only lose if the Reserve Security Fund cannot pay (it is well funded here).
contract FuzzTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
        usd.mint(address(hedgeFund), 1_000_000 * USD);
        usd.mint(address(shortFund), 1_000_000 * USD);
    }

    function testFuzz_settlesCleanly(uint8 mRaw, bool isShort, int16 moveRaw, uint32 stakeRaw) public {
        uint8 m = uint8(bound(mRaw, 1, 30));
        int256 move = bound(int256(moveRaw), -3_000, 3_000);
        uint256 stake = bound(uint256(stakeRaw), 10 * USD, 1_500 * USD);
        uint256 usdAssets = usdVault.totalAssets();
        uint256 coinAssets = tokenVault.totalAssets();
        BackxManagerBase mgr = isShort ? BackxManagerBase(sm) : BackxManagerBase(hm);

        uint256 id = isShort ? _short(stake, m) : _hedge(stake, m);
        _move(move);

        if (mgr.isLiquidatable(id)) {
            vm.prank(validator);
            mgr.liquidate(id);
        } else if (mgr.isLimitReached(id)) {
            vm.prank(validator);
            mgr.executeLimit(id);
        } else {
            vm.prank(trader);
            if (isShort) sm.close(id, type(uint256).max);
            else hm.close(id, 0);
        }

        assertEq(usdVault.lent(), 0, "usd principal back");
        assertEq(tokenVault.lent(), 0, "coin principal back");
        assertEq(usd.balanceOf(address(mgr)), mgr.totalClaimable(), "no usd stuck beyond claims");
        assertEq(coin.balanceOf(address(mgr)), 0, "no coins stuck");
        assertGe(usdVault.totalAssets() + 2, usdAssets, "usd issuers whole");
        assertGe(tokenVault.totalAssets() + 2, coinAssets, "coin issuers whole");
        assertEq(_pos(mgr, id).owner, address(0), "position gone");
        assertEq(mgr.stressUsd(), 0, "crash cover released");
    }
}
