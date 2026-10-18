// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

/// @notice Manipulation-resistant price (TWAP over pool observations, or an external feed).
/// Values are in the market's USD token base units (e.g. USDC, 6 decimals).
interface IPriceOracle {
    function usdValue(address token, uint256 tokenAmount) external view returns (uint256 usdAmount);
    function tokenAmount(address token, uint256 usdAmount) external view returns (uint256 tokenAmount_);
}
