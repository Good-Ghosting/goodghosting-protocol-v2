pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStrategy {
    function invest(IERC20 _inboundCurrency, uint256 _minAmount) external;

    function earlyWithdraw(
        IERC20 _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount
    ) external;

    function redeem(IERC20 _inboundCurrency, uint256 _minAmount) external;

    function getRewardToken() external view returns (IERC20);

    function getGovernanceToken() external view returns (IERC20);
}
