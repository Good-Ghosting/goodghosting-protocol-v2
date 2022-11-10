// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../aave/IncentiveController.sol";
import "./MintableERC20.sol";
import "../mock/MockWMatic.sol";

contract IncentiveControllerMock is IncentiveController {
    address public underlyingAssetAddress;

    MockWMatic reserve;

    constructor(MockWMatic _reserve) {
        reserve = _reserve;
    }

    /// ILendingPool interface
    function claimRewards(address[] calldata assets, uint256 amount, address to) public override returns (uint256) {
        reserve.transfer(msg.sender, reserve.balanceOf(address(this)));
        return amount;
    }

    function getRewardsBalance(address[] calldata assets, address user) external view override returns (uint256) {
        return reserve.balanceOf(address(this));
    }
}
