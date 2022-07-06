pragma solidity 0.8.7;

import "./MintableERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockMobiusMinter is MintableERC20 {
    constructor(string memory name, string memory symbol) MintableERC20(name, symbol) {
        _mint(address(this), 100000 ether);
    }

    function mint(address gauge_addr) external {
        IERC20(address(this)).transfer(msg.sender, IERC20(address(this)).balanceOf(address(this)));
    }
}
