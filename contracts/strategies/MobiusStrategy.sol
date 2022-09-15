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
error INVALID_CELO_TOKEN();
error INVALID_DEPOSIT_TOKEN();
error INVALID_GAUGE();
error INVALID_MINTER();
error INVALID_MOBI_TOKEN();
error INVALID_POOL();
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

    /// @notice mobi token
    IERC20 public immutable mobi;

    /// @notice celo token
    IERC20 public immutable celo;

    /// @notice pool address
    IMobiPool public immutable pool;

    /// @notice token index in the pool.
    uint256 public immutable inboundTokenIndex;

    /// @notice mobi lp token
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
    function getTotalAmount() external view virtual override returns (uint256) {
        uint256 liquidityBalance;
        if (address(gauge) != address(0)) {
            liquidityBalance = gauge.balanceOf(address(this));
            if (liquidityBalance != 0) {
                uint256 totalAccumulatedAmount = pool.calculateRemoveLiquidityOneToken(
                    address(this),
                    liquidityBalance,
                    uint8(inboundTokenIndex)
                );
                return totalAccumulatedAmount;
            } else {
                return 0;
            }
        } else {
            liquidityBalance = lpToken.balanceOf(address(this));
            if (liquidityBalance != 0) {
                uint256 totalAccumulatedAmount = pool.calculateRemoveLiquidityOneToken(
                    address(this),
                    liquidityBalance,
                    uint8(inboundTokenIndex)
                );
                return totalAccumulatedAmount;
            }
        }
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
        return pool.calculateRemoveLiquidityOneToken(address(this), poolWithdrawAmount, uint8(inboundTokenIndex));
    }

    /** 
    @notice
    Returns the underlying inbound (deposit) token address.
    @return Underlying token address.
    */
    // UPDATE - A4 Audit Report
    function getUnderlyingAsset() external view override returns (address) {
        return address(pool.getToken(uint8(inboundTokenIndex)));
    }

    /** 
    @notice
    Returns the instance of the reward token
    */
    function getRewardTokens() external view override returns (IERC20[] memory) {
        if (address(gauge) != address(0)) {
            IERC20[] memory tokens = new IERC20[](2);
            tokens[0] = celo;
            tokens[1] = mobi;
            return tokens;
        } else {
            IERC20[] memory tokens = new IERC20[](1);
            tokens[0] = IERC20(address(0));
        }
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
        IERC20 _celo,
        IERC20 _lpToken,
        uint256 _inboundTokenIndex
    ) {
        if (address(_pool) == address(0)) {
            revert INVALID_POOL();
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
        inboundTokenIndex = _inboundTokenIndex;
        if (address(_gauge) != address(0)) {
            lpToken = IERC20(_pool.getLpToken());
        } else {
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
        if (address(pool.getToken(uint8(inboundTokenIndex))) != _inboundCurrency) {
            revert INVALID_DEPOSIT_TOKEN();
        }
        uint256 contractBalance = IERC20(_inboundCurrency).balanceOf(address(this));
        IERC20(_inboundCurrency).approve(address(pool), contractBalance);
        
        uint256[] memory amounts = new uint256[](2);
        amounts[inboundTokenIndex] = contractBalance;

        pool.addLiquidity(amounts, _minAmount, block.timestamp + 1000);

        if (address(gauge) != address(0)) {
            lpToken.approve(address(gauge), lpToken.balanceOf(address(this)));
            gauge.deposit(lpToken.balanceOf(address(this)));
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
        pool.removeLiquidityOneToken(poolWithdrawAmount, uint8(inboundTokenIndex), _minAmount, block.timestamp + 1000);

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
                minter.mint(address(gauge));
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
        pool.removeLiquidityOneToken(poolWithdrawAmount, uint8(inboundTokenIndex), _minAmount, block.timestamp + 1000);

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
    Returns total accumulated reward token amount.
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
            if (address(gauge) != address(0)) {
                amount = gauge.claimable_reward(address(this), address(celo));
                additionalAmount = gauge.claimable_tokens(address(this));
            }
        }
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = amount;
        amounts[1] = additionalAmount;
        return amounts;
    }
}