pragma solidity >=0.6.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStrategy {
    function invest(
        IERC20 _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount
    ) external;

    function earlyWithdraw(
        IERC20 _inboundCurrency,
        address _game,
        uint256 _amount
    ) external;

    function redeem(IERC20 _inboundCurrency, address _game) external;

    function getRewardToken() external view returns (IERC20);

    function getGovernanceToken() external view returns (IERC20);
}
