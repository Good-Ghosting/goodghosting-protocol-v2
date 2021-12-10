pragma solidity ^0.8.7;

import "./MintableERC20.sol";

contract MockMobiusMinter is MintableERC20 {
    constructor(string memory name, string memory symbol) MintableERC20(name, symbol) {}

    function mint(address gauge_addr) external {
        _mint(msg.sender, 100 ether);
    }
}
