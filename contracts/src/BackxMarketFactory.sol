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
import {BackxManagerBase} from "./BackxManagerBase.sol";
import {BackxHedgeManager} from "./BackxHedgeManager.sol";
import {BackxShortManager} from "./BackxShortManager.sol";
import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @title backx.trade market factory: one per chain.
/// @notice createMarket deploys a coin's whole set in ONE transaction, isolated from every other coin:
///   Hedge: BackxHedgeManager + USDC reserve + Hedge Reserve Security Fund;
///   Short (when shortConfig.maxM > 0): BackxShortManager + the coin's own reserve + Short Reserve Security Fund.
/// addShort adds the Short side to a coin later. Every contract is a BeaconProxy: the Safe owns the four beacons and
/// upgrades a contract type for EVERY coin on the chain at once; balances and positions stay. The factory itself is
/// UUPS-upgradeable by the Safe. Only the Safe creates markets; the admin portal prepares the file, the Safe signs.
contract BackxMarketFactory is Initializable, UUPSUpgradeable, Ownable2StepUpgradeable {
    struct Set {
        BackxHedgeManager hedge;
        BackxReserveVault usdVault;
        BackxReserveSecurityFund hedgeFund;
        BackxShortManager short;               // address(0) without Short
        BackxReserveVault tokenVault;
        BackxReserveSecurityFund shortFund;
    }

    struct NewMarket {
        address token;
        address adapter;
        address oracle;
        BackxManagerBase.Config hedge;
        BackxManagerBase.Config short;         // maxM = 0: no Short side yet
    }

    UpgradeableBeacon public vaultBeacon;
    UpgradeableBeacon public fundBeacon;
    UpgradeableBeacon public hedgeBeacon;
    UpgradeableBeacon public shortBeacon;
    IERC20 public usd;
    address public feeCollector;
    mapping(address token => Set) internal _sets;
    address[] public tokens;

    event MarketCreated(address indexed token, address hedge, address usdVault, address hedgeFund);
    event ShortAdded(address indexed token, address short, address tokenVault, address shortFund);
    event FeeCollectorSet(address feeCollector);

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
        address hedgeImpl,
        address shortImpl,
        address feeCollector_
    ) external initializer {
        if (safe == address(0) || address(usd_) == address(0) || feeCollector_ == address(0)) revert BadValue();
        __Ownable_init(safe);
        __Ownable2Step_init();
        usd = usd_;
        vaultBeacon = new UpgradeableBeacon(vaultImpl, safe);
        fundBeacon = new UpgradeableBeacon(fundImpl, safe);
        hedgeBeacon = new UpgradeableBeacon(hedgeImpl, safe);
        shortBeacon = new UpgradeableBeacon(shortImpl, safe);
        feeCollector = feeCollector_;
        emit FeeCollectorSet(feeCollector_);
    }

    function setFeeCollector(address c) external onlyOwner {
        if (c == address(0)) revert BadValue();
        feeCollector = c;
        emit FeeCollectorSet(c);
    }

    /// @notice One coin, one isolated set of contracts, one transaction (signed by the Safe).
    function createMarket(NewMarket calldata n) external onlyOwner returns (Set memory s) {
        if (n.token == address(0) || n.token == address(usd) || n.adapter == address(0) || n.oracle == address(0)) revert BadValue();
        if (n.hedge.maxM == 0) revert BadValue();
        if (address(_sets[n.token].hedge) != address(0)) revert Exists();
        address safe = owner();
        string memory sym = IERC20Metadata(n.token).symbol();

        // The manager proxy first (empty), so the reserve and fund can name it as their only manager.
        s.hedge = BackxHedgeManager(address(new BeaconProxy(address(hedgeBeacon), "")));
        s.usdVault = _vault(usd, string.concat("backx USD reserve ", sym), string.concat("bxUSD-", sym), safe, address(s.hedge));
        s.hedgeFund = _fund(safe, address(s.hedge));
        s.hedge.initialize(_init(n.token, n.adapter, n.oracle, s.usdVault, s.hedgeFund, safe, n.hedge));
        _sets[n.token] = s;
        tokens.push(n.token);
        emit MarketCreated(n.token, address(s.hedge), address(s.usdVault), address(s.hedgeFund));
        if (n.short.maxM > 0) s = _addShort(n.token, n.adapter, n.oracle, n.short);
    }

    /// @notice Adds the Short side (the coin's own reserve, its fund and the Short manager) to an existing coin.
    function addShort(address token, address adapter, address oracle, BackxManagerBase.Config calldata c)
        external
        onlyOwner
        returns (Set memory)
    {
        if (address(_sets[token].hedge) == address(0) || adapter == address(0) || oracle == address(0) || c.maxM == 0) revert BadValue();
        return _addShort(token, adapter, oracle, c);
    }

    function _addShort(address token, address adapter, address oracle, BackxManagerBase.Config memory c) internal returns (Set memory s) {
        s = _sets[token];
        if (address(s.short) != address(0)) revert Exists();
        address safe = owner();
        string memory sym = IERC20Metadata(token).symbol();
        s.short = BackxShortManager(address(new BeaconProxy(address(shortBeacon), "")));
        s.tokenVault = _vault(IERC20(token), string.concat("backx ", sym, " reserve"), string.concat("bx", sym), safe, address(s.short));
        s.shortFund = _fund(safe, address(s.short));
        s.short.initialize(_init(token, adapter, oracle, s.tokenVault, s.shortFund, safe, c));
        _sets[token] = s;
        emit ShortAdded(token, address(s.short), address(s.tokenVault), address(s.shortFund));
    }

    function _vault(IERC20 asset, string memory name, string memory symbol, address safe, address manager)
        internal
        returns (BackxReserveVault)
    {
        return BackxReserveVault(address(new BeaconProxy(address(vaultBeacon), abi.encodeCall(
            BackxReserveVault.initialize, (asset, name, symbol, safe, manager, usd)))));
    }

    function _fund(address safe, address manager) internal returns (BackxReserveSecurityFund) {
        return BackxReserveSecurityFund(address(new BeaconProxy(address(fundBeacon), abi.encodeCall(
            BackxReserveSecurityFund.initialize, (usd, safe, manager)))));
    }

    function _init(
        address token,
        address adapter,
        address oracle,
        BackxReserveVault vault,
        BackxReserveSecurityFund fund,
        address safe,
        BackxManagerBase.Config memory c
    ) internal view returns (BackxManagerBase.Init memory a) {
        a = BackxManagerBase.Init({
            usd: usd, token: token, vault: vault, fund: fund, adapter: ISwapAdapter(adapter), oracle: IPriceOracle(oracle),
            feeCollector: feeCollector, owner: safe, config: c
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
