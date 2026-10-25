// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    /// Security tests: a blacklisted address cannot receive (like USDC's blacklist).
    mapping(address => bool) public blocked;

    function setBlocked(address a, bool on) external {
        blocked[a] = on;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blocked[to], "blacklisted");
        super._update(from, to, value);
    }
}
