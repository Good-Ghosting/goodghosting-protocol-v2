pragma solidity ^0.8.7;

import "./IStrategy.sol";
import "../aaveV3/IPoolAddressesProvider.sol";
import "../aaveV3/ILendingPoolV3.sol";
import "../aave/ILendingPool.sol";
import "../aave/AToken.sol";
import "../aave/IWETHGateway.sol";
import "../aaveV3/IRewardsController.sol";
import "../polygon/WMatic.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error TOKEN_TRANSFER_FAILURE();
error INVALID_DATA_PROVIDER();
error INVALID_LENDING_POOL_ADDRESS_PROVIDER();
error TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();

/**
  @notice
  Interacts with aave & moola protocol to generate interest for the goodghosting pool it is used in, so it's responsible for deposits, withdrawals and getting rewards and sending these back to the pool.
*/
contract AaveStrategyV3 is Ownable, ReentrancyGuard, IStrategy {
    /// @notice Address of the Aave V2 weth gateway contract
    IWETHGateway public immutable wethGateway;

    /// @notice Which Aave instance we use to swap Inbound Token to interest bearing aDAI
    IPoolAddressesProvider public immutable poolAddressesProvider;

    /// @notice Lending pool address
    ILendingPoolV3 public immutable lendingPool;

    /// @notice wrapped token address like wamtic or weth
    IERC20 public immutable wrappedTxToken;

    /// @notice Atoken address
    AToken public immutable adaiToken;

    /// @notice AaveProtocolDataProvider address
    AaveProtocolDataProvider public dataProvider;

    /// @notice Address of the Aave V2 incentive controller contract
    IRewardsController public rewardsController;

    /// @notice reward token address
    address[] public rewardTokens;

    //*********************************************************************//
    // ------------------------- external views -------------------------- //
    //*********************************************************************//

    /** 
    @notice
    Returns the total accumalated amount i.e principal + interest stored in aave, only used in case of variable deposit pools.
    @return Total accumalated amount.
    */
    function getTotalAmount() external view override returns (uint256) {
        return adaiToken.balanceOf(address(this));
    }

    /** 
    @notice
    Returns the underlying token address.
    @return Underlying token address.
    */
    function getUnderlyingAsset() external view override returns (address) {
        return adaiToken.UNDERLYING_ASSET_ADDRESS();
    }

    /** 
    @notice
    Returns the instance of the reward token
    */
    function getRewardTokens() external view override returns (IERC20[] memory) {
        IERC20[] memory rewardTokenInstances = new IERC20[](rewardTokens.length);
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            rewardTokenInstances[i] = IERC20(rewardTokens[i]);
        }
        return rewardTokenInstances;
    }

    //*********************************************************************//
    // -------------------------- constructor ---------------------------- //
    //*********************************************************************//

    /** 
    @param _poolAddressesProvider A contract which is used as a registry on aave.
    @param _wethGateway A contract which is used to make deposits/withdrawals on transaction token pool on aave.
    @param _dataProvider A contract which mints ERC-721's that represent project ownership and transfers.
    @param _rewardsController A contract which acts as a registry for reserve tokens on aave.
    @param _wrappedTxToken wrapped txn token address.
    @param _inboundCurrency inbound currency address.
  */
    constructor(
        IPoolAddressesProvider _poolAddressesProvider,
        IWETHGateway _wethGateway,
        address _dataProvider,
        address _rewardsController,
        IERC20 _wrappedTxToken,
        address _inboundCurrency
    ) {
        if (address(_poolAddressesProvider) == address(0)) {
            revert INVALID_LENDING_POOL_ADDRESS_PROVIDER();
        }

        if (address(_dataProvider) == address(0)) {
            revert INVALID_DATA_PROVIDER();
        }

        poolAddressesProvider = _poolAddressesProvider;
        // address(0) for non-polygon deployment
        rewardsController = IRewardsController(_rewardsController);
        dataProvider = AaveProtocolDataProvider(_dataProvider);
        // lending pool needs to be approved in v2 since it is the core contract in v2 and not lending pool core
        lendingPool = ILendingPoolV3(_poolAddressesProvider.getPool());
        wethGateway = _wethGateway;
        wrappedTxToken = _wrappedTxToken;
        address adaiTokenAddress;
        if (_inboundCurrency == address(0)) {
            (adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(address(_wrappedTxToken));
        } else {
            (adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(_inboundCurrency);
        }
        adaiToken = AToken(adaiTokenAddress);
        rewardTokens = rewardsController.getRewardsByAsset(adaiTokenAddress);
    }

    /**
    @notice
    Deposits funds into aave.
    @param _inboundCurrency Address of the inbound token.
    @param _minAmount Used for aam strategies, since every strategy overrides from the same strategy interface hence it is defined here.
    _minAmount isn't needed in this strategy but since all strategies override from the same interface and the amm strategies need it hence it is used here.
    */
    function invest(address _inboundCurrency, uint256 _minAmount) external payable override nonReentrant onlyOwner {
        if (_inboundCurrency == address(0) || _inboundCurrency == address(wrappedTxToken)) {
            if (_inboundCurrency == address(wrappedTxToken) && address(wrappedTxToken) != address(0)) {
                // unwraps WMATIC back into MATIC
                WMatic(address(wrappedTxToken)).withdraw(IERC20(_inboundCurrency).balanceOf(address(this)));
            }
            // Deposits MATIC into the pool
            wethGateway.depositETH{ value: address(this).balance }(address(lendingPool), address(this), 155);
        } else {
            uint256 balance = IERC20(_inboundCurrency).balanceOf(address(this));
            IERC20(_inboundCurrency).approve(address(lendingPool), balance);
            lendingPool.supply(_inboundCurrency, balance, address(this), 155);
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
        if (_inboundCurrency == address(0) || _inboundCurrency == address(wrappedTxToken)) {
            adaiToken.approve(address(wethGateway), _amount);

            wethGateway.withdrawETH(address(lendingPool), _amount, address(this));
            if (_inboundCurrency == address(wrappedTxToken) && address(wrappedTxToken) != address(0)) {
                // Wraps MATIC back into WMATIC
                WMatic(address(wrappedTxToken)).deposit{ value: _amount }();
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
        if (_inboundCurrency == address(0) || _inboundCurrency == address(wrappedTxToken)) {
            adaiToken.approve(address(wethGateway), redeemAmount);

            wethGateway.withdrawETH(address(lendingPool), redeemAmount, address(this));
            if (_inboundCurrency == address(wrappedTxToken) && address(wrappedTxToken) != address(0)) {
                // Wraps MATIC back into WMATIC
                WMatic(address(wrappedTxToken)).deposit{ value: address(this).balance }();
            }
        } else {
            lendingPool.withdraw(_inboundCurrency, redeemAmount, address(this));
        }
        if (!disableRewardTokenClaim) {
            // Claims the rewards from the external pool
            address[] memory assets = new address[](1);
            assets[0] = address(adaiToken);

            rewardsController.claimAllRewardsToSelf(assets);
            for (uint256 i = 0; i < rewardTokens.length; i++) {
                if (IERC20(rewardTokens[i]).balanceOf(address(this)) > 0) {
                    bool success = IERC20(rewardTokens[i]).transfer(
                        msg.sender,
                        IERC20(rewardTokens[i]).balanceOf(address(this))
                    );
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
    Returns total accumalated reward token amount.
    This method is not marked as view since in the curve gauge contract "claimable_reward_write" is not marked as view and all strategies share the same strategy interface.
    @param disableRewardTokenClaim Reward claim disable flag.
    */
    function getAccumulatedRewardTokenAmounts(bool disableRewardTokenClaim)
        external
        override
        returns (uint256[] memory)
    {
        if (!disableRewardTokenClaim) {
            // Claims the rewards from the external pool
            address[] memory assets = new address[](1);
            assets[0] = address(adaiToken);
            (, uint256[] memory unclaimedAmounts) = rewardsController.getAllUserRewards(assets, address(this));
            return unclaimedAmounts;
        } else {
            uint256[] memory amounts = new uint256[](1);
            amounts[0] = 0;
            return amounts;
        }
    }

    // Fallback Functions for calldata and reciever for handling only ether transfer
    receive() external payable {}
}
