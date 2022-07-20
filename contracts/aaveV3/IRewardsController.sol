// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.7;

interface IRewardsController {
    function claimAllRewardsToSelf(address[] calldata assets) external;

    function getAllUserRewards(address[] calldata assets, address user)
        external
        view
        returns (address[] memory rewardsList, uint256[] memory unclaimedAmounts);

    function getRewardsByAsset(address asset) external view returns (address[] memory);
}
