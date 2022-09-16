pragma solidity 0.8.7;

interface ICurveGauge {
    function deposit(uint256 _value) external;

    function withdraw(uint256 _value, address _user, bool _claim_rewards) external;

    function balanceOf(address user) external view returns (uint256);

    function claimable_tokens(address addr) external returns (uint256);

    function claim_rewards(address _addr) external;
}
