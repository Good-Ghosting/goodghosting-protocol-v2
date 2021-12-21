pragma solidity ^0.8.7;

interface IMobiGauge {
    function stake(uint256 amount) external;

    function withdraw(uint256 amount) external;

    function getReward() external;

    function claim_rewards() external;

    function balanceOf(address user) external view returns (uint256);
}
