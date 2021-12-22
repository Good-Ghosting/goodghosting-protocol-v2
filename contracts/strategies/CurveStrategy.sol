pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../curve/ICurvePool.sol";
import "../curve/ICurveGauge.sol";
import "./IStrategy.sol";

contract CurveStrategy is Ownable, IStrategy {
    /// @notice pool address
    ICurvePool public pool;

    /// @notice gauge address
    ICurveGauge public immutable gauge;

    /// @notice reward token address for eg wmatic in case of polygon deployment
    IERC20 public immutable rewardToken;

    /// @notice curve token
    IERC20 public immutable curve;

    /// @notice curve lp token
    IERC20 public lpToken;

    /// @notice token index in the pool in int form
    int128 public immutable inboundTokenIndex;

    /// @notice total tokens in aave pool
    uint64 public constant NUM_AAVE_TOKENS = 3;

    /// @notice total tokens in atricrypto pool
    uint64 public constant NUM_ATRI_CRYPTO_TOKENS = 5;

    /// @notice identifies the "Aave Pool" Type
    uint64 public constant AAVE_POOL = 0;

    /// @notice identifies the "Atri Crypto Pool" Type
    uint64 public constant ATRI_CRYPTO_POOL = 1;

    /// @notice flag to differentiate between aave and atricrypto pool
    uint64 public immutable poolType;

    constructor(
        ICurvePool _pool,
        int128 _inboundTokenIndex,
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
        inboundTokenIndex = _inboundTokenIndex;
        // wmatic in case of polygon and address(0) for non-polygon deployment
        rewardToken = _rewardToken;
        if (_poolType == 0) {
            lpToken = IERC20(pool.lp_token());
        } else if (_poolType == 1) {
            lpToken = IERC20(pool.token());
        }
    }

    function invest(address _inboundCurrency, uint256 _minAmount) external payable override onlyOwner {
        uint256 contractBalance = IERC20(_inboundCurrency).balanceOf(address(this));
        require(IERC20(_inboundCurrency).approve(address(pool), contractBalance), "Fail to approve allowance to pool");
        /*
        Constants "NUM_AAVE_TOKENS" and "NUM_ATRI_CRYPTO_TOKENS" have to be a constant type actually,
            otherwise the signature becomes different and the external call will fail.
            If we use an "if" condition based on pool type, and dynamically set
            a value for these variables, the assignment will be to a non-constant
            which will result in failure. This is due to the structure of how
            the curve contracts are written
        */
        if (poolType == AAVE_POOL) {
            uint256[NUM_AAVE_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = contractBalance;
            pool.add_liquidity(amounts, _minAmount, true);
        } else if (poolType == ATRI_CRYPTO_POOL) {
            uint256[NUM_ATRI_CRYPTO_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = contractBalance;
            pool.add_liquidity(amounts, _minAmount);
        }

        require(
            lpToken.approve(address(gauge), lpToken.balanceOf(address(this))),
            "Fail to approve allowance to gauge"
        );
        gauge.deposit(lpToken.balanceOf(address(this)));
    }

    function earlyWithdraw(
        address _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount
    ) external override onlyOwner {
        /*
        Code of curve's aave and curve's atricrypto pools are completely different.
        Curve's Aave Pool (pool type 0): in this contract, all funds "sit" in the pool's smart contract.
        Curve's Atricrypto pool (pool type 1): this contract integrates with other pools
            and funds sit in those pools. Hence, an approval transaction is required because
            it is communicating with external contracts
        */
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        if (gaugeBalance > 0) {
            if (poolType == AAVE_POOL) {
                uint256[NUM_AAVE_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0]
                amounts[uint256(uint128(inboundTokenIndex))] = _amount;
                uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

                if (gaugeBalance < poolWithdrawAmount) {
                    poolWithdrawAmount = gaugeBalance;
                }

                // passes false not to claim rewards
                gauge.withdraw(poolWithdrawAmount, false);

                pool.remove_liquidity_one_coin(
                    poolWithdrawAmount,
                    inboundTokenIndex,
                    _minAmount,
                    true // redeems underlying coin (dai, usdc, usdt), instead of aTokens
                );
            } else if (poolType == ATRI_CRYPTO_POOL) {
                uint256[NUM_ATRI_CRYPTO_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0, 0, 0]
                amounts[uint256(uint128(inboundTokenIndex))] = _amount;
                uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

                if (gaugeBalance < poolWithdrawAmount) {
                    poolWithdrawAmount = gaugeBalance;
                }

                // passes false not to claim rewards
                gauge.withdraw(poolWithdrawAmount, false);

                require(lpToken.approve(address(pool), poolWithdrawAmount), "Fail to approve allowance to pool");
                pool.remove_liquidity_one_coin(poolWithdrawAmount, uint256(uint128(inboundTokenIndex)), _minAmount);
            }
        }
        // check for impermanent loss
        if (IERC20(_inboundCurrency).balanceOf(address(this)) < _amount) {
            _amount = IERC20(_inboundCurrency).balanceOf(address(this));
        }
        // msg.sender will always be the pool contract (new owner)
        require(
            IERC20(_inboundCurrency).transfer(msg.sender, IERC20(_inboundCurrency).balanceOf(address(this))),
            "Transfer Failed"
        );
    }

    function redeem(address _inboundCurrency, uint256 _minAmount) external override onlyOwner {
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        if (gaugeBalance > 0) {
            // passes true to also claim rewards
            gauge.withdraw(gaugeBalance, true);
        }

        /*
        Code of curve's aave and curve's atricrypto pools are completely different.
        Curve's Aave Pool (pool type 0): in this contract, all funds "sit" in the pool's smart contract.
        Curve's Atricrypto pool (pool type 1): this contract integrates with other pools
            and funds sit in those pools. Hence, an approval transaction is required because
            it is communicating with external contracts
        */
        uint256 lpTokenBalance = lpToken.balanceOf(address(this));
        if (lpTokenBalance > 0) {
            if (poolType == AAVE_POOL) {
                pool.remove_liquidity_one_coin(
                    lpTokenBalance,
                    inboundTokenIndex,
                    _minAmount,
                    true // redeems underlying coin (dai, usdc, usdt), instead of aTokens
                );
            } else if (poolType == ATRI_CRYPTO_POOL) {
                require(lpToken.approve(address(pool), lpTokenBalance), "Fail to approve allowance to pool");

                pool.remove_liquidity_one_coin(lpTokenBalance, uint256(uint128(inboundTokenIndex)), _minAmount);
            }
        }
        if (address(rewardToken) != address(0)) {
            require(rewardToken.transfer(msg.sender, rewardToken.balanceOf(address(this))), "Transfer Failed");
        }
        if (address(curve) != address(0)) {
            require(curve.transfer(msg.sender, curve.balanceOf(address(this))), "Transfer Failed");
        }
        require(
            IERC20(_inboundCurrency).transfer(msg.sender, IERC20(_inboundCurrency).balanceOf(address(this))),
            "Transfer Failed"
        );
    }

    function getRewardToken() external view override returns (IERC20) {
        return rewardToken;
    }

    function getGovernanceToken() external view override returns (IERC20) {
        return curve;
    }
}
