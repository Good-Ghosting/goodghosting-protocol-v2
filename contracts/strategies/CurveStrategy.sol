// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../curve/ICurvePool.sol";
import "../curve/ICurveGauge.sol";
import "./IStrategy.sol";

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error CANNOT_ACCEPT_TRANSACTIONAL_TOKEN();
error INVALID_CURVE_TOKEN();
error INVALID_DEPOSIT_TOKEN();
error INVALID_GAUGE();
error INVALID_INBOUND_TOKEN_INDEX();
error INVALID_POOL();
error INVALID_REWARD_TOKEN();
error TOKEN_TRANSFER_FAILURE();

/**
  @notice
  Interacts with Aave V2 protocol (or forks) to generate interest and additional rewards for the pool.
  This contract it's responsible for deposits and withdrawals to the external pool
  as well as getting the generated rewards and sending them back to the pool.
  Supports Curve's Aave Pool and AtriCrypto pools (v3).
  @author Francis Odisi & Viraz Malhotra.
*/
contract CurveStrategy is Ownable, IStrategy {
    /// @notice reward token address - i.e. wmatic in case of polygon deployment
    IERC20 public immutable rewardToken;

    /// @notice curve token
    IERC20 public immutable curve;

    /// @notice gauge address
    ICurveGauge public immutable gauge;

    /// @notice token index in the pool in int form
    int128 public immutable inboundTokenIndex;

    /// @notice flag to differentiate between aave and atricrypto pool
    uint64 public immutable poolType;

    /// @notice total tokens in aave pool
    uint64 public constant NUM_AAVE_TOKENS = 3;

    /// @notice total tokens in atricrypto pool
    uint64 public constant NUM_ATRI_CRYPTO_TOKENS = 5;

    /// @notice identifies the "Aave Pool" Type
    uint64 public constant AAVE_POOL = 0;

    /// @notice identifies the "Atri Crypto Pool" Type
    uint64 public constant ATRI_CRYPTO_POOL = 1;

    /// @notice pool address
    ICurvePool public pool;

    /// @notice curve lp token
    IERC20 public lpToken;

    //*********************************************************************//
    // ------------------------- external views -------------------------- //
    //*********************************************************************//
    /** 
    @notice
    Get strategy owner address.
    @return Strategy owner.
    */
    function strategyOwner() external view override returns (address) {
        return super.owner();
    }

    /** 
    @notice
    Returns the total accumulated amount (i.e., principal + interest) stored in curve.
    Intended for usage by external clients and in case of variable deposit pools.
    @return Total accumulated amount.
    */
    function getTotalAmount() external view override returns (uint256) {
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        uint256 totalAccumulatedAmount = 0;
        if (poolType == AAVE_POOL) {
            totalAccumulatedAmount = pool.calc_withdraw_one_coin(gaugeBalance, inboundTokenIndex);
        } else {
            totalAccumulatedAmount = pool.calc_withdraw_one_coin(gaugeBalance, uint256(uint128(inboundTokenIndex)));
        }
        return totalAccumulatedAmount;
    }

    /** 
    @notice
    Get the expected net deposit amount (amount minus slippage) for a given amount. Used only for AMM strategies.
    @return net amount.
    */
    function getNetDepositAmount(uint256 _amount) external view override returns (uint256) {
        if (poolType == AAVE_POOL) {
            uint256[NUM_AAVE_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);
            return pool.calc_withdraw_one_coin(poolWithdrawAmount, inboundTokenIndex);
        } else {
            uint256[NUM_ATRI_CRYPTO_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);
            return pool.calc_withdraw_one_coin(poolWithdrawAmount, uint256(uint128(inboundTokenIndex)));
        }
    }

    /** 
    @notice
    Returns the underlying inbound (deposit) token address.
    @return Underlying token address.
    */
    function getUnderlyingAsset() external view override returns (address) {
        return pool.underlying_coins(uint256(uint128(inboundTokenIndex)));
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

        if (_inboundTokenIndex < 0) {
            revert INVALID_INBOUND_TOKEN_INDEX();
        }

        pool = _pool;
        gauge = _gauge;
        curve = _curve;
        poolType = _poolType;
        inboundTokenIndex = _inboundTokenIndex;
        // wmatic in case of polygon and address(0) for non-polygon deployment
        rewardToken = _rewardToken;
        if (_poolType == AAVE_POOL) {
            if (uint128(_inboundTokenIndex) >= NUM_AAVE_TOKENS) {
                revert INVALID_INBOUND_TOKEN_INDEX();
            }
            lpToken = IERC20(pool.lp_token());
        } else {
            if (uint128(_inboundTokenIndex) >= NUM_ATRI_CRYPTO_TOKENS) {
                revert INVALID_INBOUND_TOKEN_INDEX();
            }
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
        // the function is only payable because the other strategies have tx token deposits and every strategy overrides the IStrategy Interface.
        if (msg.value != 0) {
            revert CANNOT_ACCEPT_TRANSACTIONAL_TOKEN();
        }
        if (pool.underlying_coins(uint256(uint128(inboundTokenIndex))) != _inboundCurrency) {
            revert INVALID_DEPOSIT_TOKEN();
        }
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
        } else {
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
        // not checking for validity of deposit token here since with pool contract as the owner of the strategy the only way to transfer pool funds is by invest method so the check there is sufficient
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        if (poolType == AAVE_POOL) {
            uint256[NUM_AAVE_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

            // safety check
            // the amm mock contracts are common for all kinds of scenariuo's and it is not possible to mock this particular scenario, this is a very rare scenario to occur in production and hasn't been observed in the fork tests.
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
        } else {
            uint256[NUM_ATRI_CRYPTO_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

            // safety check
            // the amm mock contracts are common for all kinds of scenariuo's and it is not possible to mock this particular scenario, this is a very rare scenario to occur in production and hasn't been observed in the fork tests.
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
        // check for impermanent loss
        if (IERC20(_inboundCurrency).balanceOf(address(this)) < _amount) {
            _amount = IERC20(_inboundCurrency).balanceOf(address(this));
        }
        // msg.sender will always be the pool contract (new owner)
        bool success = IERC20(_inboundCurrency).transfer(msg.sender, _amount);
        if (!success) {
            revert TOKEN_TRANSFER_FAILURE();
        }
    }

    /**
    @notice
    Redeems funds from curve after unstaking when the waiting round for the good ghosting pool is over.
    @param _inboundCurrency Address of the inbound token.
    @param _amount Amount to withdraw.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario.
    @param disableRewardTokenClaim Reward claim disable flag.
    */
    function redeem(
        address _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount,
        bool disableRewardTokenClaim
    ) external override onlyOwner {
        // not checking for validity of deposit token here since with pool contract as the owner of the strategy the only way to transfer pool funds is by invest method so the check there is sufficient
        bool claimRewards = true;
        if (disableRewardTokenClaim) {
            claimRewards = false;
        }
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        //if (variableDeposits) {
        if (poolType == AAVE_POOL) {
            uint256[NUM_AAVE_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

            // safety check
            // the amm mock contracts are common for all kinds of scenariuo's and it is not possible to mock this particular scenario, this is a very rare scenario to occur in production and hasn't been observed in the fork tests.
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
        } else {
            uint256[NUM_ATRI_CRYPTO_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

            // safety check
            // the amm mock contracts are common for all kinds of scenariuo's and it is not possible to mock this particular scenario, this is a very rare scenario to occur in production and hasn't been observed in the fork tests.
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

        bool success = rewardToken.transfer(msg.sender, rewardToken.balanceOf(address(this)));
        if (!success) {
            revert TOKEN_TRANSFER_FAILURE();
        }

        success = curve.transfer(msg.sender, curve.balanceOf(address(this)));
        if (!success) {
            revert TOKEN_TRANSFER_FAILURE();
        }

        success = IERC20(_inboundCurrency).transfer(msg.sender, IERC20(_inboundCurrency).balanceOf(address(this)));
        if (!success) {
            revert TOKEN_TRANSFER_FAILURE();
        }
    }

    /**
    @notice
    Returns total accumulated reward token amount.
    This method is not marked as view since in the curve gauge contract "claimable_reward_write" is not marked as view.
    @param disableRewardTokenClaim Reward claim disable flag.
    */
    function getAccumulatedRewardTokenAmounts(bool disableRewardTokenClaim)
        external
        override
        returns (uint256[] memory)
    {
        uint256 amount = 0;
        uint256 additionalAmount = 0;
        if (!disableRewardTokenClaim) {
            amount = gauge.claimable_reward_write(address(this), address(rewardToken));
            additionalAmount = gauge.claimable_reward_write(address(this), address(curve));
        }
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = amount;
        amounts[1] = additionalAmount;
        return amounts;
    }
}
