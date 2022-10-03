// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../mobius/IMobiPool.sol";
import "../mobius/IMobiGauge.sol";
import "../mobius/IMinter.sol";
import "./IStrategy.sol";

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error CANNOT_ACCEPT_TRANSACTIONAL_TOKEN();
error INVALID_DEPOSIT_TOKEN();
error INVALID_GAUGE();
error INVALID_LP_TOKEN();
error INVALID_MINTER();
error INVALID_POOL();
error INVALID_REWARD_TOKEN();
error TOKEN_TRANSFER_FAILURE();

/**
  @notice
  Interacts with Mobius protocol (or forks) to generate interest and additional rewards for the pool.
  This contract it's responsible for deposits and withdrawals to the external pool
  as well as getting the generated rewards and sending them back to the pool.
  @author Francis Odisi & Viraz Malhotra.
*/
contract MobiusStrategy is Ownable, IStrategy {
    /// @notice gauge address
    IMobiGauge public immutable gauge;

    /// @notice gauge address
    IMinter public immutable minter;

    /// @notice pool address
    IMobiPool public immutable pool;

    /// @notice token index in the pool.
    uint8 public immutable inboundTokenIndex;

    /// @notice mobi lp token
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
        uint256 liquidityBalance;
        if (address(gauge) != address(0)) {
            liquidityBalance = gauge.balanceOf(address(this));
        } else {
            liquidityBalance = lpToken.balanceOf(address(this));
        }

        if (liquidityBalance != 0) {
            uint256 totalAccumulatedAmount = pool.calculateRemoveLiquidityOneToken(
                address(this),
                liquidityBalance,
                inboundTokenIndex
            );
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
        uint256[] memory amounts = new uint256[](2);
        amounts[inboundTokenIndex] = _amount;
        uint256 poolWithdrawAmount = pool.calculateTokenAmount(address(this), amounts, true);
        return pool.calculateRemoveLiquidityOneToken(address(this), poolWithdrawAmount, inboundTokenIndex);
    }

    /** 
    @notice
    Returns the underlying inbound (deposit) token address.
    @return Underlying token address.
    */
    // UPDATE - A4 Audit Report
    function getUnderlyingAsset() external view override returns (address) {
        return address(pool.getToken(inboundTokenIndex));
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
        uint256[] memory amounts = new uint256[](2);
        amounts[inboundTokenIndex] = _amount;
        return pool.calculateTokenAmount(address(this), amounts, true);
    }

    /** 
    @notice
    Returns the fee (for amm strategies)
    */
    function getFee() external view override returns (uint256) {
        (, , , , uint256 swapFee, , , , , ) = pool.swapStorage();
        return swapFee;
    }

    //*********************************************************************//
    // -------------------------- constructor ---------------------------- //
    //*********************************************************************//

    /** 
    @param _pool Mobius Pool Contract.
    @param _gauge Mobius Gauge Contract.
    @param _minter Mobius Minter Contract used for getting mobi rewards.
    */
    constructor(
        IMobiPool _pool,
        IMobiGauge _gauge,
        IMinter _minter,
        IERC20 _lpToken,
        uint8 _inboundTokenIndex,
        IERC20[] memory _rewardTokens
    ) {
        if (address(_pool) == address(0)) {
            revert INVALID_POOL();
        }

        if (address(_gauge) == address(0) && _rewardTokens.length > 0) {
            revert INVALID_REWARD_TOKEN();
        } else {
            uint256 numRewards = _rewardTokens.length;
            for (uint256 i = 0; i < numRewards; ) {
                if (address(_rewardTokens[i]) == address(0)) {
                    revert INVALID_REWARD_TOKEN();
                }
                unchecked {
                    ++i;
                }
            }
        }

        pool = _pool;
        gauge = _gauge;
        minter = _minter;
        rewardTokens = _rewardTokens;
        inboundTokenIndex = _inboundTokenIndex;
        if (address(_gauge) != address(0)) {
            lpToken = IERC20(_pool.getLpToken());
        } else {
            if (address(_lpToken) == address(0)) {
                revert INVALID_LP_TOKEN();
            }
            lpToken = _lpToken;
        }
    }

    /**
    @notice
    Deposits funds into mobius pool and then stake the lp tokens into curve gauge.
    @param _inboundCurrency Address of the inbound token.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario.
    */
    function invest(address _inboundCurrency, uint256 _minAmount) external payable override onlyOwner {
        // the function is only payable because the other strategies have tx token deposits and every strategy overrides the IStrategy Interface.
        if (msg.value != 0) {
            revert CANNOT_ACCEPT_TRANSACTIONAL_TOKEN();
        }
        if (address(pool.getToken(inboundTokenIndex)) != _inboundCurrency) {
            revert INVALID_DEPOSIT_TOKEN();
        }
        uint256 contractBalance = IERC20(_inboundCurrency).balanceOf(address(this));
        IERC20(_inboundCurrency).approve(address(pool), contractBalance);

        uint256[] memory amounts = new uint256[](2);
        amounts[inboundTokenIndex] = contractBalance;

        pool.addLiquidity(amounts, _minAmount, block.timestamp + 1000);

        if (address(gauge) != address(0)) {
            // avoid multiple SLOADS
            IERC20 _lpToken = lpToken;
            _lpToken.approve(address(gauge), _lpToken.balanceOf(address(this)));
            gauge.deposit(_lpToken.balanceOf(address(this)));
        }
    }

    /**
    @notice
    Unstakes and Withdraw's funds from mobius in case of an early withdrawal .
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
        uint256[] memory amounts = new uint256[](2);
        amounts[inboundTokenIndex] = _amount;

        uint256 poolWithdrawAmount = pool.calculateTokenAmount(address(this), amounts, true);
        if (address(gauge) != address(0)) {
            uint256 gaugeBalance = gauge.balanceOf(address(this));

            // safety check
            // the amm mock contracts are common for all kinds of scenariuo's and it is not possible to mock this particular scenario, this is a very rare scenario to occur in production and hasn't been observed in the fork tests.
            if (gaugeBalance < poolWithdrawAmount) {
                poolWithdrawAmount = gaugeBalance;
            }

            gauge.withdraw(poolWithdrawAmount, false);
        }
        lpToken.approve(address(pool), poolWithdrawAmount);
        pool.removeLiquidityOneToken(poolWithdrawAmount, inboundTokenIndex, _minAmount, block.timestamp + 1000);

        // check for impermanent loss (safety check)
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
    Redeems funds from mobius after unstaking when the waiting round for the good ghosting pool is over.
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
        uint256[] memory amounts = new uint256[](2);
        amounts[inboundTokenIndex] = _amount;
        uint256 poolWithdrawAmount = pool.calculateTokenAmount(address(this), amounts, true);

        if (address(gauge) != address(0)) {
            // not checking for validity of deposit token here since with pool contract as the owner of the strategy the only way to transfer pool funds is by invest method so the check there is sufficient
            bool claimRewards = true;
            if (disableRewardTokenClaim) {
                claimRewards = false;
            } else {
                if (address(minter) != address(0)) {
                    // fetch rewards
                    minter.mint(address(gauge));
                }
            }
            uint256 gaugeBalance = gauge.balanceOf(address(this));

            // safety check
            // the amm mock contracts are common for all kinds of scenariuo's and it is not possible to mock this particular scenario, this is a very rare scenario to occur in production and hasn't been observed in the fork tests.
            if (gaugeBalance < poolWithdrawAmount) {
                poolWithdrawAmount = gaugeBalance;
            }

            gauge.withdraw(poolWithdrawAmount, claimRewards);
        }

        lpToken.approve(address(pool), poolWithdrawAmount);
        pool.removeLiquidityOneToken(poolWithdrawAmount, inboundTokenIndex, _minAmount, block.timestamp + 1000);

        // avoid multiple SLOADS
        IERC20[] memory _rewardTokens = rewardTokens;
        bool success;
        uint256 numRewards = _rewardTokens.length;
        for (uint256 i = 0; i < numRewards; ) {
            // safety check since funds don't get transferred to a extrnal protocol
            if (IERC20(_rewardTokens[i]).balanceOf(address(this)) != 0) {
                success = _rewardTokens[i].transfer(msg.sender, _rewardTokens[i].balanceOf(address(this)));
                if (!success) {
                    revert TOKEN_TRANSFER_FAILURE();
                }
            }
            unchecked {
                ++i;
            }
        }

        success = IERC20(_inboundCurrency).transfer(msg.sender, IERC20(_inboundCurrency).balanceOf(address(this)));
        if (!success) {
            revert TOKEN_TRANSFER_FAILURE();
        }
    }

    /**
    @notice
    Returns total accumulated reward token amount.
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
            if (address(gauge) != address(0)) {
                // fetches claimable reward amounts
                amounts[0] = gauge.claimable_reward(address(this), address(_rewardTokens[0])); //celo
                amounts[1] = gauge.claimable_tokens(address(this)); //mobi
            }
        }
        return amounts;
    }
}
