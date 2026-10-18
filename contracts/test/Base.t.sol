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

    /// deep = 0.05 % fee, $10M depth (sim "BTC-type"); meme = 0.3 %, $1M.
    function _deploy(uint256 feeBps, uint256 depthUsd) internal {
        usd = new MockERC20("USD Coin", "USDC", 6);
        coin = new MockERC20("Coin", "COIN", 18);
        pool = new MockPool(usd, coin, P0, feeBps, depthUsd);

        usdVault = new BackxReserveVault(IERC20(address(usd)), "backx USD reserve COIN", "bxUSD-COIN", safe);
        tokenVault = new BackxReserveVault(IERC20(address(coin)), "backx COIN reserve", "bxCOIN", safe);
        hedgeFund = new BackxReserveSecurityFund(IERC20(address(usd)), safe);
        shortFund = new BackxReserveSecurityFund(IERC20(address(usd)), safe);
        pm = new BackxPositionManager(IERC20(address(usd)), hedgeFund, shortFund, feeCollector, safe);

        vm.startPrank(safe);
        usdVault.setManager(address(pm));
        tokenVault.setManager(address(pm));
        hedgeFund.setManager(address(pm));
        shortFund.setManager(address(pm));
        pm.setKeeper(keeper, true);
        pm.setMarket(address(coin), _market(30, 30));
        vm.stopPrank();

        // Issuers: $5M USD reserve, 2,500 coins ($5M) token reserve.
        usd.mint(issuer, 5_000_000 * USD);
        coin.mint(issuer, 2_500 * COIN);
        vm.startPrank(issuer);
        usd.approve(address(usdVault), type(uint256).max);
        coin.approve(address(tokenVault), type(uint256).max);
        usdVault.deposit(5_000_000 * USD, issuer);
        tokenVault.deposit(2_500 * COIN, issuer);
        vm.stopPrank();

        // Reserve Security Funds start with a small seed.
        usd.mint(address(hedgeFund), 1_000 * USD);
        usd.mint(address(shortFund), 1_000 * USD);

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
            openHedgeUsd: 0,
            openShortUsd: 0
        });
    }

    function _move(int256 bps) internal {
        pool.setPrice(uint256(int256(P0) * (10_000 + bps) / 10_000));
    }

    function _hedge(uint256 stake, uint8 m) internal returns (uint256 id) {
        vm.prank(trader);
        id = pm.openHedge(address(coin), stake, m, 0);
    }

    function _short(uint256 stake, uint8 m) internal returns (uint256 id) {
        vm.prank(trader);
        id = pm.openShort(address(coin), stake, m, 0);
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
