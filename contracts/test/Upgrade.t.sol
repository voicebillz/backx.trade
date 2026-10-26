// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Base} from "./Base.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BackxManagerBase} from "../src/BackxManagerBase.sol";
import {BackxHedgeManager} from "../src/BackxHedgeManager.sol";
import {BackxReserveVault} from "../src/BackxReserveVault.sol";
import {BackxMarketFactory} from "../src/BackxMarketFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

contract HedgeManagerV2 is BackxHedgeManager {
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
        BackxManagerBase.Position memory p = _pos(hm, id);
        uint256 shares = usdVault.balanceOf(issuer);
        address v2 = address(new HedgeManagerV2());
        UpgradeableBeacon beacon = factory.hedgeBeacon();
        vm.prank(safe);
        beacon.upgradeTo(v2);
        assertEq(HedgeManagerV2(address(hm)).version(), 2, "same address, new code");
        BackxManagerBase.Position memory p2 = _pos(hm, id);
        assertEq(p2.stake, p.stake);
        assertEq(p2.lent, p.lent);
        assertEq(usdVault.balanceOf(issuer), shares);
        _move(1_000);
        vm.prank(trader);
        hm.close(id, 0);
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
        assertEq(address(factory.setOf(address(coin)).hedge), address(hm), "registry kept");
    }

    function test_onlySafeUpgradesOrCreates() public {
        address v2 = address(new HedgeManagerV2());
        UpgradeableBeacon beacon = factory.hedgeBeacon();
        BackxMarketFactory.NewMarket memory n = _newMarket(address(new MockERC20("X", "X", 18)), 0);
        vm.startPrank(trader);
        vm.expectRevert();
        beacon.upgradeTo(v2);
        vm.expectRevert();
        factory.createMarket(n);
        vm.stopPrank();
    }

    function test_implementationAndProxiesCannotBeReinitialised() public {
        BackxHedgeManager impl = new BackxHedgeManager();
        BackxManagerBase.Init memory a;
        vm.expectRevert();
        impl.initialize(a);
        vm.expectRevert();
        hm.initialize(a);
        vm.expectRevert();
        usdVault.initialize(IERC20(address(usd)), "x", "x", trader, trader, IERC20(address(usd)));
    }

    function test_onePerCoin_isolated_shortAddedLater() public {
        vm.prank(safe);
        vm.expectRevert(BackxMarketFactory.Exists.selector);
        factory.createMarket(_newMarket(address(coin), 0));

        MockERC20 other = new MockERC20("Other", "OTH", 18);
        vm.prank(safe);
        BackxMarketFactory.Set memory s = factory.createMarket(_newMarket(address(other), 0));
        assertTrue(address(s.hedge) != address(hm) && address(s.usdVault) != address(usdVault), "own contracts");
        assertEq(address(s.short), address(0), "no Short side unless asked");
        assertEq(s.usdVault.manager(), address(s.hedge));
        assertEq(s.hedge.owner(), safe);
        assertEq(factory.marketCount(), 2);

        vm.prank(safe);
        s = factory.addShort(address(other), address(pool), address(pool), _cfg(5, 300, 7_000));
        assertEq(s.tokenVault.asset(), address(other), "short issuers deposit the coin itself");
        assertEq(address(s.tokenVault.rewardToken()), address(usd), "and earn USDC");
        assertEq(s.tokenVault.manager(), address(s.short));
        vm.prank(safe);
        vm.expectRevert(BackxMarketFactory.Exists.selector);
        factory.addShort(address(other), address(pool), address(pool), _cfg(5, 300, 7_000));
    }

    function _newMarket(address token, uint8 shortM) internal view returns (BackxMarketFactory.NewMarket memory) {
        return BackxMarketFactory.NewMarket({
            token: token, adapter: address(pool), oracle: address(pool), hedge: _cfg(20, 150, 0), short: _cfg(shortM, 200, 8_000)
        });
    }
}

contract ValidatorBatchTest is Base {
    function setUp() public {
        _deploy(5, 10_000_000 * USD);
    }

    /// One transaction liquidates the ones that can be liquidated and skips the rest; anyone can send it.
    function test_liquidateBatch() public {
        uint256[] memory ids = new uint256[](4);
        ids[0] = _hedge(100 * USD, 20);
        ids[1] = _hedge(100 * USD, 20);
        ids[2] = _hedge(100 * USD, 2);  // far from liquidation
        ids[3] = 999;                    // does not exist
        _move(-500);
        vm.prank(validator);
        assertEq(hm.liquidateBatch(ids), 2);
        assertEq(_pos(hm, ids[0]).owner, address(0));
        assertEq(_pos(hm, ids[2]).owner, trader, "skipped, still open");
        assertGe(hm.claimable(validator), 2 * USD / 2, "paid for both");
    }

    function test_limitBatch() public {
        vm.startPrank(trader);
        uint256 a = hm.open(100 * USD, 5, 0, 2_200 * USD);
        uint256 b = hm.open(100 * USD, 5, 0, 2_600 * USD);
        vm.stopPrank();
        _move(1_500);
        uint256[] memory ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
        vm.prank(validator);
        assertEq(hm.executeLimitBatch(ids), 1);
    }
}
