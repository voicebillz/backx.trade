// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockERC721 is ERC721 {
    constructor(string memory n, string memory s) ERC721(n, s) {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}
