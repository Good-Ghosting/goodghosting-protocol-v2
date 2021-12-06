pragma solidity 0.6.11;

// import "../libraries/LowGasSafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../mobius/IMobiPool.sol";
import "../mobius/IMobiGauge.sol";
import "./IStrategy.sol";

contract MobiusStrategy is Ownable, IStrategy {
    // using LowGasSafeMath for uint256;

    /// @notice pool address
    IMobiPool public pool;

    /// @notice gauge address
    IMobiGauge public immutable gauge;

    /// @notice mobi token
    IERC20 public immutable mobi;

    /// @notice mobi lp token
    IERC20 public lpToken;

    constructor(
        IMobiPool _pool,
        IMobiGauge _gauge,
        IERC20 _mobi
    ) public {
        require(address(_pool) != address(0), "invalid _pool address");
        require(address(_gauge) != address(0), "invalid _gauge address");
        require(address(_mobi) != address(0), "invalid _mobi address");
        pool = _pool;
        gauge = _gauge;
        mobi = _mobi;
        lpToken = IERC20(pool.getLpToken());
    }

    function invest(
        IERC20 _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount
    ) external override onlyOwner {
        uint256 contractBalance = _inboundCurrency.balanceOf(address(this));
        require(_inboundCurrency.approve(address(pool), contractBalance), "Fail to approve allowance to pool");

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _amount;
        amounts[1] = 0;

        pool.addLiquidity(amounts, _minAmount, block.timestamp + 1000);

        require(
            lpToken.approve(address(gauge), lpToken.balanceOf(address(this))),
            "Fail to approve allowance to gauge"
        );
        gauge.deposit(lpToken.balanceOf(address(this)));
    }

    function earlyWithdraw(
        IERC20 _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount
    ) external override onlyOwner {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _amount;
        amounts[1] = 0;

        uint256 gaugeBalance = gauge.balanceOf(address(this));
        if (gaugeBalance > 0) {
            uint256 poolWithdrawAmount = pool.calculateTokenAmount(address(this), amounts, true);

            if (gaugeBalance < poolWithdrawAmount) {
                poolWithdrawAmount = gaugeBalance;
            }

            gauge.withdraw(poolWithdrawAmount, false);
            require(lpToken.approve(address(pool), poolWithdrawAmount), "Fail to approve allowance to pool");

            pool.removeLiquidityOneToken(poolWithdrawAmount, 0, _minAmount, block.timestamp + 1000);
        }
        // msg.sender will always be the pool contract (new owner)
        require(_inboundCurrency.transfer(msg.sender, _inboundCurrency.balanceOf(address(this))), "Transfer Failed");
    }

    function redeem(IERC20 _inboundCurrency, uint256 _minAmount) external override onlyOwner {
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        if (gaugeBalance > 0) {
            gauge.withdraw(gaugeBalance, true);
            require(
                lpToken.approve(address(pool), lpToken.balanceOf(address(this))),
                "Fail to approve allowance to pool"
            );
            pool.removeLiquidityOneToken(lpToken.balanceOf(address(this)), 0, _minAmount, block.timestamp + 1000);
        }
        if (address(mobi) != address(0)) {
            require(mobi.transfer(msg.sender, mobi.balanceOf(address(this))), "Transfer Failed");
        }
        require(_inboundCurrency.transfer(msg.sender, _inboundCurrency.balanceOf(address(this))), "Transfer Failed");
    }

    function getRewardToken() external view override returns (IERC20) {
        return IERC20(address(0));
    }

    function getGovernanceToken() external view override returns (IERC20) {
        return mobi;
    }
}
