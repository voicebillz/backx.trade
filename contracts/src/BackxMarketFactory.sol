// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {BackxReserveVault} from "./BackxReserveVault.sol";
import {BackxReserveSecurityFund} from "./BackxReserveSecurityFund.sol";
import {BackxPositionManager} from "./BackxPositionManager.sol";
import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @title backx.trade market factory: one per chain.
/// @notice createMarket deploys a coin's whole set in ONE transaction, isolated from every other coin:
///   - BackxReserveVault (Issue Reserve, USDC) that backs its hedges,
///   - BackxReserveSecurityFund for its gaps,
///   - BackxPositionManager that opens, closes and liquidates its positions,
///   - optionally the Short side (token reserve + its own fund), off in the product for now.
/// A bug or a bad price on one coin cannot touch another coin's reserve, fund or positions.
///
/// Upgrades without redeploying (owner 2026-10-19): every contract is a BeaconProxy. The Safe owns the three
/// beacons and calls `upgradeTo(newCode)` on one of them to upgrade that contract type for EVERY coin on the
/// chain at once; addresses, balances, shares and open positions stay. The factory itself is UUPS-upgradeable by
/// the Safe. Only the Safe can create markets or upgrade; the admin portal prepares the transaction, the Safe signs.
contract BackxMarketFactory is Initializable, UUPSUpgradeable, Ownable2StepUpgradeable {
    struct Set {
        BackxPositionManager manager;
        BackxReserveVault usdVault;
        BackxReserveSecurityFund hedgeFund;
        BackxReserveVault tokenVault;          // address(0) without Short
        BackxReserveSecurityFund shortFund;    // address(0) without Short
    }

    /// @notice What the admin portal fills in per coin. Pool/oracle are the coin's swap adapter and TWAP oracle.
    struct NewMarket {
        address token;
        address adapter;
        address oracle;
        uint8 maxHedgeM;
        uint8 maxShortM;           // 0 = Short off (no token reserve is deployed)
        uint128 maxNotionalUsd;
        uint128 maxOpenHedgeUsd;
        uint128 maxOpenShortUsd;
        uint16 crashBps;
        uint16 pumpBps;
        uint16 liqMarginBps;
    }

    UpgradeableBeacon public vaultBeacon;
    UpgradeableBeacon public fundBeacon;
    UpgradeableBeacon public managerBeacon;
    IERC20 public usd;
    address public feeCollector;
    address public keeper;
    address public keeperWallet;
    mapping(address token => Set) internal _sets;
    address[] public tokens;

    event MarketCreated(address indexed token, address manager, address usdVault, address hedgeFund, address tokenVault, address shortFund);
    event DefaultsSet(address feeCollector, address keeper, address keeperWallet);

    error Exists();
    error BadValue();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @param safe owner of the factory, the beacons and every contract it creates.
    function initialize(
        address safe,
        IERC20 usd_,
        address vaultImpl,
        address fundImpl,
        address managerImpl,
        address feeCollector_,
        address keeper_,
        address keeperWallet_
    ) external initializer {
        if (safe == address(0) || address(usd_) == address(0)) revert BadValue();
        __Ownable_init(safe);
        __Ownable2Step_init();
        usd = usd_;
        vaultBeacon = new UpgradeableBeacon(vaultImpl, safe);
        fundBeacon = new UpgradeableBeacon(fundImpl, safe);
        managerBeacon = new UpgradeableBeacon(managerImpl, safe);
        _setDefaults(feeCollector_, keeper_, keeperWallet_);
    }

    function setDefaults(address feeCollector_, address keeper_, address keeperWallet_) external onlyOwner {
        _setDefaults(feeCollector_, keeper_, keeperWallet_);
    }

    function _setDefaults(address feeCollector_, address keeper_, address keeperWallet_) internal {
        if (feeCollector_ == address(0)) revert BadValue();
        feeCollector = feeCollector_;
        keeper = keeper_;
        keeperWallet = keeperWallet_;
        emit DefaultsSet(feeCollector_, keeper_, keeperWallet_);
    }

    /// @notice One coin, one isolated set of contracts, one transaction (signed by the Safe).
    function createMarket(NewMarket calldata n) external onlyOwner returns (Set memory s) {
        if (n.token == address(0) || n.token == address(usd) || n.adapter == address(0) || n.oracle == address(0)) revert BadValue();
        if (n.maxHedgeM == 0 || n.maxHedgeM > 30 || n.liqMarginBps > 500) revert BadValue();
        if (address(_sets[n.token].manager) != address(0)) revert Exists();
        address safe = owner();
        string memory sym = IERC20Metadata(n.token).symbol();

        // The manager proxy first (empty), so the reserves and funds can name it as their only manager.
        s.manager = BackxPositionManager(address(new BeaconProxy(address(managerBeacon), "")));
        s.usdVault = BackxReserveVault(address(new BeaconProxy(address(vaultBeacon), abi.encodeCall(
            BackxReserveVault.initialize, (usd, string.concat("backx USD reserve ", sym), string.concat("bxUSD-", sym), safe, address(s.manager))))));
        s.hedgeFund = BackxReserveSecurityFund(address(new BeaconProxy(address(fundBeacon), abi.encodeCall(
            BackxReserveSecurityFund.initialize, (usd, safe, address(s.manager))))));
        if (n.maxShortM > 0) {
            s.tokenVault = BackxReserveVault(address(new BeaconProxy(address(vaultBeacon), abi.encodeCall(
                BackxReserveVault.initialize, (IERC20(n.token), string.concat("backx ", sym, " reserve"), string.concat("bx", sym), safe, address(s.manager))))));
            s.shortFund = BackxReserveSecurityFund(address(new BeaconProxy(address(fundBeacon), abi.encodeCall(
                BackxReserveSecurityFund.initialize, (usd, safe, address(s.manager))))));
        }

        // Initialised in this same transaction: nobody can front-run it.
        s.manager.initialize(_init(n, s, safe));
        _sets[n.token] = s;
        tokens.push(n.token);
        emit MarketCreated(n.token, address(s.manager), address(s.usdVault), address(s.hedgeFund), address(s.tokenVault), address(s.shortFund));
    }

    function _init(NewMarket calldata n, Set memory s, address safe) internal view returns (BackxPositionManager.Init memory a) {
        a.usd = usd;
        a.hedgeFund = s.hedgeFund;
        a.shortFund = s.shortFund;
        a.feeCollector = feeCollector;
        a.owner = safe;
        a.keeper = keeper;
        a.keeperWallet = keeperWallet;
        a.token = n.token;
        a.market = BackxPositionManager.Market({
            enabled: true, usdVault: s.usdVault, tokenVault: s.tokenVault,
            adapter: ISwapAdapter(n.adapter), oracle: IPriceOracle(n.oracle),
            maxHedgeM: n.maxHedgeM, maxShortM: n.maxShortM, maxNotionalUsd: n.maxNotionalUsd,
            maxOpenHedgeUsd: n.maxOpenHedgeUsd, maxOpenShortUsd: n.maxOpenShortUsd, openHedgeUsd: 0, openShortUsd: 0,
            crashBps: n.crashBps, pumpBps: n.pumpBps, liqMarginBps: n.liqMarginBps
        });
    }

    // ---- reads (admin portal checks deployments with these) ---------------------------------------------------

    function setOf(address token) external view returns (Set memory) {
        return _sets[token];
    }

    function marketCount() external view returns (uint256) {
        return tokens.length;
    }

    /// @dev Only the Safe can replace the factory's own code.
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
