pragma solidity 0.8.7;

import "../strategies/MobiusStrategy.sol";

contract MockMobiusStrategy is MobiusStrategy {
    constructor(
        IMobiPool _pool,
        IMobiGauge _gauge,
        IMinter _minter,
        IERC20 _lpToken,
        uint8 _inboundTokenIndex,
        IERC20[] memory _rewardTokens
    ) MobiusStrategy(_pool, _gauge, _minter, _lpToken, _inboundTokenIndex, _rewardTokens) {}

    function getTotalAmount() external view override returns (uint256) {
        // this method mocks the strategy method to cover a scneario where the interest reduces but stays > 0
        // so we assign gaugeBalance a value based on the gauge balance value
        uint256 gaugeBalance;
        if (gauge.balanceOf(address(this)) >= 33 ether) {
            gaugeBalance = gauge.balanceOf(address(this));
        } else if (gauge.balanceOf(address(this)) > 30 ether && gauge.balanceOf(address(this)) < 33 ether) {
            gaugeBalance = 31 ether;
        } else {
            gaugeBalance = 400000000000000;
        }
        uint256 totalAccumulatedAmount = pool.calculateRemoveLiquidityOneToken(address(this), gaugeBalance, uint8(inboundTokenIndex));
        return totalAccumulatedAmount;
    }
}
