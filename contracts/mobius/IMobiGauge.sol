pragma solidity ^0.8.7;

interface IMobiGauge {
    function deposit(uint256 _value) external;

    function withdraw(uint256 _value, bool _claim_rewards) external;

    function claim_rewards() external;

    function balanceOf(address user) external view returns (uint256);

    function claimable_reward(address _addr, address _token) external returns (uint256);

    function claimable_tokens(address _addr) external returns (uint256);
}
