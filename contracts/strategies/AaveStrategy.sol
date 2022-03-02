pragma solidity ^0.8.7;

import "./IStrategy.sol";
import "../aave/ILendingPoolAddressesProvider.sol";
import "../aave/ILendingPool.sol";
import "../aave/AToken.sol";
import "../aave/IWETHGateway.sol";
import "../aave/IncentiveController.sol";
import "../polygon/WMatic.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error INVALID_AMOUNT();
error INVALID_DATA_PROVIDER();
error INVALID_LENDING_POOL_ADDRESS_PROVIDER();
error TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();

/**
  @notice
  Interacts with aave & moola protocol to generate interest for the goodghosting pool it is used in, so it's responsible for deposits, withdrawals and getting rewards and sending these back to the pool.
*/
contract AaveStrategy is Ownable, IStrategy {
    /// @notice Address of the Aave V2 incentive controller contract
    IncentiveController public immutable incentiveController;

    /// @notice Address of the Aave V2 weth gateway contract
    IWETHGateway public immutable wethGateway;

    /// @notice Which Aave instance we use to swap Inbound Token to interest bearing aDAI
    ILendingPoolAddressesProvider public immutable lendingPoolAddressProvider;

    /// @notice Lending pool address
    ILendingPool public immutable lendingPool;

    /// @notice AaveProtocolDataProvider address
    AaveProtocolDataProvider public immutable dataProvider;

    /// @notice reward token address for eg wmatic in case of polygon deployment
    IERC20 public immutable rewardToken;

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
        // atoken address in v2 is fetched from data provider contract
        address adaiTokenAddress;
        if (_inboundCurrency == address(0)) {
            (adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(address(rewardToken));
        } else {
            (adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(_inboundCurrency);
        }
        AToken adaiToken = AToken(adaiTokenAddress);
        return adaiToken.balanceOf(address(this));
    }

    /** 
    @notice
    Returns the instance of the reward token
    */
    function getRewardToken() external view override returns (IERC20) {
        return rewardToken;
    }

    /** 
    @notice
    Returns the instance of the governance token
    */
    function getGovernanceToken() external view override returns (IERC20) {
        return IERC20(address(0));
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
  */
    constructor(
        ILendingPoolAddressesProvider _lendingPoolAddressProvider,
        IWETHGateway _wethGateway,
        address _dataProvider,
        address _incentiveController,
        IERC20 _rewardToken
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
        // wmatic in case of polygon and address(0) for non-polygon deployment
        rewardToken = _rewardToken;
    }

    /**
    @notice
    Deposits funds into aave.
    @param _inboundCurrency Address of the inbound token.
    @param _minAmount Used for aam strategies, since every strategy overrides from the same strategy interface hence it is defined here.
    */
    function invest(address _inboundCurrency, uint256 _minAmount) external payable override onlyOwner {
        if (_inboundCurrency == address(0) || _inboundCurrency == address(rewardToken)) {
            if (_inboundCurrency == address(rewardToken)) {
                // unwraps WMATIC back into MATIC
                WMatic(address(rewardToken)).withdraw(IERC20(_inboundCurrency).balanceOf(address(this)));
            }
            // Deposits MATIC into the pool
            wethGateway.depositETH{ value: address(this).balance }(address(lendingPool), address(this), 155);
        } else {
            IERC20(_inboundCurrency).approve(address(lendingPool), IERC20(_inboundCurrency).balanceOf(address(this)));
            lendingPool.deposit(_inboundCurrency, IERC20(_inboundCurrency).balanceOf(address(this)), address(this), 155);
        }
    }

    /**
    @notice
    Withdraws funds from aave in case of an early withdrawal.
    @param _inboundCurrency Address of the inbound token.
    @param _amount Amount to withdraw.
    @param _minAmount Used for aam strategies, since every strategy overrides from the same strategy interface hence it is defined here.
    */
    function earlyWithdraw(
        address _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount
    ) external override onlyOwner {
        if (_amount == 0) {
           revert INVALID_AMOUNT();
        }
        // atoken address in v2 is fetched from data provider contract
        address adaiTokenAddress;
        if (_inboundCurrency == address(0)) {
            (adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(address(rewardToken));
        } else {
            (adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(_inboundCurrency);
        }
        AToken adaiToken = AToken(adaiTokenAddress);
        if (adaiToken.balanceOf(address(this)) > 0) {
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
        }
        if (_inboundCurrency == address(0)) {
            (bool success, ) = msg.sender.call{ value: address(this).balance }("");
            if (!success) {
                revert TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();
            }
        } else {
            IERC20(_inboundCurrency).transfer(msg.sender, IERC20(_inboundCurrency).balanceOf(address(this)));
        }
    }

    /**
    @notice
    Redeems funds from aave when the waiting round for the good ghosting pool is over.
    @param _inboundCurrency Address of the inbound token.
    @param _amount Amount to withdraw.
    @param variableDeposits Bool Flag which determines whether the deposit is to be made in context of a variable deposit pool or not.
    @param _minAmount Used for aam strategies, since every strategy overrides from the same strategy interface hence it is defined here.
    */
    function redeem(
        address _inboundCurrency,
        uint256 _amount,
        bool variableDeposits,
        uint256 _minAmount
    ) external override onlyOwner {
        uint256 redeemAmount = variableDeposits ? _amount : type(uint256).max;
        // atoken address in v2 is fetched from data provider contract
        address adaiTokenAddress;
        if (_inboundCurrency == address(0)) {
            (adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(address(rewardToken));
        } else {
            (adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(_inboundCurrency);
        }
        AToken adaiToken = AToken(adaiTokenAddress);
        // Withdraws funds (principal + interest + rewards) from external pool
        if (adaiToken.balanceOf(address(this)) > 0) {
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
        }
        // Claims the rewards from the external pool
        address[] memory assets = new address[](1);
        assets[0] = address(adaiToken);

        if (address(rewardToken) != address(0)) {
            uint256 claimableRewards = incentiveController.getRewardsBalance(assets, address(this));
            // moola the celo version of aave does not have the incentive controller logic
            if (claimableRewards > 0) {
                incentiveController.claimRewards(assets, claimableRewards, address(this));
            }
            // moola the celo version of aave does not have the incentive controller logic
            if (rewardToken.balanceOf(address(this)) > 0) {
                rewardToken.transfer(msg.sender, rewardToken.balanceOf(address(this)));
            }
        }

        if (_inboundCurrency == address(0)) {
            (bool success, ) = msg.sender.call{ value: address(this).balance }("");
            if (!success) {
                revert TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();
            }
        } else {
            IERC20(_inboundCurrency).transfer(msg.sender, IERC20(_inboundCurrency).balanceOf(address(this)));
        }
    }

    /**
    @notice
    Returns total accumalated reward token amount.
    @param _inboundCurrency Address of the inbound token.
    */
    function getAccumalatedRewardTokenAmount(address _inboundCurrency) external override returns (uint256) {
        // atoken address in v2 is fetched from data provider contract
        address adaiTokenAddress;
        if (_inboundCurrency == address(0)) {
            (adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(address(rewardToken));
        } else {
            (adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(_inboundCurrency);
        }
        AToken adaiToken = AToken(adaiTokenAddress);
        // Claims the rewards from the external pool
        address[] memory assets = new address[](1);
        assets[0] = address(adaiToken);
        return incentiveController.getRewardsBalance(assets, address(this));
    }

    /**
    @notice
    Returns total accumalated governance token amount.
    @param _inboundCurrency Address of the inbound token.
    */
    function getAccumalatedGovernanceTokenAmount(address _inboundCurrency) external override returns (uint256) {
        return 0;
    }

    // Fallback Functions for calldata and reciever for handling only ether transfer
    receive() external payable {}
}
