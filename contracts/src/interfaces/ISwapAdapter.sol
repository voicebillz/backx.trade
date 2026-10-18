// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

/// @notice Routing engine for one market (PCS Infinity + Uniswap v4 behind it). Trusted, set by the Safe.
/// Every swap pulls exactly `amountIn`/up to `maxIn` from the caller and sends output to `to`.
interface ISwapAdapter {
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to)
        external
        returns (uint256 amountOut);

    function swapExactOut(address tokenIn, address tokenOut, uint256 amountOut, uint256 maxIn, address to)
        external
        returns (uint256 amountIn);

    /// @dev Net of pool fee and price impact: what a swap would return right now.
    function quoteExactIn(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256);

    /// @dev Input needed (incl. fee and impact) to receive exactly `amountOut` right now.
    function quoteExactOut(address tokenIn, address tokenOut, uint256 amountOut) external view returns (uint256);
}
