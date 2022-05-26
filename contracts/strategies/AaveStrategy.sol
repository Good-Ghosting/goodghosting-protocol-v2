pragma solidity ^0.8.7;

import "./IStrategy.sol";
import "../aave/ILendingPoolAddressesProvider.sol";
import "../aave/ILendingPool.sol";
import "../aave/AToken.sol";
import "../aave/IWETHGateway.sol";
import "../aave/IncentiveController.sol";
import "../polygon/WMatic.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error INVALID_DATA_PROVIDER();
error INVALID_LENDING_POOL_ADDRESS_PROVIDER();
error TOKEN_TRANSFER_FAILURE();
error TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();

/**
  @notice
  Interacts with aave v2 & moola protocol to generate interest for the goodghosting pool it is used in, so it's responsible for deposits, withdrawals and getting rewards and sending these back to the pool.
*/
contract AaveStrategy is Ownable, ReentrancyGuard, IStrategy {
    /// @notice Address of the Aave V2 incentive controller contract
    IncentiveController public immutable incentiveController;

    /// @notice Address of the Aave V2 weth gateway contract
    IWETHGateway public immutable wethGateway;

    /// @notice Which Aave instance we use to swap Inbound Token to interest bearing aDAI
    ILendingPoolAddressesProvider public immutable lendingPoolAddressProvider;

    /// @notice Lending pool address
    ILendingPool public immutable lendingPool;

    /// @notice Atoken address
    AToken public immutable adaiToken;

    /// @notice AaveProtocolDataProvider address
    AaveProtocolDataProvider public dataProvider;

    /// @notice reward token address for eg wmatic in case of polygon deployment
    IERC20 public rewardToken;

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
    Returns the total accumulated amount i.e principal + interest stored in aave, only used in case of variable deposit pools.
    @return Total accumulated amount.
    */
    function getTotalAmount() external view override returns (uint256) {
        return adaiToken.balanceOf(address(this));
    }

    /** 
    @notice
    Get the expected net deposit amount (amount minus slippage) for a given amount. Used only for AMM strategies.
    @return net amount.
    */
    function getNetDepositAmount(uint256 _amount) external pure override returns (uint256) {
        return _amount;
    }

    /** 
    @notice
    Returns the underlying inbound (deposit) token address.
    @return Underlying token address.
    */
    function getUnderlyingAsset() external view override returns (address) {
        return adaiToken.UNDERLYING_ASSET_ADDRESS();
    }

    /** 
    @notice
    Returns the instances of the reward tokens
    */
    function getRewardTokens() external view override returns (IERC20[] memory) {
        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = rewardToken;
        return tokens;
    }

    //*********************************************************************//
    // -------------------------- constructor ---------------------------- //
    //*********************************************************************//

    /** 
    @param _lendingPoolAddressProvider A contract which is used as a registry on aave.
    @param _wethGateway A contract which is used to make deposits/withdrawals on transaction token pool on aave.
    @param _dataProvider A contract which mints ERC-721's that represent project ownership and transfers.
    @param _incentiveController A contract which acts as a registry for reserve tokens on aave.
    @param _rewardToken A contract which acts as the reward token for this strategy.
    @param _inboundCurrency inbound currency address.
  */
    constructor(
        ILendingPoolAddressesProvider _lendingPoolAddressProvider,
        IWETHGateway _wethGateway,
        address _dataProvider,
        address _incentiveController,
        IERC20 _rewardToken,
        address _inboundCurrency
    ) {
        if (address(_lendingPoolAddressProvider) == address(0)) {
            revert INVALID_LENDING_POOL_ADDRESS_PROVIDER();
        }

        if (address(_dataProvider) == address(0)) {
            revert INVALID_DATA_PROVIDER();
        }

        lendingPoolAddressProvider = _lendingPoolAddressProvider;
        // address(0) for non-polygon deployment
        incentiveController = IncentiveController(_incentiveController);
        dataProvider = AaveProtocolDataProvider(_dataProvider);
        // lending pool needs to be approved in v2 since it is the core contract in v2 and not lending pool core
        lendingPool = ILendingPool(_lendingPoolAddressProvider.getLendingPool());
        wethGateway = _wethGateway;
        rewardToken = _rewardToken;
        address adaiTokenAddress;
        if (_inboundCurrency == address(0)) {
            (adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(address(rewardToken));
        } else {
            (adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(_inboundCurrency);
        }
        adaiToken = AToken(adaiTokenAddress);
    }

    /**
    @notice
    Deposits funds into aave.
    @param _inboundCurrency Address of the inbound token.
    @param _minAmount Used for aam strategies, since every strategy overrides from the same strategy interface hence it is defined here.
    _minAmount isn't needed in this strategy but since all strategies override from the same interface and the amm strategies need it hence it is used here.
    */
    function invest(address _inboundCurrency, uint256 _minAmount) external payable override nonReentrant onlyOwner {
        if (_inboundCurrency == address(0) || _inboundCurrency == address(rewardToken)) {
            if (_inboundCurrency == address(rewardToken)) {
                // unwraps WMATIC back into MATIC
                WMatic(address(rewardToken)).withdraw(IERC20(_inboundCurrency).balanceOf(address(this)));
            }
            // Deposits MATIC into the pool
            wethGateway.depositETH{ value: address(this).balance }(address(lendingPool), address(this), 155);
        } else {
            uint256 balance = IERC20(_inboundCurrency).balanceOf(address(this));
            IERC20(_inboundCurrency).approve(address(lendingPool), balance);
            lendingPool.deposit(_inboundCurrency, balance, address(this), 155);
        }
    }

    /**
    @notice
    Withdraws funds from aave in case of an early withdrawal.
    @param _inboundCurrency Address of the inbound token.
    @param _amount Amount to withdraw.
    @param _minAmount Used for aam strategies, since every strategy overrides from the same strategy interface hence it is defined here.
    _minAmount isn't needed in this strategy but since all strategies override from the same interface and the amm strategies need it hence it is used here.
    */
    function earlyWithdraw(
        address _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount
    ) external override nonReentrant onlyOwner {
        if (_inboundCurrency == address(0) || _inboundCurrency == address(rewardToken)) {
            adaiToken.approve(address(wethGateway), _amount);

            wethGateway.withdrawETH(address(lendingPool), _amount, address(this));
            if (_inboundCurrency == address(rewardToken)) {
                // Wraps MATIC back into WMATIC
                WMatic(address(rewardToken)).deposit{ value: _amount }();
            }
        } else {
            lendingPool.withdraw(_inboundCurrency, _amount, address(this));
        }
        if (_inboundCurrency == address(0)) {
            (bool success, ) = msg.sender.call{ value: address(this).balance }("");
            if (!success) {
                revert TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();
            }
        } else {
            bool success = IERC20(_inboundCurrency).transfer(
                msg.sender,
                IERC20(_inboundCurrency).balanceOf(address(this))
            );
            if (!success) {
                revert TOKEN_TRANSFER_FAILURE();
            }
        }
    }

    /**
    @notice
    Redeems funds from aave when the waiting round for the good ghosting pool is over.
    @param _inboundCurrency Address of the inbound token.
    @param _amount Amount to withdraw.
    @param variableDeposits Bool Flag which determines whether the deposit is to be made in context of a variable deposit pool or not.
    @param _minAmount Used for aam strategies, since every strategy overrides from the same strategy interface hence it is defined here.
    _minAmount isn't needed in this strategy but since all strategies override from the same interface and the amm strategies need it hence it is used here.
    @param disableRewardTokenClaim Reward claim disable flag.
    */
    function redeem(
        address _inboundCurrency,
        uint256 _amount,
        bool variableDeposits,
        uint256 _minAmount,
        bool disableRewardTokenClaim
    ) external override nonReentrant onlyOwner {
        uint256 redeemAmount = variableDeposits ? _amount : type(uint256).max;
        // Withdraws funds (principal + interest + rewards) from external pool
        if (_inboundCurrency == address(0) || _inboundCurrency == address(rewardToken)) {
            adaiToken.approve(address(wethGateway), redeemAmount);

            wethGateway.withdrawETH(address(lendingPool), redeemAmount, address(this));
            if (_inboundCurrency == address(rewardToken)) {
                // Wraps MATIC back into WMATIC
                WMatic(address(rewardToken)).deposit{ value: address(this).balance }();
            }
        } else {
            lendingPool.withdraw(_inboundCurrency, redeemAmount, address(this));
        }
        if (!disableRewardTokenClaim) {
            // Claims the rewards from the external pool
            address[] memory assets = new address[](1);
            assets[0] = address(adaiToken);

            if (address(rewardToken) != address(0)) {
                uint256 claimableRewards = incentiveController.getRewardsBalance(assets, address(this));
                // moola the celo version of aave does not have the incentive controller logic
                if (claimableRewards != 0) {
                    incentiveController.claimRewards(assets, claimableRewards, address(this));
                }
                // moola the celo version of aave does not have the incentive controller logic
                if (rewardToken.balanceOf(address(this)) != 0) {
                    bool success = rewardToken.transfer(msg.sender, rewardToken.balanceOf(address(this)));
                    if (!success) {
                        revert TOKEN_TRANSFER_FAILURE();
                    }
                }
            }
        }

        if (_inboundCurrency == address(0)) {
            (bool txTokenTransferSuccessful, ) = msg.sender.call{ value: address(this).balance }("");
            if (!txTokenTransferSuccessful) {
                revert TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();
            }
        } else {
            bool success = IERC20(_inboundCurrency).transfer(
                msg.sender,
                IERC20(_inboundCurrency).balanceOf(address(this))
            );
            if (!success) {
                revert TOKEN_TRANSFER_FAILURE();
            }
        }
    }

    /**
    @notice
    Returns total accumulated reward token amount.
    @param disableRewardTokenClaim Reward claim disable flag.
    */
    function getAccumulatedRewardTokenAmounts(bool disableRewardTokenClaim)
        external
        view
        override
        returns (uint256[] memory)
    {
        uint256 amount = 0;
        if (!disableRewardTokenClaim) {
            // atoken address in v2 is fetched from data provider contract
            // Claims the rewards from the external pool
            address[] memory assets = new address[](1);
            assets[0] = address(adaiToken);
            amount = incentiveController.getRewardsBalance(assets, address(this));
        }
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        return amounts;
    }

    // Fallback Functions for calldata and reciever for handling only ether transfer
    receive() external payable {}
}
