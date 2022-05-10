pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../mobius/IMobiPool.sol";
import "../mobius/IMobiGauge.sol";
import "../mobius/IMinter.sol";
import "./IStrategy.sol";

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error INVALID_CELO_TOKEN();
error INVALID_GAUGE();
error INVALID_MINTER();
error INVALID_MOBI_TOKEN();
error INVALID_POOL();
error TOKEN_TRANSFER_FAILURE();

/**
  @notice
  Interacts with mobius protocol to generate interest & additional rewards for the goodghosting pool it is used in, so it's responsible for deposits, staking lp tokens, withdrawals and getting rewards and sending these back to the pool.
*/
contract MobiusStrategy is Ownable, ReentrancyGuard, IStrategy {
    /// @notice gauge address
    IMobiGauge public immutable gauge;

    /// @notice gauge address
    IMinter public immutable minter;

    /// @notice mobi token
    IERC20 public immutable mobi;

    /// @notice mobi token
    IERC20 public immutable celo;

    /// @notice mobi lp token
    IERC20 public lpToken;

    /// @notice pool address
    IMobiPool public pool;

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
    Returns the total accumalated amount i.e principal + interest stored in mobius, only used in case of variable deposit pools.
    @return Total accumalated amount.
    */
    function getTotalAmount() external view override returns (uint256) {
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        uint256 totalAccumalatedAmount = pool.calculateRemoveLiquidityOneToken(address(this), gaugeBalance, 0);
        return totalAccumalatedAmount;
    }

    /** 
    @notice
    Get net deposit for a deposit amount (used only for amm strategies).
    @return net amount.
    */
    function getNetDepositAmount(uint256 _amount) external view override returns (uint256) {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _amount;
        uint256 poolWithdrawAmount = pool.calculateTokenAmount(address(this), amounts, true);
        return pool.calculateRemoveLiquidityOneToken(address(this), poolWithdrawAmount, 0);
    }

    /** 
    @notice
    Returns the underlying token address.
    @return Underlying token address.
    */
    function getUnderlyingAsset() external view override returns (address) {
        return address(0);
    }

    /** 
    @notice
    Returns the instance of the reward token
    */
    function getRewardTokens() external view override returns (IERC20[] memory) {
        IERC20[] memory tokens = new IERC20[](2);
        tokens[0] = celo;
        tokens[1] = mobi;
        return tokens;
    }

    //*********************************************************************//
    // -------------------------- constructor ---------------------------- //
    //*********************************************************************//

    /** 
    @param _pool Mobius Pool Contract.
    @param _gauge Mobius Gauge Contract.
    @param _minter Mobius Minter Contract used for getting mobi rewards.
    @param _mobi Mobi Contract.
    @param _celo Celo Contract.
    */
    constructor(
        IMobiPool _pool,
        IMobiGauge _gauge,
        IMinter _minter,
        IERC20 _mobi,
        IERC20 _celo
    ) {
        if (address(_pool) == address(0)) {
            revert INVALID_POOL();
        }
        if (address(_gauge) == address(0)) {
            revert INVALID_GAUGE();
        }
        if (address(_minter) == address(0)) {
            revert INVALID_MINTER();
        }
        if (address(_mobi) == address(0)) {
            revert INVALID_MOBI_TOKEN();
        }
        if (address(_celo) == address(0)) {
            revert INVALID_CELO_TOKEN();
        }

        pool = _pool;
        gauge = _gauge;
        minter = _minter;
        mobi = _mobi;
        celo = _celo;
        lpToken = IERC20(pool.getLpToken());
    }

    /**
    @notice
    Deposits funds into mobius pool and then stake the lp tokens into curve gauge.
    @param _inboundCurrency Address of the inbound token.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario.
    */
    function invest(address _inboundCurrency, uint256 _minAmount) external payable override nonReentrant onlyOwner {
        uint256 contractBalance = IERC20(_inboundCurrency).balanceOf(address(this));
        IERC20(_inboundCurrency).approve(address(pool), contractBalance);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = contractBalance;

        pool.addLiquidity(amounts, _minAmount, block.timestamp + 1000);

        lpToken.approve(address(gauge), lpToken.balanceOf(address(this)));
        gauge.deposit(lpToken.balanceOf(address(this)));
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
    ) external override nonReentrant onlyOwner {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _amount;

        uint256 gaugeBalance = gauge.balanceOf(address(this));
        uint256 poolWithdrawAmount = pool.calculateTokenAmount(address(this), amounts, true);

        // safety check
        if (gaugeBalance < poolWithdrawAmount) {
            poolWithdrawAmount = gaugeBalance;
        }

        gauge.withdraw(poolWithdrawAmount, false);
        lpToken.approve(address(pool), poolWithdrawAmount);

        pool.removeLiquidityOneToken(poolWithdrawAmount, 0, _minAmount, block.timestamp + 1000);

        // check for impermanent loss (safety check)
        if (IERC20(_inboundCurrency).balanceOf(address(this)) < _amount) {
            _amount = IERC20(_inboundCurrency).balanceOf(address(this));
        }
        // msg.sender will always be the pool contract (new owner)
        bool success = IERC20(_inboundCurrency).transfer(msg.sender, IERC20(_inboundCurrency).balanceOf(address(this)));
        if (!success) {
            revert TOKEN_TRANSFER_FAILURE();
        }
    }

    /**
    @notice
    Redeems funds from mobius after unstaking when the waiting round for the good ghosting pool is over.
    @param _inboundCurrency Address of the inbound token.
    @param _amount Amount to withdraw.
    @param variableDeposits Bool Flag which determines whether the deposit is to be made in context of a variable deposit pool or not.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario.
    @param disableRewardTokenClaim Reward claim disable flag.
    */
    function redeem(
        address _inboundCurrency,
        uint256 _amount,
        bool variableDeposits,
        uint256 _minAmount,
        bool disableRewardTokenClaim
    ) external override nonReentrant onlyOwner {
        bool claimRewards = true;
        if (disableRewardTokenClaim) {
            claimRewards = false;
        } else {
            minter.mint(address(gauge));
        }
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        if (variableDeposits) {
            uint256[] memory amounts = new uint256[](2);
            amounts[0] = _amount;
            uint256 poolWithdrawAmount = pool.calculateTokenAmount(address(this), amounts, true);

            // safety check
            if (gaugeBalance < poolWithdrawAmount) {
                poolWithdrawAmount = gaugeBalance;
            }

            gauge.withdraw(poolWithdrawAmount, claimRewards);
            lpToken.approve(address(pool), poolWithdrawAmount);

            pool.removeLiquidityOneToken(poolWithdrawAmount, 0, _minAmount, block.timestamp + 1000);
        } else {
            gauge.withdraw(gaugeBalance, claimRewards);

            lpToken.approve(address(pool), lpToken.balanceOf(address(this)));
            pool.removeLiquidityOneToken(lpToken.balanceOf(address(this)), 0, _minAmount, block.timestamp + 1000);
        }

        bool success = mobi.transfer(msg.sender, mobi.balanceOf(address(this)));
        if (!success) {
            revert TOKEN_TRANSFER_FAILURE();
        }

        success = celo.transfer(msg.sender, celo.balanceOf(address(this)));
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
    Returns total accumalated reward token amount.
    This method is not marked as view since in the curve gauge contract "claimable_reward_write" is not marked as view and all strategies share the same strategy interface.
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
            amount = gauge.claimable_reward(address(this), address(celo));
            additionalAmount = gauge.claimable_tokens(address(this));
        }
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = amount;
        amounts[1] = additionalAmount;
        return amounts;
    }
}
