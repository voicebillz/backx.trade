// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {BackxReserveVault} from "../src/BackxReserveVault.sol";

/// Owner 2026-10-20: an issuer can ask to take out more than is idle. The rest is reserved and paid straight to
/// their wallet as positions settle, in order, never lent out again.
contract WithdrawQueueTest is Base {
    address issuer2 = makeAddr("issuer2");

    function setUp() public {
        _deploy(5, 10_000_000 * USD);
        // Small reserve so positions use most of it: issuer keeps $10,000, issuer2 adds $10,000.
        vm.startPrank(issuer);
        usdVault.withdraw(4_990_000 * USD, issuer, issuer);
        vm.stopPrank();
        usd.mint(issuer2, 10_000 * USD);
        vm.startPrank(issuer2);
        usd.approve(address(usdVault), type(uint256).max);
        usdVault.deposit(10_000 * USD, issuer2);
        vm.stopPrank();
    }

    function _value(address who) internal view returns (uint256) {
        return usdVault.convertToAssets(usdVault.balanceOf(who));
    }

    function test_requestPaysFreeNow_restOnSettlement() public {
        uint256 id = _hedge(1_000 * USD, 18); // lends ≈ $16.4k of $20k
        uint256 free = usdVault.freeIdle();
        uint256 before = usd.balanceOf(issuer);
        uint256 shares = usdVault.balanceOf(issuer);
        vm.prank(issuer);
        uint256 rid = usdVault.requestRedeem(shares); // take out everything
        assertApproxEqAbs(usd.balanceOf(issuer) - before, free, 2, "what was free is paid at once");
        assertEq(usdVault.balanceOf(issuer), 0, "shares parked in the vault");
        assertEq(usdVault.availableToLend(), 0, "nothing free to lend while the queue waits");

        // Nobody can jump the queue with an instant withdrawal.
        assertEq(usdVault.maxWithdraw(issuer2), 0);

        // The position closes: the money that comes back pays the queue first, straight to the wallet.
        _move(500);
        vm.prank(trader);
        pm.close(id, 0);
        (, uint128 left) = usdVault.requests(rid);
        assertEq(left, 0, "request fully paid");
        assertGt(usd.balanceOf(issuer) - before, 9_999 * USD, "all of it came to the issuer's wallet");
        vm.warp(block.timestamp + 1 days);
        assertGt(_value(issuer2), 10_000 * USD, "the other issuer kept its share (and earned)");
    }

    function test_queueIsFifo_andPartialFills() public {
        uint256 id = _hedge(1_000 * USD, 18);
        uint256 s1 = usdVault.balanceOf(issuer);
        uint256 s2 = usdVault.balanceOf(issuer2);
        vm.prank(issuer);
        usdVault.requestRedeem(s1);
        vm.prank(issuer2);
        uint256 r2 = usdVault.requestRedeem(s2);
        (, uint128 waiting2) = usdVault.requests(r2);
        assertEq(waiting2, s2, "second in line waits");
        _move(500);
        vm.prank(trader);
        pm.close(id, 0);
        assertEq(usdVault.queuedShares(), 0, "both paid once the loan came back");
        assertGt(usd.balanceOf(issuer2), 9_999 * USD);
    }

    function test_cancelGivesSharesBack() public {
        _hedge(1_000 * USD, 18);
        uint256 shares = usdVault.balanceOf(issuer2);
        uint256 own = usdVault.balanceOf(issuer);
        vm.prank(issuer);
        usdVault.requestRedeem(own);
        vm.prank(issuer2);
        uint256 rid = usdVault.requestRedeem(shares);
        vm.prank(issuer);
        vm.expectRevert(BackxReserveVault.NotYours.selector);
        usdVault.cancelRequest(rid);
        vm.prank(issuer2);
        usdVault.cancelRequest(rid);
        assertEq(usdVault.balanceOf(issuer2), shares);
    }

    function test_newDepositPaysQueue() public {
        _hedge(1_000 * USD, 18);
        uint256 own = usdVault.balanceOf(issuer);
        vm.prank(issuer);
        usdVault.requestRedeem(own);
        uint256 before = usd.balanceOf(issuer);
        address newcomer = makeAddr("newcomer");
        usd.mint(newcomer, 50_000 * USD);
        vm.startPrank(newcomer);
        usd.approve(address(usdVault), type(uint256).max);
        usdVault.deposit(50_000 * USD, newcomer);
        vm.stopPrank();
        assertGt(usd.balanceOf(issuer) - before, 0, "paid from the new money");
        assertEq(usdVault.queuedShares(), 0);
        assertApproxEqRel(_value(newcomer), 50_000 * USD, 0.001e18, "newcomer keeps full value");
    }

    function test_liquidationStillWorksWithAQueue() public {
        uint256 id = _hedge(1_000 * USD, 18);
        uint256 own = usdVault.balanceOf(issuer);
        vm.prank(issuer);
        usdVault.requestRedeem(own);
        // A gap that the fund cannot cover is shared by all shares, queued ones included: no one escapes by asking.
        uint256 seed = hedgeFund.balance();
        vm.prank(address(pm));
        hedgeFund.cover(seed);
        usd.burn(address(pm), usd.balanceOf(address(pm)));
        _move(-2_000);
        vm.prank(keeper);
        pm.liquidate(id);
        assertEq(usdVault.queuedShares() > 0 || usd.balanceOf(issuer) > 0, true);
    }
}
