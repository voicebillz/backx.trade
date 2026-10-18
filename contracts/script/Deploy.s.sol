// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BackxReserveSecurityFund} from "../src/BackxReserveSecurityFund.sol";
import {BackxPositionManager} from "../src/BackxPositionManager.sol";

/// Deploys the core with the Safe as owner. NOT run yet: needs audit, the USD token address on
/// Robinhood Chain, the fee collector, and per-coin markets (vaults, adapter, oracle) set by the Safe.
/// The deployer key never becomes an owner: every contract is owned by SAFE from the constructor.
contract Deploy is Script {
    address constant SAFE = 0xfa408F75490C0412d4a5F45FA7553Aff03249BE4;

    function run() external {
        IERC20 usd = IERC20(vm.envAddress("BACKX_USD"));
        address feeCollector = vm.envAddress("BACKX_FEE_COLLECTOR");
        vm.startBroadcast();
        BackxReserveSecurityFund hedgeFund = new BackxReserveSecurityFund(usd, SAFE);
        BackxReserveSecurityFund shortFund = new BackxReserveSecurityFund(usd, SAFE);
        new BackxPositionManager(usd, hedgeFund, shortFund, feeCollector, SAFE);
        vm.stopBroadcast();
        // Then, from the Safe: fund.setManager(pm), per coin: deploy two BackxReserveVaults (owner SAFE),
        // vault.setManager(pm), pm.setMarket(coin, ...), pm.setKeeper(keeper, true).
    }
}
