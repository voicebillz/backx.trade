// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {BackxReserveVault} from "../src/BackxReserveVault.sol";
import {BackxReserveSecurityFund} from "../src/BackxReserveSecurityFund.sol";
import {BackxHedgeManager} from "../src/BackxHedgeManager.sol";
import {BackxShortManager} from "../src/BackxShortManager.sol";
import {BackxMarketFactory} from "../src/BackxMarketFactory.sol";

/// One-time per chain: the four implementations and the factory (UUPS proxy), all owned by the Safe from the first
/// transaction. NOT run yet: needs the audit and owner sign-off. The admin portal does the same through the Safe
/// (CREATE2 files, Admin → Contracts); this script is the manual alternative. After this, every coin is added from
/// the admin portal (factory.createMarket, signed by the Safe) and nothing is ever redeployed: upgrades go through
/// the beacons / the factory's UUPS upgrade. The deployer key only pays gas; it never owns anything.
///
///   BACKX_USD=<USDC on this chain> BACKX_FEE_COLLECTOR=<addr> \
///   forge script script/Deploy.s.sol --rpc-url <chain> --broadcast --verify
contract Deploy is Script {
    address constant SAFE = 0xfa408F75490C0412d4a5F45FA7553Aff03249BE4;

    function run() external {
        IERC20 usd = IERC20(vm.envAddress("BACKX_USD"));
        address feeCollector = vm.envAddress("BACKX_FEE_COLLECTOR");
        vm.startBroadcast();
        address vaultImpl = address(new BackxReserveVault());
        address fundImpl = address(new BackxReserveSecurityFund());
        address hedgeImpl = address(new BackxHedgeManager());
        address shortImpl = address(new BackxShortManager());
        address factoryImpl = address(new BackxMarketFactory());
        BackxMarketFactory factory = BackxMarketFactory(address(new ERC1967Proxy(factoryImpl, abi.encodeCall(
            BackxMarketFactory.initialize, (SAFE, usd, vaultImpl, fundImpl, hedgeImpl, shortImpl, feeCollector)))));
        vm.stopBroadcast();
        console.log("BackxMarketFactory", address(factory));
        console.log("set FACTORY_<chainId> on Railway to this address");
    }
}
