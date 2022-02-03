pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../mobius/IMobiPool.sol";
import "../mobius/IMobiGauge.sol";
import "../mobius/IMinter.sol";
import "./IStrategy.sol";

/**
  @notice
  Interacts with mobius protocol to generate interest & additional rewards for the goodghosting pool it is used in, so it's responsible for deposits, staking lp tokens, withdrawals and getting rewards and sending these back to the pool.
*/
contract MobiusStrategy is Ownable, IStrategy {
    /// @notice pool address
    IMobiPool public pool;

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

    //*********************************************************************//
    // ------------------------- external views -------------------------- //
    //*********************************************************************//

    /** 
    @notice
    Returns the total accumalated amount i.e principal + interest stored in aave, only used in case of variable deposit pools.
    @param _inboundCurrency Address of the inbound token.
    @return Total accumalated amount.
    */
    function getTotalAmount(address _inboundCurrency) external view override returns (uint256) {
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        uint256 totalAccumalatedAmount = pool.calculateRemoveLiquidityOneToken(address(this), gaugeBalance, 0);
        return totalAccumalatedAmount;
    }

    /** 
    @notice
    Returns the instance of the reward token
    */
    function getRewardToken() external view override returns (IERC20) {
        return celo;
    }

    /** 
    @notice
    Returns the instance of the governance token
    */
    function getGovernanceToken() external view override returns (IERC20) {
        return mobi;
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
        require(address(_pool) != address(0), "invalid _pool address");
        require(address(_gauge) != address(0), "invalid _gauge address");
        require(address(_minter) != address(0), "invalid _minter address");
        require(address(_mobi) != address(0), "invalid _mobi address");
        require(address(_celo) != address(0), "invalid _celo address");
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
    @param _minAmount Slippage based amount to cover for impermanent loss scenario .
    */
    function invest(address _inboundCurrency, uint256 _minAmount) external payable override onlyOwner {
        uint256 contractBalance = IERC20(_inboundCurrency).balanceOf(address(this));
        require(IERC20(_inboundCurrency).approve(address(pool), contractBalance), "Fail to approve allowance to pool");

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = contractBalance;

        pool.addLiquidity(amounts, _minAmount, block.timestamp + 1000);

        require(
            lpToken.approve(address(gauge), lpToken.balanceOf(address(this))),
            "Fail to approve allowance to gauge"
        );
        gauge.deposit(lpToken.balanceOf(address(this)));
    }

    /**
    @notice
    Unstakes and Withdraw's funds from mobius in case of an early withdrawal .
    @param _inboundCurrency Address of the inbound token.
    @param _amount Amount to withdraw.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario .
    */
    function earlyWithdraw(
        address _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount
    ) external override onlyOwner {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _amount;

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

    /**
    @notice
    Redeems funds from mobius after unstaking when the waiting round for the good ghosting pool is over.
    @param _inboundCurrency Address of the inbound token.
    @param _amount Amount to withdraw.
    @param variableDeposits Bool Flag which determines whether the deposit is to be made in context of a variable deposit pool or not.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario .
    */
    function redeem(
        address _inboundCurrency,
        uint256 _amount,
        bool variableDeposits,
        uint256 _minAmount
    ) external override onlyOwner {
        uint256 gaugeBalance = gauge.balanceOf(address(this));
        if (gaugeBalance > 0) {
            minter.mint(address(gauge));
            if (variableDeposits) {
                uint256[] memory amounts = new uint256[](2);
                amounts[0] = _amount;
                uint256 poolWithdrawAmount = pool.calculateTokenAmount(address(this), amounts, true);

                if (gaugeBalance < poolWithdrawAmount) {
                    poolWithdrawAmount = gaugeBalance;
                }

                gauge.withdraw(poolWithdrawAmount, true);
                require(lpToken.approve(address(pool), poolWithdrawAmount), "Fail to approve allowance to pool");

                pool.removeLiquidityOneToken(poolWithdrawAmount, 0, _minAmount, block.timestamp + 1000);
            } else {
                gauge.withdraw(gaugeBalance, true);
                require(
                    lpToken.approve(address(pool), lpToken.balanceOf(address(this))),
                    "Fail to approve allowance to pool"
                );
                pool.removeLiquidityOneToken(lpToken.balanceOf(address(this)), 0, _minAmount, block.timestamp + 1000);
            }
        }

        if (address(mobi) != address(0)) {
            require(mobi.transfer(msg.sender, mobi.balanceOf(address(this))), "Transfer Failed");
        }
        if (address(celo) != address(0)) {
            require(celo.transfer(msg.sender, celo.balanceOf(address(this))), "Transfer Failed");
        }
        require(
            IERC20(_inboundCurrency).transfer(msg.sender, IERC20(_inboundCurrency).balanceOf(address(this))),
            "Transfer Failed"
        );
    }

    /**
    @notice
    Returns total accumalated reward token amount.
    @param _inboundCurrency Address of the inbound token.
    */
    function getAccumalatedRewardTokenAmount(address _inboundCurrency) external override returns (uint256) {
        return gauge.claimable_reward(address(this), address(celo));
    }

    /**
    @notice
    Returns total accumalated governance token amount.
    @param _inboundCurrency Address of the inbound token.
    */
    function getAccumalatedGovernanceTokenAmount(address _inboundCurrency) external override returns (uint256) {
        return gauge.claimable_tokens(address(this));
    }
}
