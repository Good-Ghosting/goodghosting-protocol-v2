pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStrategy {
    function invest(address _inboundCurrency, uint256 _minAmount) external payable;

    function earlyWithdraw(
        address _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount
    ) external;

    function redeem(
        address _inboundCurrency,
        uint256 _amount,
        bool variableDeposits,
        uint256 _minAmount
    ) external;

    function getTotalAmount(address _inboundCurrency) external view returns (uint256);

    function getAccumalatedRewardTokenAmount(address _inboundCurrency) external returns (uint256);

    function getAccumalatedGovernanceTokenAmount(address _inboundCurrency) external returns (uint256);

    function getRewardToken() external view returns (IERC20);

    function getGovernanceToken() external view returns (IERC20);
}
