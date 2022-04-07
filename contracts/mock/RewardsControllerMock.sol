// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../aaveV3/IRewardsController.sol";
import "./MintableERC20.sol";
import "../mock/MockWMatic.sol";

contract RewardsControllerMock is IRewardsController {
    address public underlyingAssetAddress;

    MockWMatic reserve;

    constructor(MockWMatic _reserve) {
        reserve = _reserve;
    }

    function claimAllRewardsToSelf(address[] calldata assets) external override {
        reserve.transfer(msg.sender, reserve.balanceOf(address(this)));
    }

    function getAllUserRewards(address[] calldata assets, address user) external override view returns (address[] memory rewardsList, uint256[] memory unclaimedAmounts) {
        rewardsList = new address[](1);
        rewardsList[0] = address(reserve);
        unclaimedAmounts = new uint256[](1);
        unclaimedAmounts[0] = reserve.balanceOf(address(this));
    }

    function getRewardsByAsset(address asset) external override view returns (address[] memory) {
        address[] memory rewardsList = new address[](1);
        rewardsList[0] = address(reserve); 
        return rewardsList;
    }
}
