// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BackxTreasury} from "../src/BackxTreasury.sol";
import {BackxHolderRewards} from "../src/BackxHolderRewards.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract TreasuryTest is Test {
    BackxTreasury t;
    MockERC20 usd;
    address safe = makeAddr("safe");
    address holders = makeAddr("holders");

    function setUp() public {
        usd = new MockERC20("USD Coin", "USDC", 6);
        t = new BackxTreasury(safe, 2_500);
    }

    function test_holdersShareWaitsForAddress_thenPaid() public {
        usd.mint(address(t), 1_000e6);
        assertEq(t.distribute(IERC20(address(usd))), 0, "no address yet: kept aside");
        assertEq(t.holdersOwed(IERC20(address(usd))), 250e6);
        assertEq(t.kept(IERC20(address(usd))), 750e6);
        vm.prank(safe);
        t.setHolders(holders, 2_500);
        usd.mint(address(t), 400e6);
        assertEq(t.distribute(IERC20(address(usd))), 350e6, "owed 250 + 25 % of 400");
        assertEq(usd.balanceOf(holders), 350e6);
        assertEq(t.kept(IERC20(address(usd))), 1_050e6);
    }

    function test_safeWithdrawsOnlyPlatformPart() public {
        usd.mint(address(t), 1_000e6);
        vm.prank(safe);
        vm.expectRevert(BackxTreasury.TooMuch.selector);
        t.withdraw(IERC20(address(usd)), safe, 751e6);
        vm.prank(safe);
        t.withdraw(IERC20(address(usd)), safe, 750e6);
        assertEq(usd.balanceOf(address(t)), 250e6, "holders' share stays");
    }

    function test_onlySafe_andCap() public {
        vm.expectRevert();
        t.withdraw(IERC20(address(usd)), address(this), 1);
        vm.expectRevert();
        t.setHolders(address(this), 100);
        vm.prank(safe);
        vm.expectRevert(BackxTreasury.BadParams.selector);
        t.setHolders(holders, 5_001);
        vm.expectRevert(BackxTreasury.BadParams.selector);
        new BackxTreasury(safe, 6_000);
    }

    function test_holderRewards_weeklyRounds() public {
        BackxHolderRewards hr = new BackxHolderRewards(safe);
        address op = makeAddr("validator");
        address a = makeAddr("a");
        address b = makeAddr("b");
        vm.prank(safe);
        hr.setOperator(op);
        usd.mint(address(hr), 100e6);
        IERC20 u = IERC20(address(usd));
        address[] memory to = new address[](2);
        uint256[] memory amt = new uint256[](2);
        (to[0], to[1], amt[0], amt[1]) = (a, b, 60e6, 30e6);

        vm.expectRevert(BackxHolderRewards.NotOperator.selector);
        hr.startRound(u);
        vm.startPrank(op);
        hr.startRound(u);
        hr.pay(u, to, amt);
        assertEq(usd.balanceOf(a), 60e6);
        vm.expectRevert(BackxHolderRewards.AlreadyPaid.selector);
        hr.pay(u, to, amt);
        address[] memory one = new address[](1);
        uint256[] memory big = new uint256[](1);
        (one[0], big[0]) = (makeAddr("c"), 11e6);
        vm.expectRevert(BackxHolderRewards.OverBudget.selector);
        hr.pay(u, one, big);
        vm.expectRevert(BackxHolderRewards.TooSoon.selector);
        hr.startRound(u);
        vm.warp(block.timestamp + 7 days);
        (, uint256 budget) = hr.startRound(u);
        assertEq(budget, 10e6, "unpaid rest rolls over");
        usd.setBlocked(a, true);
        amt[0] = 5e6;
        amt[1] = 5e6;
        hr.pay(u, to, amt); // a is refused by the token: skipped, b paid
        assertEq(usd.balanceOf(b), 35e6);
        assertFalse(hr.paid(u, 2, a));
        vm.stopPrank();
        vm.prank(safe);
        hr.setPaused(true);
        vm.prank(op);
        vm.expectRevert(BackxHolderRewards.IsPaused.selector);
        hr.pay(u, one, big);
    }
}
