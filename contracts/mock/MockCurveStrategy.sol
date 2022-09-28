pragma solidity 0.8.7;

import "../strategies/CurveStrategy.sol";

contract MockCurveStrategy is CurveStrategy {
    constructor(
        ICurvePool _pool,
        int128 _inboundTokenIndex,
        uint64 _poolType,
        ICurveGauge _gauge,
        ICurveMinter _gaugeMinter,
        IERC20[] memory _rewardTokens
    ) CurveStrategy(_pool, _inboundTokenIndex, _poolType, _gauge, _gaugeMinter, _rewardTokens) {}

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
        uint256 totalAccumulatedAmount = 0;
        if (poolType == LENDING_POOL) {
            totalAccumulatedAmount = pool.calc_withdraw_one_coin(gaugeBalance, inboundTokenIndex);
        } else {
            totalAccumulatedAmount = pool.calc_withdraw_one_coin(gaugeBalance, uint256(uint128(inboundTokenIndex)));
        }
        return totalAccumulatedAmount;
    }
}
