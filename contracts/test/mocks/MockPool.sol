// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {ISwapAdapter} from "../../src/interfaces/ISwapAdapter.sol";
import {IPriceOracle} from "../../src/interfaces/IPriceOracle.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice One usd/coin pool with the SAME cost model as docs/backx/sim: every swap pays
/// pool fee + price impact, impact = trade value / pool depth. Burns input, mints output.
contract MockPool is ISwapAdapter, IPriceOracle {
    MockERC20 public immutable usd;
    MockERC20 public immutable coin;
    uint256 public price;      // usd base units per 1e18 coin base units (spot)
    uint256 public twap;       // what the oracle reports (lags spot in manipulation tests)
    uint256 public feeBps;
    uint256 public depthUsd;   // usd base units

    constructor(MockERC20 usd_, MockERC20 coin_, uint256 price_, uint256 feeBps_, uint256 depthUsd_) {
        usd = usd_;
        coin = coin_;
        price = price_;
        twap = price_;
        feeBps = feeBps_;
        depthUsd = depthUsd_;
    }

    function setPrice(uint256 p) external {
        price = p;
        twap = p;
    }

    function setSpotOnly(uint256 p) external {
        price = p;
    }

    function _costBps(uint256 valueUsd) internal view returns (uint256) {
        return feeBps + valueUsd * 10_000 / depthUsd;
    }

    function quoteExactIn(address tokenIn, address, uint256 amountIn) public view returns (uint256) {
        if (tokenIn == address(usd)) {
            uint256 net = amountIn * (10_000 - _costBps(amountIn)) / 10_000;
            return net * 1e18 / price;
        }
        uint256 value = amountIn * price / 1e18;
        return value * (10_000 - _costBps(value)) / 10_000;
    }

    function quoteExactOut(address tokenIn, address, uint256 amountOut) public view returns (uint256) {
        if (tokenIn == address(usd)) {
            uint256 value = (amountOut * price + 1e18 - 1) / 1e18;
            return (value * (10_000 + _costBps(value)) + 9_999) / 10_000;
        }
        // coin in for exact usd out
        uint256 gross = (amountOut * (10_000 + _costBps(amountOut)) + 9_999) / 10_000;
        return (gross * 1e18 + price - 1) / price;
    }

    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to)
        external
        returns (uint256 out)
    {
        out = quoteExactIn(tokenIn, tokenOut, amountIn);
        require(out >= minOut, "minOut");
        MockERC20(tokenIn).burn(msg.sender, amountIn);
        MockERC20(tokenOut).mint(to, out);
    }

    function swapExactOut(address tokenIn, address tokenOut, uint256 amountOut, uint256 maxIn, address to)
        external
        returns (uint256 amountIn)
    {
        amountIn = quoteExactOut(tokenIn, tokenOut, amountOut);
        require(amountIn <= maxIn, "maxIn");
        MockERC20(tokenIn).burn(msg.sender, amountIn);
        MockERC20(tokenOut).mint(to, amountOut);
    }

    // ---- oracle (TWAP) ----
    function usdValue(address, uint256 amount) external view returns (uint256) {
        return amount * twap / 1e18;
    }

    function tokenAmount(address, uint256 usdAmount) external view returns (uint256) {
        return usdAmount * 1e18 / twap;
    }
}
