// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.7;

interface IncentiveController {
    function getRewardsBalance(address[] calldata assets, address user) external view returns (uint256);

    function claimRewards(address[] calldata assets, uint256 amount, address to) external returns (uint256);
}
