pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../curve/ICurvePool.sol";
import "../curve/ICurveGauge.sol";
import "./IStrategy.sol";

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error INVALID_AMOUNT();
error INVALID_CURVE_TOKEN();
error INVALID_GAUGE();
error INVALID_POOL();
error INVALID_REWARD_TOKEN();

/**
  @notice
  Interacts with curve protocol to generate interest & additional rewards for the goodghosting pool it is used in, so it's responsible for deposits, staking lp tokens, withdrawals and getting rewards and sending these back to the pool.
*/
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

    //*********************************************************************//
    // ------------------------- external views -------------------------- //
    //*********************************************************************//

    /** 
    @notice
    Returns the total accumalated amount i.e principal + interest stored in aave, only used in case of variable deposit pools.
    @return Total accumalated amount.
    */
    function getTotalAmount() external view override returns (uint256) {
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        uint256 totalAccumalatedAmount = 0;
        if (poolType == AAVE_POOL) {
            totalAccumalatedAmount = pool.calc_withdraw_one_coin(gaugeBalance, inboundTokenIndex);
        } else {
            totalAccumalatedAmount = pool.calc_withdraw_one_coin(gaugeBalance, uint256(uint128(inboundTokenIndex)));
        }
        return totalAccumalatedAmount;
    }

    /** 
    @notice
    Returns the instance of the reward tokens
    */
    function getRewardTokens() external view override returns (IERC20[] memory) {
        IERC20[] memory tokens = new IERC20[](2);
        tokens[0] = rewardToken;
        tokens[1] = curve;
        return tokens;
    }

    //*********************************************************************//
    // -------------------------- constructor ---------------------------- //
    //*********************************************************************//

    /** 
    @param _pool Curve Pool Contract.
    @param _inboundTokenIndex Deposit token index in the pool.
    @param _poolType Pool type to diffrentiate b/w the pools.
    @param _gauge Curve Gauge Contract used to stake lp tokens.
    @param _rewardToken A contract which acts as the reward token for this strategy.
    @param _curve Curve Contract.
  */
    constructor(
        ICurvePool _pool,
        int128 _inboundTokenIndex,
        uint64 _poolType,
        ICurveGauge _gauge,
        IERC20 _rewardToken,
        IERC20 _curve
    ) {
        if (address(_pool) == address(0)) {
            revert INVALID_POOL();
        }
        if (address(_gauge) == address(0)) {
            revert INVALID_GAUGE();
        }
        if (address(_curve) == address(0)) {
            revert INVALID_CURVE_TOKEN();
        }
        if (address(_rewardToken) == address(0)) {
            revert INVALID_REWARD_TOKEN();
        }

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

    /**
    @notice
    Deposits funds into curve pool and then stake the lp tokens into curve gauge.
    @param _inboundCurrency Address of the inbound token.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario.
    */
    function invest(address _inboundCurrency, uint256 _minAmount) external payable override onlyOwner {
        uint256 contractBalance = IERC20(_inboundCurrency).balanceOf(address(this));
        IERC20(_inboundCurrency).approve(address(pool), contractBalance);
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

        
        lpToken.approve(address(gauge), lpToken.balanceOf(address(this)));
        gauge.deposit(lpToken.balanceOf(address(this)));
    }

    /**
    @notice
    Unstakes and Withdraw's funds from curve in case of an early withdrawal .
    @param _inboundCurrency Address of the inbound token.
    @param _amount Amount to withdraw.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario.
    */
    function earlyWithdraw(
        address _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount
    ) external override onlyOwner {
        if (_amount == 0) {
           revert INVALID_AMOUNT();
        }
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        if (gaugeBalance > 0) {
            if (poolType == AAVE_POOL) {
                uint256[NUM_AAVE_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0]
                amounts[uint256(uint128(inboundTokenIndex))] = _amount;
                uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

                // safety check
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

                // safety check
                if (gaugeBalance < poolWithdrawAmount) {
                    poolWithdrawAmount = gaugeBalance;
                }

                // passes false not to claim rewards
                gauge.withdraw(poolWithdrawAmount, false);
                /*
                Code of curve's aave and curve's atricrypto pools are completely different.
                Curve's Aave Pool (pool type 0): in this contract, all funds "sit" in the pool's smart contract.
                Curve's Atricrypto pool (pool type 1): this contract integrates with other pools
                and funds sit in those pools. Hence, an approval transaction is required because
                it is communicating with external contracts
                */
                lpToken.approve(address(pool), poolWithdrawAmount);
                pool.remove_liquidity_one_coin(poolWithdrawAmount, uint256(uint128(inboundTokenIndex)), _minAmount);
            }
        }
        // check for impermanent loss
        if (IERC20(_inboundCurrency).balanceOf(address(this)) < _amount) {
            _amount = IERC20(_inboundCurrency).balanceOf(address(this));
        }
        // msg.sender will always be the pool contract (new owner)
        IERC20(_inboundCurrency).transfer(msg.sender, IERC20(_inboundCurrency).balanceOf(address(this)));
    }

    /**
    @notice
    Redeems funds from curve after unstaking when the waiting round for the good ghosting pool is over.
    @param _inboundCurrency Address of the inbound token.
    @param _amount Amount to withdraw.
    @param variableDeposits Bool Flag which determines whether the deposit is to be made in context of a variable deposit pool or not.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario.
    */
    function redeem(
        address _inboundCurrency,
        uint256 _amount,
        bool variableDeposits,
        uint256 _minAmount,
        bool disableRewardTokenClaim
    ) external override onlyOwner {
        bool claimRewards = true;
        if (disableRewardTokenClaim) {
            claimRewards = false;
        }
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        if (gaugeBalance > 0) {
            if (variableDeposits) {
                if (poolType == AAVE_POOL) {
                    uint256[NUM_AAVE_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0]
                    amounts[uint256(uint128(inboundTokenIndex))] = _amount;
                    uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

                    // safety check
                    if (gaugeBalance < poolWithdrawAmount) {
                        poolWithdrawAmount = gaugeBalance;
                    }

                    // passes false not to claim rewards
                    gauge.withdraw(poolWithdrawAmount, claimRewards);

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

                    // safety check
                    if (gaugeBalance < poolWithdrawAmount) {
                        poolWithdrawAmount = gaugeBalance;
                    }

                    // passes false not to claim rewards
                    gauge.withdraw(poolWithdrawAmount, claimRewards);
                    /*
                    Code of curve's aave and curve's atricrypto pools are completely different.
                    Curve's Aave Pool (pool type 0): in this contract, all funds "sit" in the pool's smart contract.
                    Curve's Atricrypto pool (pool type 1): this contract integrates with other pools
                    and funds sit in those pools. Hence, an approval transaction is required because
                    it is communicating with external contracts
                    */
                    lpToken.approve(address(pool), poolWithdrawAmount);
                    pool.remove_liquidity_one_coin(poolWithdrawAmount, uint256(uint128(inboundTokenIndex)), _minAmount);
                }
            } else {
                // passes true to also claim rewards
                gauge.withdraw(gaugeBalance, claimRewards);

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
                        /*
                        Code of curve's aave and curve's atricrypto pools are completely different.
                        Curve's Aave Pool (pool type 0): in this contract, all funds "sit" in the pool's smart contract.
                        Curve's Atricrypto pool (pool type 1): this contract integrates with other pools
                        and funds sit in those pools. Hence, an approval transaction is required because
                        it is communicating with external contracts
                         */
                        lpToken.approve(address(pool), lpTokenBalance);
                        pool.remove_liquidity_one_coin(lpTokenBalance, uint256(uint128(inboundTokenIndex)), _minAmount);
                    }
                }
            }
        }

        if (address(rewardToken) != address(0)) {
           rewardToken.transfer(msg.sender, rewardToken.balanceOf(address(this)));
        }
        if (address(curve) != address(0)) {
           curve.transfer(msg.sender, curve.balanceOf(address(this)));
        }
           IERC20(_inboundCurrency).transfer(msg.sender, IERC20(_inboundCurrency).balanceOf(address(this)));
    }

    /**
    @notice
    Returns total accumalated reward token amount.
    @param disableRewardTokenClaim Reward claim flag.
    */
    function getAccumalatedRewardTokenAmounts(bool disableRewardTokenClaim) external override returns (uint256[] memory) {
        uint amount = 0;
        uint additionalAmount = 0;
        if (!disableRewardTokenClaim) {
        amount = gauge.claimable_reward_write(address(this), address(rewardToken));
        additionalAmount = gauge.claimable_reward_write(address(this), address(curve));
        }
        uint[] memory amounts = new uint[](2);
        amounts[0] = amount;
        amounts[1] = additionalAmount;
        return amounts;
    }
}
