// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BackxPositionManager} from "../src/BackxPositionManager.sol";
import {BackxReserveVault} from "../src/BackxReserveVault.sol";
import {BackxMarketFactory} from "../src/BackxMarketFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

contract PositionManagerV2 is BackxPositionManager {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract FactoryV2 is BackxMarketFactory {
    function version() external pure returns (uint256) {
        return 2;
    }
}

/// Owner 2026-10-19: nothing is locked. The Safe upgrades code for every coin on a chain without redeploying,
/// and positions, shares and balances survive the upgrade.
contract UpgradeTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
    }

    function test_upgradeAllMarkets_positionsSurvive() public {
        uint256 id = _hedge(100 * USD, 5);
        (,,,,,, uint128 equity, uint128 lent,,,,,) = pm.positions(id);
        uint256 shares = usdVault.balanceOf(issuer);

        address v2 = address(new PositionManagerV2());
        UpgradeableBeacon beacon = factory.managerBeacon();
        vm.prank(safe);
        beacon.upgradeTo(v2);

        assertEq(PositionManagerV2(address(pm)).version(), 2, "same address, new code");
        (,,,,,, uint128 equity2, uint128 lent2,,,,,) = pm.positions(id);
        assertEq(equity2, equity);
        assertEq(lent2, lent);
        assertEq(usdVault.balanceOf(issuer), shares);
        _move(1_000);
        vm.prank(trader);
        pm.close(id, 0); // still settles after the upgrade
        assertEq(usdVault.lent(), 0);
    }

    function test_vaultUpgrade_keepsShares() public {
        uint256 assets = usdVault.totalAssets();
        address v2 = address(new BackxReserveVault());
        UpgradeableBeacon beacon = factory.vaultBeacon();
        vm.prank(safe);
        beacon.upgradeTo(v2);
        assertEq(usdVault.totalAssets(), assets);
    }

    function test_factoryUpgrade_bySafeOnly() public {
        address v2 = address(new FactoryV2());
        vm.prank(trader);
        vm.expectRevert();
        factory.upgradeToAndCall(v2, "");
        vm.prank(safe);
        factory.upgradeToAndCall(v2, "");
        assertEq(FactoryV2(address(factory)).version(), 2);
        assertEq(address(factory.setOf(address(coin)).manager), address(pm), "registry kept");
    }

    function test_onlySafeUpgradesOrCreates() public {
        address v2 = address(new PositionManagerV2());
        UpgradeableBeacon beacon = factory.managerBeacon();
        BackxMarketFactory.NewMarket memory n = _newMarket(address(new MockERC20("X", "X", 18)));
        vm.startPrank(trader);
        vm.expectRevert();
        beacon.upgradeTo(v2);
        vm.expectRevert();
        factory.createMarket(n);
        vm.stopPrank();
    }

    function test_implementationAndProxiesCannotBeReinitialised() public {
        BackxPositionManager impl = new BackxPositionManager();
        BackxPositionManager.Init memory a;
        vm.expectRevert();
        impl.initialize(a);
        vm.expectRevert();
        pm.initialize(a);
        vm.expectRevert();
        usdVault.initialize(IERC20(address(usd)), "x", "x", trader, trader);
    }

    function test_onePerCoin_isolated() public {
        vm.prank(safe);
        vm.expectRevert(BackxMarketFactory.Exists.selector);
        factory.createMarket(_newMarket(address(coin)));

        MockERC20 other = new MockERC20("Other", "OTH", 18);
        vm.prank(safe);
        BackxMarketFactory.Set memory s = factory.createMarket(_newMarket(address(other)));
        assertTrue(address(s.manager) != address(pm) && address(s.usdVault) != address(usdVault), "own contracts");
        assertEq(address(s.tokenVault), address(0), "no Short side unless asked");
        assertEq(s.usdVault.manager(), address(s.manager));
        assertEq(s.manager.owner(), safe);
        assertEq(s.usdVault.owner(), safe);
        assertEq(factory.marketCount(), 2);
    }

    function _newMarket(address token) internal view returns (BackxMarketFactory.NewMarket memory) {
        return BackxMarketFactory.NewMarket({
            token: token, adapter: address(pool), oracle: address(pool), maxHedgeM: 20, maxShortM: 0,
            maxNotionalUsd: uint128(50_000 * USD), maxOpenHedgeUsd: uint128(2_000_000 * USD), maxOpenShortUsd: 0,
            crashBps: 3_000, pumpBps: 3_000, liqMarginBps: 100
        });
    }
}

contract KeeperBatchTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
    }

    /// One transaction liquidates the ones that can be liquidated and skips the rest.
    function test_liquidateBatch() public {
        uint256[] memory ids = new uint256[](4);
        ids[0] = _hedge(100 * USD, 20);
        ids[1] = _hedge(100 * USD, 20);
        ids[2] = _hedge(100 * USD, 2);  // far from liquidation
        ids[3] = 999;                    // does not exist
        _move(-500);
        vm.prank(keeper);
        uint256 done = pm.liquidateBatch(ids);
        assertEq(done, 2);
        (address o0,,,,,,,,,,,,) = pm.positions(ids[0]);
        (address o2,,,,,,,,,,,,) = pm.positions(ids[2]);
        assertEq(o0, address(0));
        assertEq(o2, trader, "skipped, still open");
        vm.prank(trader);
        vm.expectRevert(BackxPositionManager.NotKeeper.selector);
        pm.liquidateBatch(ids);
        vm.expectRevert(BackxPositionManager.NotKeeper.selector);
        pm.selfSettle(ids[2], false);
    }

    function test_limitBatch() public {
        vm.startPrank(trader);
        uint256 a = pm.openHedge(address(coin), 100 * USD, 5, 0, 2_200 * USD);
        uint256 b = pm.openHedge(address(coin), 100 * USD, 5, 0, 2_600 * USD);
        vm.stopPrank();
        _move(1_500);
        uint256[] memory ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
        vm.prank(keeper);
        assertEq(pm.executeLimitBatch(ids), 1);
    }
}
