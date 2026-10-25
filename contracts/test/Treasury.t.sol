// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BackxTreasury} from "../src/BackxTreasury.sol";
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
}
