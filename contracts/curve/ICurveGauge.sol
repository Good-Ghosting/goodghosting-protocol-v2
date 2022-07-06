pragma solidity 0.8.7;

interface ICurveGauge {
    function deposit(uint256 _value) external;

    function withdraw(uint256 _value, bool _claim_rewards) external;

    function claim_rewards() external;

    function balanceOf(address user) external view returns (uint256);

    function claimable_reward_write(address _addr, address _token) external returns (uint256);
}
