pragma solidity >=0.6.11;

import "../libraries/LowGasSafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../curve/ICurvePool.sol";
import "../curve/ICurveGauge.sol";
import "./IStrategy.sol";

contract CurveStrategy is Ownable, IStrategy {
    using LowGasSafeMath for uint256;

    /// @notice pool address
    ICurvePool public immutable pool;

    /// @notice gauge address
    ICurveGauge public immutable gauge;

    /// @notice wmatic in case of polygon deployment else address(0)
    IERC20 public immutable rewardToken;

    /// @notice curve token
    IERC20 public immutable curve;

    /// @notice curve lp token
    IERC20 public lpToken;

    /// @notice token index in the pool in int form
    int128 public immutable inboundTokenIndexInt;

    /// @notice token index in the pool in uint form
    uint256 public immutable inboundTokenIndexUint;

    /// @notice total tokens in aave pool
    uint64 public constant numAaveTokens = 3;

    /// @notice total tokens in atricrypto pool
    uint64 public constant numAtricryptoTokens = 5;

    /// @notice flag to differentiate between aave and atricrypto pool
    uint64 public immutable poolType;

    constructor(
        ICurvePool _pool,
        int128 _inboundTokenIndexInt,
        uint128 _inboundTokenIndexUint,
        uint64 _poolType,
        ICurveGauge _gauge,
        IERC20 _rewardToken,
        IERC20 _curve
    ) {
        require(address(_pool) != address(0), "invalid _pool address");
        require(address(_gauge) != address(0), "invalid _gauge address");
        require(address(_curve) != address(0), "invalid _curve address");
        pool = _pool;
        gauge = _gauge;
        curve = _curve;
        poolType = _poolType;
        inboundTokenIndexInt = _inboundTokenIndexInt;
        inboundTokenIndexUint = _inboundTokenIndexUint;
        // wmatic in case of polygon and address(0) for non-polygon deployment
        rewardToken = _rewardToken;
        if (_poolType == 0) {
            lpToken = IERC20(pool.lp_token());
        } else if (_poolType == 1) {
            lpToken = IERC20(pool.token());
        }
    }

    function invest(
        IERC20 _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount
    ) external override onlyOwner {
        uint256 contractBalance = _inboundCurrency.balanceOf(address(this));
        require(_inboundCurrency.approve(address(pool), contractBalance), "Fail to approve allowance to pool");
        // numAaveTokens/numAtricryptoTokens has to be a constant type actually otherwise the signature becomes diff. and the external call will fail if I use an "if" condition the assignment will be to a non-constant ver, this again is due to the structure of how the curve contracts are written
        if (poolType == 0) {
            uint256[numAaveTokens] memory amounts;
            for (uint256 i = 0; i < numAaveTokens; i++) {
                if (i == inboundTokenIndexUint) {
                    amounts[i] = _amount;
                } else {
                    amounts[i] = 0;
                }
            }
            pool.add_liquidity(amounts, _minAmount, true);
        } else if (poolType == 1) {
            uint256[numAtricryptoTokens] memory amounts;
            for (uint256 i = 0; i < numAtricryptoTokens; i++) {
                if (i == inboundTokenIndexUint) {
                    amounts[i] = _amount;
                } else {
                    amounts[i] = 0;
                }
            }
            pool.add_liquidity(amounts, _minAmount);
        }
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
        // code of aave and atricrypto pool is completely different , in the case of aave i.e pool type 0 all funds sit in that contract, but atricrypto is in communication with other pools and funds sit in those pools hence the approval is needed because it is talking with external contracts
        // numAaveTokens/numAtricryptoTokens has to be a constant type actually otherwise the signature becomes diff. and the external call will fail if I use an "if" condition the assignment will be to a non-constant ver, this again is due to the structure of how the curve contracts are written
        if (poolType == 0) {
            uint256[numAaveTokens] memory amounts;
            for (uint256 i = 0; i < numAaveTokens; i++) {
                if (i == inboundTokenIndexUint) {
                    amounts[i] = _amount;
                } else {
                    amounts[i] = 0;
                }
            }
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

            if (gauge.balanceOf(address(this)) < poolWithdrawAmount) {
                poolWithdrawAmount = gauge.balanceOf(address(this));
            }

            gauge.withdraw(poolWithdrawAmount, false);

            pool.remove_liquidity_one_coin(poolWithdrawAmount, inboundTokenIndexInt, _minAmount, true);
        } else if (poolType == 1) {
            uint256[numAtricryptoTokens] memory amounts;
            for (uint256 i = 0; i < numAtricryptoTokens; i++) {
                if (i == inboundTokenIndexUint) {
                    amounts[i] = _amount;
                } else {
                    amounts[i] = 0;
                }
            }
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

            if (gauge.balanceOf(address(this)) < poolWithdrawAmount) {
                poolWithdrawAmount = gauge.balanceOf(address(this));
            }

            gauge.withdraw(poolWithdrawAmount, false);

            require(lpToken.approve(address(pool), poolWithdrawAmount), "Fail to approve allowance to pool");
            pool.remove_liquidity_one_coin(poolWithdrawAmount, inboundTokenIndexUint, _minAmount);
        }
        // msg.sender will always be the pool contract (new owner)
        require(_inboundCurrency.transfer(msg.sender, _inboundCurrency.balanceOf(address(this))), "Transfer Failed");
    }

    function redeem(IERC20 _inboundCurrency, uint256 _minAmount) external override onlyOwner {
        uint256 lpBalance = gauge.balanceOf(address(this));
        gauge.withdraw(lpBalance, true);
        // code of aave and atricrypto pool is completely different , in the case of aave i.e pool type 0 all funds sit in that contract, but atricrypto is in communication with other pools and funds sit in those pools hence the approval is needed because it is talking with external contracts
        // numAaveTokens/numAtricryptoTokens has to be a constant type actually otherwise the signature becomes diff. and the external call will fail if I use an "if" condition the assignment will be to a non-constant ver, this again is due to the structure of how the curve contracts are written
        if (poolType == 0) {
            pool.remove_liquidity_one_coin(lpToken.balanceOf(address(this)), inboundTokenIndexInt, _minAmount, true);
        } else if (poolType == 1) {
            require(
                lpToken.approve(address(pool), lpToken.balanceOf(address(this))),
                "Fail to approve allowance to pool"
            );

            pool.remove_liquidity_one_coin(lpToken.balanceOf(address(this)), inboundTokenIndexUint, _minAmount);
        }
        if (address(rewardToken) != address(0)) {
            require(rewardToken.transfer(msg.sender, rewardToken.balanceOf(address(this))), "Transfer Failed");
        }
        if (address(curve) != address(0)) {
            require(curve.transfer(msg.sender, curve.balanceOf(address(this))), "Transfer Failed");
        }
        require(_inboundCurrency.transfer(msg.sender, _inboundCurrency.balanceOf(address(this))), "Transfer Failed");
    }

    function getRewardToken() external view override returns (IERC20) {
        return rewardToken;
    }

    function getGovernanceToken() external view override returns (IERC20) {
        return curve;
    }
}
