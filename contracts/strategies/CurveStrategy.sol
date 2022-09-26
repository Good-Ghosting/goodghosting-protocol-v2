// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../curve/ICurvePool.sol";
import "../curve/ICurveGauge.sol";
import "../curve/ICurveMinter.sol";
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
    /// @notice gauge address
    ICurveGauge public immutable gauge;

    /// @notice token index in the pool in int form
    int128 public immutable inboundTokenIndex;

    /// @notice flag to differentiate between aave and atricrypto pool
    uint64 public immutable poolType;

    /// @notice pool address
    ICurvePool public immutable pool;

    /// @notice gauge minter address
    ICurveMinter public immutable gaugeMinter;

    /// @notice total tokens in aave pool
    uint64 public constant NUM_AAVE_TOKENS = 3;

    /// @notice total tokens in atricrypto pool
    uint64 public constant NUM_ATRI_CRYPTO_TOKENS = 5;

    /// @notice total tokens in matic pool
    uint64 public constant NUM_MATIC_POOL_TOKENS = 2;

    /// @notice identifies the "Lending Pool" Type
    uint64 public constant LENDING_POOL = 0;

    /// @notice identifies the "Curve Deposit Zap" Type
    uint64 public constant DEPOSIT_ZAP = 1;

    /// @notice identifies the "Generic Pool" Type
    uint64 public constant GENERIC_POOL = 2;

    /// @notice curve lp token
    IERC20 public lpToken;

    /// @notice reward token address
    IERC20[] public rewardTokens;

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
    function getTotalAmount() external view virtual override returns (uint256) {
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        if (gaugeBalance != 0) {
            uint256 totalAccumulatedAmount = 0;
            if (poolType == LENDING_POOL) {
                totalAccumulatedAmount = pool.calc_withdraw_one_coin(gaugeBalance, inboundTokenIndex);
            } else {
                totalAccumulatedAmount = pool.calc_withdraw_one_coin(gaugeBalance, uint256(uint128(inboundTokenIndex)));
            }
            return totalAccumulatedAmount;
        }
        return 0;
    }

    /** 
    @notice
    Get the expected net deposit amount (amount minus slippage) for a given amount. Used only for AMM strategies.
    @return net amount.
    */
    function getNetDepositAmount(uint256 _amount) external view override returns (uint256) {
        if (poolType == LENDING_POOL) {
            uint256[NUM_AAVE_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);
            return pool.calc_withdraw_one_coin(poolWithdrawAmount, inboundTokenIndex);
        } else if (poolType == DEPOSIT_ZAP) {
            uint256[NUM_ATRI_CRYPTO_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);
            return pool.calc_withdraw_one_coin(poolWithdrawAmount, uint256(uint128(inboundTokenIndex)));
        } else {
            uint256[NUM_MATIC_POOL_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts);
            return pool.calc_withdraw_one_coin(poolWithdrawAmount, uint256(uint128(inboundTokenIndex)));
        }
    }

    /** 
    @notice
    Returns the underlying inbound (deposit) token address.
    @return Underlying token address.
    */
    // UPDATE - A4 Audit Report
    function getUnderlyingAsset() external view override returns (address) {
        if (poolType == GENERIC_POOL) {
            return pool.coins(uint256(uint128(inboundTokenIndex)));
        }
        return pool.underlying_coins(uint256(uint128(inboundTokenIndex)));
    }

    /** 
    @notice
    Returns the instances of the reward tokens
    */
    function getRewardTokens() external view override returns (IERC20[] memory) {
        return rewardTokens;
    }

    /** 
    @notice
    Returns the lp token amount received (for amm strategies)
    */
    function getLPTokenAmount(uint256 _amount) external view override returns (uint256) {
        if (poolType == LENDING_POOL) {
            uint256[NUM_AAVE_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            return pool.calc_token_amount(amounts, true);
        } else if (poolType == DEPOSIT_ZAP) {
            uint256[NUM_ATRI_CRYPTO_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            return pool.calc_token_amount(amounts, true);
        } else {
            uint256[NUM_MATIC_POOL_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            return pool.calc_token_amount(amounts);
        }
    }

    //*********************************************************************//
    // -------------------------- constructor ---------------------------- //
    //*********************************************************************//

    /** 
    @param _pool Curve Pool Contract.
    @param _inboundTokenIndex Deposit token index in the pool.
    @param _poolType Pool type to diffrentiate b/w the pools.
    @param _gauge Curve Gauge Contract used to stake lp tokens.
  */
    constructor(
        ICurvePool _pool,
        int128 _inboundTokenIndex,
        uint64 _poolType,
        ICurveGauge _gauge,
        ICurveMinter _gaugeMinter,
        IERC20[] memory _rewardTokens
    ) {
        if (address(_pool) == address(0)) {
            revert INVALID_POOL();
        }
        if (address(_gauge) == address(0)) {
            revert INVALID_GAUGE();
        }

        if (_poolType > GENERIC_POOL) {
            revert INVALID_POOL();
        }

        if (
            (_inboundTokenIndex < 0)
            || (_poolType == LENDING_POOL && uint128(_inboundTokenIndex) >= NUM_AAVE_TOKENS)
            || (_poolType == DEPOSIT_ZAP && uint128(_inboundTokenIndex) >= NUM_ATRI_CRYPTO_TOKENS)
            || (_poolType == GENERIC_POOL && uint128(_inboundTokenIndex) >= NUM_MATIC_POOL_TOKENS)
        ) {
            revert INVALID_INBOUND_TOKEN_INDEX();
        }

        pool = _pool;
        gauge = _gauge;
        gaugeMinter = _gaugeMinter;
        poolType = _poolType;
        inboundTokenIndex = _inboundTokenIndex;
        // wmatic in case of polygon and address(0) for non-polygon deployment
        rewardTokens = _rewardTokens;
        if (_poolType == LENDING_POOL) {
            lpToken = IERC20(_pool.lp_token());
        } else {
            lpToken = IERC20(_pool.token());
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
        if (poolType == GENERIC_POOL && pool.coins(uint256(uint128(inboundTokenIndex))) != _inboundCurrency) {
            revert INVALID_DEPOSIT_TOKEN();
        } else if ((poolType == DEPOSIT_ZAP || poolType == LENDING_POOL) && pool.underlying_coins(uint256(uint128(inboundTokenIndex))) != _inboundCurrency) {
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
        if (poolType == LENDING_POOL) {
            uint256[NUM_AAVE_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = contractBalance;
            pool.add_liquidity(amounts, _minAmount, true);
        } else if (poolType == DEPOSIT_ZAP) {
            uint256[NUM_ATRI_CRYPTO_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = contractBalance;
            pool.add_liquidity(amounts, _minAmount);
        } else {
            uint256[NUM_MATIC_POOL_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = contractBalance;
            pool.add_liquidity(amounts, _minAmount);
        }
        
        // avoid multiple SLOADS
        IERC20 _lpToken = lpToken;
        _lpToken.approve(address(gauge), _lpToken.balanceOf(address(this)));
        gauge.deposit(_lpToken.balanceOf(address(this)));
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
        if (poolType == LENDING_POOL) {
            uint256[NUM_AAVE_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

            // safety check
            // the amm mock contracts are common for all kinds of scenariuo's and it is not possible to mock this particular scenario, this is a very rare scenario to occur in production and hasn't been observed in the fork tests.
            if (gaugeBalance < poolWithdrawAmount) {
                poolWithdrawAmount = gaugeBalance;
            }

            gauge.withdraw(poolWithdrawAmount);

            pool.remove_liquidity_one_coin(
                poolWithdrawAmount,
                inboundTokenIndex,
                _minAmount,
                true // redeems underlying coin (dai, usdc, usdt), instead of aTokens
            );
        } else if (poolType == DEPOSIT_ZAP) {
            uint256[NUM_ATRI_CRYPTO_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

            // safety check
            // the amm mock contracts are common for all kinds of scenariuo's and it is not possible to mock this particular scenario, this is a very rare scenario to occur in production and hasn't been observed in the fork tests.
            if (gaugeBalance < poolWithdrawAmount) {
                poolWithdrawAmount = gaugeBalance;
            }

            gauge.withdraw(poolWithdrawAmount);
            /*
                Code of curve's aave and curve's atricrypto pools are completely different.
                Curve's Aave Pool (pool type 0): in this contract, all funds "sit" in the pool's smart contract.
                Curve's Atricrypto pool (pool type 1): this contract integrates with other pools
                and funds sit in those pools. Hence, an approval transaction is required because
                it is communicating with external contracts
            */
            lpToken.approve(address(pool), poolWithdrawAmount);
            pool.remove_liquidity_one_coin(poolWithdrawAmount, uint256(uint128(inboundTokenIndex)), _minAmount);
        } else {
            uint256[NUM_MATIC_POOL_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts);

            // safety check
            // the amm mock contracts are common for all kinds of scenariuo's and it is not possible to mock this particular scenario, this is a very rare scenario to occur in production and hasn't been observed in the fork tests.
            if (gaugeBalance < poolWithdrawAmount) {
                poolWithdrawAmount = gaugeBalance;
            }

            gauge.withdraw(poolWithdrawAmount);
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
        if (!disableRewardTokenClaim) {
            // claim rewards
            gauge.claim_rewards();
            if (address(gaugeMinter) != address(0)) {
                // gauge minter for getting rewards
                gaugeMinter.mint(address(gauge));
            }
        }
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        if (poolType == LENDING_POOL) {
            uint256[NUM_AAVE_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

            // safety check
            // the amm mock contracts are common for all kinds of scenariuo's and it is not possible to mock this particular scenario, this is a very rare scenario to occur in production and hasn't been observed in the fork tests.
            if (gaugeBalance < poolWithdrawAmount) {
                poolWithdrawAmount = gaugeBalance;
            }

            gauge.withdraw(poolWithdrawAmount);

            pool.remove_liquidity_one_coin(
                poolWithdrawAmount,
                inboundTokenIndex,
                _minAmount,
                true // redeems underlying coin (dai, usdc, usdt), instead of aTokens
            );
        } else if (poolType == DEPOSIT_ZAP) {
            uint256[NUM_ATRI_CRYPTO_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0, 0, 0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

            // safety check
            // the amm mock contracts are common for all kinds of scenariuo's and it is not possible to mock this particular scenario, this is a very rare scenario to occur in production and hasn't been observed in the fork tests.
            if (gaugeBalance < poolWithdrawAmount) {
                poolWithdrawAmount = gaugeBalance;
            }

            gauge.withdraw(poolWithdrawAmount);
            /*
                    Code of curve's aave and curve's atricrypto pools are completely different.
                    Curve's Aave Pool (pool type 0): in this contract, all funds "sit" in the pool's smart contract.
                    Curve's Atricrypto pool (pool type 1): this contract integrates with other pools
                    and funds sit in those pools. Hence, an approval transaction is required because
                    it is communicating with external contracts
            */
            lpToken.approve(address(pool), poolWithdrawAmount);
            pool.remove_liquidity_one_coin(poolWithdrawAmount, uint256(uint128(inboundTokenIndex)), _minAmount);
        } else {
            uint256[NUM_MATIC_POOL_TOKENS] memory amounts; // fixed-sized array is initialized w/ [0, 0]
            amounts[uint256(uint128(inboundTokenIndex))] = _amount;
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts);

            // safety check
            // the amm mock contracts are common for all kinds of scenariuo's and it is not possible to mock this particular scenario, this is a very rare scenario to occur in production and hasn't been observed in the fork tests.
            if (gaugeBalance < poolWithdrawAmount) {
                poolWithdrawAmount = gaugeBalance;
            }

            gauge.withdraw(poolWithdrawAmount);
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

        // avoid multiple SLOADS
        IERC20[] memory _rewardTokens = rewardTokens;
        for (uint256 i = 0; i < _rewardTokens.length; ) {
            // safety check since funds don't get transferred to a extrnal protocol
            if (IERC20(_rewardTokens[i]).balanceOf(address(this)) != 0) {
                bool success = IERC20(_rewardTokens[i]).transfer(
                    msg.sender,
                    IERC20(_rewardTokens[i]).balanceOf(address(this))
                );
                if (!success) {
                    revert TOKEN_TRANSFER_FAILURE();
                }
            }
            unchecked {
                ++i;
            }
        }
        bool success = IERC20(_inboundCurrency).transfer(msg.sender, IERC20(_inboundCurrency).balanceOf(address(this)));
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
        // avoid multiple SLOADS
        IERC20[] memory _rewardTokens = rewardTokens;
        uint256[] memory amounts = new uint256[](_rewardTokens.length);
        if (!disableRewardTokenClaim) {
            if (poolType == DEPOSIT_ZAP || poolType == LENDING_POOL) {
                for (uint256 i = 0; i < _rewardTokens.length; ) {
                    amounts[i] = gauge.claimable_reward_write(address(this), address(_rewardTokens[i]));
                    unchecked {
                        ++i;
                    }
                }
            } else {
                for (uint256 i = 0; i < _rewardTokens.length; ) {
                    amounts[i] = gauge.claimable_reward(address(this), address(_rewardTokens[i]));
                    unchecked {
                        ++i;
                    }
                }
            }
        }
        return amounts;
    }
}
