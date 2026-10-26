// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {BackxStaking} from "../src/BackxStaking.sol";
import {BackxTreasury} from "../src/BackxTreasury.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockERC721} from "./mocks/MockERC721.sol";

contract StakingTest is Test {
    MockERC20 gazz;
    MockERC20 usd;
    MockERC721 tanks;
    MockERC721 other;
    BackxStaking st;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    uint256 constant TANK = 10_000e18; // one Tank counts like 10,000 $GAZZ

    function setUp() public {
        gazz = new MockERC20("Gazz", "GAZZ", 18);
        usd = new MockERC20("USD Coin", "USDC", 6);
        tanks = new MockERC721("Gazz Tanks", "TANK");
        other = new MockERC721("Other", "OTH");
        st = new BackxStaking(IERC20(address(gazz)), IERC721(address(tanks)), IERC20(address(usd)), TANK);
        gazz.mint(alice, 30_000e18);
        gazz.mint(bob, 30_000e18);
        tanks.mint(bob, 1);
        tanks.mint(bob, 2);
        vm.prank(alice);
        gazz.approve(address(st), type(uint256).max);
        vm.startPrank(bob);
        gazz.approve(address(st), type(uint256).max);
        tanks.setApprovalForAll(address(st), true);
        vm.stopPrank();
    }

    function _ids(uint256 a) internal pure returns (uint256[] memory r) {
        r = new uint256[](1);
        r[0] = a;
    }

    function _none() internal pure returns (uint256[] memory) {
        return new uint256[](0);
    }

    function _pay(uint256 amount) internal {
        usd.mint(address(st), amount);
        st.sync();
    }

    function test_rewardsSplitByPoints_gazzAndTanks() public {
        vm.prank(alice);
        st.stake(10_000e18, _none());                 // 10k points
        vm.prank(bob);
        st.stake(10_000e18, _ids(1));                 // 10k + one Tank (10k) = 20k points
        _pay(700e6);
        vm.warp(block.timestamp + 7 days);
        assertApproxEqAbs(st.earned(alice), 233_333_333, 10, "a third");
        assertApproxEqAbs(st.earned(bob), 466_666_666, 10, "two thirds");
        vm.prank(bob);
        st.claim();
        assertApproxEqAbs(usd.balanceOf(bob), 466_666_666, 10);
    }

    function test_streamedOver7Days_lateStakerGetsLittle() public {
        vm.prank(alice);
        st.stake(10_000e18, _none());
        uint256 t0 = 1_000_000;
        vm.warp(t0);
        _pay(700e6);
        vm.warp(t0 + 6 days);
        vm.prank(bob);
        st.stake(10_000e18, _none());                 // joins on day 6 with the same stake
        vm.warp(t0 + 7 days);
        assertApproxEqAbs(st.earned(bob), 50e6, 10, "half of the last day only");
        assertApproxEqAbs(st.earned(alice), 650e6, 10);
    }

    function test_unstakeReturnsEverything_rewardsKept() public {
        uint256 t0 = 1_000_000;
        vm.warp(t0);
        vm.prank(bob);
        st.stake(5_000e18, _ids(2));
        _pay(70e6);
        vm.warp(t0 + 7 days);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BackxStaking.Locked.selector, t0 + 90 days));
        st.unstake(5_000e18, _ids(2));
        vm.prank(bob);
        st.claim(); // rewards are claimable while locked
        assertApproxEqAbs(usd.balanceOf(bob), 70e6, 10);
        vm.warp(t0 + 90 days);
        vm.prank(bob);
        st.unstake(5_000e18, _ids(2));
        assertEq(gazz.balanceOf(bob), 30_000e18);
        assertEq(tanks.ownerOf(2), bob);
        assertEq(st.totalPoints(), 0);
        assertEq(st.earned(bob), 0, "already claimed, nothing lost");
    }

    function test_lock_restartsOnEveryStake() public {
        uint256 t0 = 1_000_000;
        vm.warp(t0);
        vm.prank(alice);
        st.stake(1_000e18, _none());
        vm.warp(t0 + 80 days);
        vm.prank(alice);
        st.stake(1e18, _none()); // adding more: 3 months again for everything
        vm.warp(t0 + 91 days);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BackxStaking.Locked.selector, t0 + 170 days));
        st.unstake(1_000e18, _none());
        vm.warp(t0 + 170 days);
        vm.prank(alice);
        st.unstake(1_001e18, _none());
        assertEq(gazz.balanceOf(alice), 30_000e18);
    }

    function test_onlyOwnerUnstakesTank_noAdmin() public {
        vm.prank(bob);
        st.stake(0, _ids(1));
        vm.prank(alice);
        vm.expectRevert(BackxStaking.NotYours.selector);
        st.unstake(0, _ids(1));
    }

    function test_noStakers_rewardWaitsForNextSync() public {
        uint256 t0 = 1_000_000;
        vm.warp(t0);
        _pay(70e6);
        vm.warp(t0 + 7 days);
        vm.prank(alice);
        st.stake(1e18, _none());
        assertApproxEqAbs(st.sync(), 70e6, 2, "the unstreamed week goes out again");
        vm.warp(t0 + 14 days);
        assertApproxEqAbs(st.earned(alice), 70e6, 10);
    }

    function test_safeTransferTank_stakesForSender_otherNftRefused() public {
        vm.prank(bob);
        tanks.safeTransferFrom(bob, address(st), 1);
        assertEq(st.tankOwner(1), bob);
        assertEq(st.pointsOf(bob), TANK);
        other.mint(bob, 9);
        vm.prank(bob);
        vm.expectRevert();
        other.safeTransferFrom(bob, address(st), 9);
    }

    function test_treasuryShareFlowsIntoStaking() public {
        BackxTreasury t = new BackxTreasury(address(this), 1_000);
        t.setHolders(address(st), 1_000);
        vm.prank(alice);
        st.stake(1_000e18, _none());
        usd.mint(address(t), 1_000e6);
        t.distribute(IERC20(address(usd)));
        assertEq(st.sync(), 100e6, "10 % of platform revenue");
        vm.warp(block.timestamp + 7 days);
        assertApproxEqAbs(st.earned(alice), 100e6, 10);
    }
}
