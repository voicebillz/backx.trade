// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BackxReserveVault} from "../src/BackxReserveVault.sol";
import {BackxReserveSecurityFund} from "../src/BackxReserveSecurityFund.sol";
import {BackxManagerBase} from "../src/BackxManagerBase.sol";
import {BackxHedgeManager} from "../src/BackxHedgeManager.sol";
import {BackxShortManager} from "../src/BackxShortManager.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPool} from "./mocks/MockPool.sol";
import {BackxMarketFactory} from "../src/BackxMarketFactory.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// Shared setup: one coin, both sides (Hedge on a USDC reserve, Short on the coin's own reserve), both funds seeded.
/// Pool model = docs/backx/sim (fee + impact = value / depth), so contract numbers can be checked against the sims.
abstract contract Base is Test {
    MockERC20 usd;
    MockERC20 coin;
    MockPool pool;
    BackxReserveVault usdVault;
    BackxReserveVault tokenVault;
    BackxReserveSecurityFund hedgeFund;
    BackxReserveSecurityFund shortFund;
    BackxHedgeManager hm;
    BackxShortManager sm;

    address safe = makeAddr("safe");
    address feeCollector = makeAddr("feeCollector");
    address validator = makeAddr("validator");
    address trader = makeAddr("trader");
    address issuer = makeAddr("issuer");

    // Stablecoin decimals: 6 (USDC on Robinhood/Base/Arbitrum) by default; `USD_DECIMALS=18 forge test` runs the
    // whole suite as on BNB Chain, where the USDC token has 18 decimals.
    uint8 USD_DEC = uint8(vm.envOr("USD_DECIMALS", uint256(6)));
    uint256 USD = 10 ** uint256(USD_DEC); // 1 USDC
    uint256 constant COIN = 1e18;        // 1 coin
    uint256 P0 = 2_000 * USD;            // $2,000 per coin (ETH-like)

    BackxMarketFactory factory;

    function _cfg(uint8 maxM, uint16 margin, uint16 roof) internal view returns (BackxManagerBase.Config memory) {
        return BackxManagerBase.Config({
            enabled: true, maxM: maxM, stressBps: 3_000, liqMarginBps: margin, roofBps: roof,
            maxNotionalUsd: uint128(50_000 * USD), maxOpenUsd: uint128(2_000_000 * USD)
        });
    }

    /// Everything is created the way production does it: implementations behind beacons, one factory per chain,
    /// one createMarket call (by the Safe) per coin.
    function _deploy(uint256 feeBps, uint256 depthUsd) internal {
        usd = new MockERC20("USD Coin", "USDC", USD_DEC);
        coin = new MockERC20("Coin", "COIN", 18);
        pool = new MockPool(usd, coin, P0, feeBps, depthUsd);

        BackxMarketFactory impl = new BackxMarketFactory();
        factory = BackxMarketFactory(address(new ERC1967Proxy(address(impl), abi.encodeCall(BackxMarketFactory.initialize, (
            safe, IERC20(address(usd)), address(new BackxReserveVault()), address(new BackxReserveSecurityFund()),
            address(new BackxHedgeManager()), address(new BackxShortManager()), feeCollector)))));

        vm.prank(safe);
        BackxMarketFactory.Set memory s = factory.createMarket(BackxMarketFactory.NewMarket({
            token: address(coin), adapter: address(pool), oracle: address(pool),
            hedge: _cfg(30, 0, 0), short: _cfg(30, 0, 8_000)
        }));
        hm = s.hedge;
        sm = s.short;
        usdVault = s.usdVault;
        tokenVault = s.tokenVault;
        hedgeFund = s.hedgeFund;
        shortFund = s.shortFund;

        // Issuers: $5M USD reserve (Hedge), 2,500 coins ($5M) in the coin's reserve (Short).
        usd.mint(issuer, 5_000_000 * USD);
        coin.mint(issuer, 2_500 * COIN);
        vm.startPrank(issuer);
        usd.approve(address(usdVault), type(uint256).max);
        coin.approve(address(tokenVault), type(uint256).max);
        usdVault.deposit(5_000_000 * USD, issuer);
        tokenVault.deposit(2_500 * COIN, issuer);
        vm.stopPrank();

        // Reserve Security Funds start with a seed large enough for the tests' gaps.
        usd.mint(address(hedgeFund), 100_000 * USD);
        usd.mint(address(shortFund), 100_000 * USD);

        usd.mint(trader, 1_000_000 * USD);
        vm.startPrank(trader);
        usd.approve(address(hm), type(uint256).max);
        usd.approve(address(sm), type(uint256).max);
        vm.stopPrank();
    }

    function _setCfg(BackxManagerBase m, BackxManagerBase.Config memory c) internal {
        vm.prank(safe);
        m.setConfig(c);
    }

    function _move(int256 bps) internal {
        pool.setPrice(uint256(int256(P0) * (10_000 + bps) / 10_000));
    }

    function _hedge(uint256 amount, uint8 m) internal returns (uint256 id) {
        vm.prank(trader);
        id = hm.open(amount, m, 0, 0);
    }

    function _short(uint256 amount, uint8 m) internal returns (uint256 id) {
        vm.prank(trader);
        id = sm.open(amount, m, 0, 0);
    }

    function _pos(BackxManagerBase m, uint256 id) internal view returns (BackxManagerBase.Position memory p) {
        (p.owner, p.m, p.openedAt, p.gas, p.stake, p.lent, p.amount, p.lentUsd, p.limitValue, p.stressUsd, p.stopValue) = m.positions(id);
    }

    /// Smallest adverse move (in 0.01 % steps from entry) at which the position becomes liquidatable.
    function _triggerBps(BackxManagerBase m, uint256 id, bool isShort) internal returns (int256) {
        for (int256 b = 1; b <= 6_000; b++) {
            _move(isShort ? b : -b);
            if (m.isLiquidatable(id)) {
                _move(0);
                return isShort ? b : -b;
            }
        }
        _move(0);
        return 0;
    }
}
