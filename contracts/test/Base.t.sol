// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BackxReserveVault} from "../src/BackxReserveVault.sol";
import {BackxReserveSecurityFund} from "../src/BackxReserveSecurityFund.sol";
import {BackxPositionManager} from "../src/BackxPositionManager.sol";
import {ISwapAdapter} from "../src/interfaces/ISwapAdapter.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPool} from "./mocks/MockPool.sol";
import {BackxMarketFactory} from "../src/BackxMarketFactory.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// Shared setup: one coin, both reserves funded, both Reserve Security Funds seeded.
/// Pool model = docs/backx/sim (fee + impact = value / depth), so contract numbers can be checked against sim3.
abstract contract Base is Test {
    MockERC20 usd;
    MockERC20 coin;
    MockPool pool;
    BackxReserveVault usdVault;
    BackxReserveVault tokenVault;
    BackxReserveSecurityFund hedgeFund;
    BackxReserveSecurityFund shortFund;
    BackxPositionManager pm;

    address safe = makeAddr("safe");
    address feeCollector = makeAddr("feeCollector");
    address keeper = makeAddr("keeper");
    address trader = makeAddr("trader");
    address issuer = makeAddr("issuer");

    uint256 constant USD = 1e6;          // 1 USDC
    uint256 constant COIN = 1e18;        // 1 coin
    uint256 constant P0 = 2_000 * USD;   // $2,000 per coin (ETH-like)

    BackxMarketFactory factory;

    /// deep = 0.05 % fee, $10M depth (sim "BTC-type"); meme = 0.3 %, $1M.
    /// Everything is created the way production does it: implementations behind beacons, one factory per chain,
    /// one createMarket call (by the Safe) per coin. Short side included so its tested code stays covered.
    function _deploy(uint256 feeBps, uint256 depthUsd) internal {
        usd = new MockERC20("USD Coin", "USDC", 6);
        coin = new MockERC20("Coin", "COIN", 18);
        pool = new MockPool(usd, coin, P0, feeBps, depthUsd);

        BackxMarketFactory impl = new BackxMarketFactory();
        factory = BackxMarketFactory(address(new ERC1967Proxy(address(impl), abi.encodeCall(BackxMarketFactory.initialize, (
            safe, IERC20(address(usd)), address(new BackxReserveVault()), address(new BackxReserveSecurityFund()),
            address(new BackxPositionManager()), feeCollector, keeper, keeper)))));

        vm.prank(safe);
        BackxMarketFactory.Set memory s = factory.createMarket(BackxMarketFactory.NewMarket({
            token: address(coin), adapter: address(pool), oracle: address(pool), maxHedgeM: 30, maxShortM: 30,
            maxNotionalUsd: uint128(50_000 * USD), maxOpenHedgeUsd: uint128(2_000_000 * USD), maxOpenShortUsd: uint128(2_000_000 * USD),
            crashBps: 3_000, pumpBps: 3_000, liqMarginBps: 0
        }));
        pm = s.manager;
        usdVault = s.usdVault;
        tokenVault = s.tokenVault;
        hedgeFund = s.hedgeFund;
        shortFund = s.shortFund;
        vm.prank(safe);
        pm.setKeeperGas(keeper, 100_000); // $0.10 per position to the keeper wallet

        // Issuers: $5M USD reserve, 2,500 coins ($5M) token reserve.
        usd.mint(issuer, 5_000_000 * USD);
        coin.mint(issuer, 2_500 * COIN);
        vm.startPrank(issuer);
        usd.approve(address(usdVault), type(uint256).max);
        coin.approve(address(tokenVault), type(uint256).max);
        usdVault.deposit(5_000_000 * USD, issuer);
        tokenVault.deposit(2_500 * COIN, issuer);
        vm.stopPrank();

        // Reserve Security Funds start with a seed large enough for the crash cover of the tests' positions.
        usd.mint(address(hedgeFund), 100_000 * USD);
        usd.mint(address(shortFund), 100_000 * USD);

        usd.mint(trader, 1_000_000 * USD);
        vm.prank(trader);
        usd.approve(address(pm), type(uint256).max);
    }

    function _market(uint8 maxHedge, uint8 maxShort) internal view returns (BackxPositionManager.Market memory mk) {
        mk = BackxPositionManager.Market({
            enabled: true,
            usdVault: usdVault,
            tokenVault: tokenVault,
            adapter: ISwapAdapter(address(pool)),
            oracle: IPriceOracle(address(pool)),
            maxHedgeM: maxHedge,
            maxShortM: maxShort,
            maxNotionalUsd: uint128(50_000 * USD),
            maxOpenHedgeUsd: uint128(2_000_000 * USD),
            maxOpenShortUsd: uint128(2_000_000 * USD),
            crashBps: 3_000,
            pumpBps: 3_000,
            liqMarginBps: 0,
            openHedgeUsd: 0,
            openShortUsd: 0
        });
    }

    function _move(int256 bps) internal {
        pool.setPrice(uint256(int256(P0) * (10_000 + bps) / 10_000));
    }

    function _hedge(uint256 stake, uint8 m) internal returns (uint256 id) {
        vm.prank(trader);
        id = pm.openHedge(address(coin), stake, m, 0, 0);
    }

    function _short(uint256 stake, uint8 m) internal returns (uint256 id) {
        vm.prank(trader);
        id = pm.openShort(address(coin), stake, m, 0, 0);
    }

    /// Smallest adverse move (in 0.01 % steps from entry) at which the position becomes liquidatable.
    function _triggerBps(uint256 id, bool isShort) internal returns (int256) {
        for (int256 b = 1; b <= 6_000; b++) {
            _move(isShort ? b : -b);
            if (pm.isLiquidatable(id)) {
                _move(0);
                return isShort ? b : -b;
            }
        }
        _move(0);
        return 0;
    }
}
