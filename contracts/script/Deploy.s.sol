// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {BackxReserveVault} from "../src/BackxReserveVault.sol";
import {BackxReserveSecurityFund} from "../src/BackxReserveSecurityFund.sol";
import {BackxPositionManager} from "../src/BackxPositionManager.sol";
import {BackxMarketFactory} from "../src/BackxMarketFactory.sol";

/// One-time per chain: the three implementations and the factory (UUPS proxy), all owned by the Safe from the
/// first transaction. NOT run yet: needs the audit and owner sign-off. After this, every coin is added from the
/// admin portal (it prepares factory.createMarket for the Safe to sign) and nothing else is ever redeployed:
/// upgrades go through the beacons / the factory's UUPS upgrade, signed by the Safe.
/// The deployer key only pays gas; it never owns anything.
///
///   BACKX_USD=<USDC on this chain> BACKX_FEE_COLLECTOR=<addr> BACKX_KEEPER=<addr> BACKX_KEEPER_WALLET=<addr> \
///   forge script script/Deploy.s.sol --rpc-url <chain> --broadcast --verify
contract Deploy is Script {
    address constant SAFE = 0xfa408F75490C0412d4a5F45FA7553Aff03249BE4;

    function run() external {
        IERC20 usd = IERC20(vm.envAddress("BACKX_USD"));
        address feeCollector = vm.envAddress("BACKX_FEE_COLLECTOR");
        address keeper = vm.envAddress("BACKX_KEEPER");
        address keeperWallet = vm.envAddress("BACKX_KEEPER_WALLET");
        vm.startBroadcast();
        address vaultImpl = address(new BackxReserveVault());
        address fundImpl = address(new BackxReserveSecurityFund());
        address managerImpl = address(new BackxPositionManager());
        address factoryImpl = address(new BackxMarketFactory());
        BackxMarketFactory factory = BackxMarketFactory(address(new ERC1967Proxy(factoryImpl, abi.encodeCall(
            BackxMarketFactory.initialize, (SAFE, usd, vaultImpl, fundImpl, managerImpl, feeCollector, keeper, keeperWallet)))));
        vm.stopBroadcast();
        console.log("BackxMarketFactory", address(factory));
        console.log("set FACTORY_<chainId> on Railway to this address");
    }
}
