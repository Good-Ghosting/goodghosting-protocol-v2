// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.7;

import "./IStrategy.sol";
import "../aaveV3/IPoolAddressesProvider.sol";
import "../aaveV3/ILendingPoolV3.sol";
import "../aave/ILendingPool.sol";
import "../aave/AToken.sol";
import "../aave/IWETHGateway.sol";
import "../aaveV3/IRewardsController.sol";
import "../polygon/WrappedToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error INVALID_DATA_PROVIDER();
error INVALID_LENDING_POOL_ADDRESS_PROVIDER();
error INVALID_TRANSACTIONAL_TOKEN_SENDER();
error TOKEN_TRANSFER_FAILURE();
error TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();

/**
  @notice
  Interacts with Aave V3 protocol (or forks) to generate interest for the pool.
  This contract it's responsible for deposits and withdrawals to the external pool
  as well as getting the generated rewards and sending them back to the pool.
  @author Francis Odisi & Viraz Malhotra.
*/
contract AaveStrategyV3 is Ownable, IStrategy {
    /// @notice Aave referral code
    uint16 constant REFERRAL_CODE = 155;

    /// @notice Address of the Aave V2 weth gateway contract
    IWETHGateway public immutable wethGateway;

    /// @notice Which Aave instance we use to swap Inbound Token to interest bearing aDAI
    IPoolAddressesProvider public immutable poolAddressesProvider;

    /// @notice Lending pool address
    ILendingPoolV3 public immutable lendingPool;

    /// @notice wrapped token address like wamtic or weth
    IERC20 public immutable wrappedTxToken;

    /// @notice Atoken address
    AToken public immutable aToken;

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
        return aToken.balanceOf(address(this));
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
        return aToken.UNDERLYING_ASSET_ADDRESS();
    }

    /** 
    @notice
    Returns the instance of the reward token
    */
    function getRewardTokens() external view override returns (IERC20[] memory) {
        // avoid multiple SLOADS
        address[] memory _rewardTokens = rewardTokens;
        uint256 numRewards = _rewardTokens.length;

        IERC20[] memory rewardTokenInstances = new IERC20[](numRewards);
        for (uint256 i = 0; i < numRewards; ) {
            rewardTokenInstances[i] = IERC20(_rewardTokens[i]);
            unchecked {
                ++i;
            }
        }
        return rewardTokenInstances;
    }

    /** 
    @notice
    Returns the lp token amount received (for amm strategies)
    */
    function getLPTokenAmount(uint256 _amount) external pure override returns (uint256) {
        return _amount;
    }

    /** 
    @notice
    Returns the fee (for amm strategies)
    */
    function getFee() external pure override returns (uint256) {
        return 0;
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
        address aTokenAddress;
        if (_inboundCurrency == address(0)) {
            (aTokenAddress, , ) = dataProvider.getReserveTokensAddresses(address(_wrappedTxToken));
        } else {
            (aTokenAddress, , ) = dataProvider.getReserveTokensAddresses(_inboundCurrency);
        }
        aToken = AToken(aTokenAddress);
        if (_rewardsController != address(0)) {
            rewardTokens = rewardsController.getRewardsByAsset(aTokenAddress);
        }
    }

    /**
    @notice
    Deposits funds into aave.
    @param _inboundCurrency Address of the inbound token.
    @param _minAmount Used for aam strategies, since every strategy overrides from the same strategy interface hence it is defined here.
    _minAmount isn't needed in this strategy but since all strategies override from the same interface and the amm strategies need it hence it is used here.
    */
    function invest(address _inboundCurrency, uint256 _minAmount) external payable override onlyOwner {
        if (_inboundCurrency == address(0) || _inboundCurrency == address(wrappedTxToken)) {
            if (_inboundCurrency == address(wrappedTxToken) && address(wrappedTxToken) != address(0)) {
                // unwraps WrappedToken back into Native Token
                // UPDATE - A6 Audit Report
                WrappedToken(address(wrappedTxToken)).withdraw(IERC20(_inboundCurrency).balanceOf(address(this)));
            }
            // Deposits MATIC into the pool
            wethGateway.depositETH{ value: address(this).balance }(address(lendingPool), address(this), REFERRAL_CODE);
        } else {
            uint256 balance = IERC20(_inboundCurrency).balanceOf(address(this));
            IERC20(_inboundCurrency).approve(address(lendingPool), balance);
            lendingPool.supply(_inboundCurrency, balance, address(this), REFERRAL_CODE);
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
    ) external override onlyOwner {
        if (_inboundCurrency == address(0) || _inboundCurrency == address(wrappedTxToken)) {
            aToken.approve(address(wethGateway), _amount);

            wethGateway.withdrawETH(address(lendingPool), _amount, address(this));
            if (_inboundCurrency == address(wrappedTxToken) && address(wrappedTxToken) != address(0)) {
                // Wraps MATIC back into WMATIC
                WrappedToken(address(wrappedTxToken)).deposit{ value: _amount }();
            }
        } else {
            lendingPool.withdraw(_inboundCurrency, _amount, address(this));
        }
        if (_inboundCurrency == address(0)) {
            (bool success, ) = msg.sender.call{ value: _amount }("");
            if (!success) {
                revert TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();
            }
        } else {
            bool success = IERC20(_inboundCurrency).transfer(msg.sender, _amount);
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
    @param _minAmount Used for aam strategies, since every strategy overrides from the same strategy interface hence it is defined here.
    _minAmount isn't needed in this strategy but since all strategies override from the same interface and the amm strategies need it hence it is used here.
    @param disableRewardTokenClaim Reward claim disable flag.
    */
    function redeem(
        address _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount,
        bool disableRewardTokenClaim
    ) external override onlyOwner {
        if (_amount != 0) {
            // Withdraws funds (principal + interest + rewards) from external pool
            if (_inboundCurrency == address(0) || _inboundCurrency == address(wrappedTxToken)) {
                aToken.approve(address(wethGateway), _amount);

                wethGateway.withdrawETH(address(lendingPool), _amount, address(this));
                if (_inboundCurrency == address(wrappedTxToken) && address(wrappedTxToken) != address(0)) {
                    // Wraps MATIC back into WMATIC
                    WrappedToken(address(wrappedTxToken)).deposit{ value: address(this).balance }();
                }
            } else {
                lendingPool.withdraw(_inboundCurrency, _amount, address(this));
            }
        }
        if (!disableRewardTokenClaim) {
            // Claims the rewards from the external pool
            address[] memory assets = new address[](1);
            assets[0] = address(aToken);

            if (address(rewardsController) != address(0)) {
                rewardsController.claimAllRewardsToSelf(assets);
            }

            // avoid multiple SLOADS
            address[] memory _rewardTokens = rewardTokens;
            uint256 numRewards = _rewardTokens.length;
            for (uint256 i = 0; i < numRewards; ) {
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
        if (!disableRewardTokenClaim) {
            // avoid multiple SLOADS
            address[] memory _rewardTokens = rewardTokens;
            uint256 numRewards = _rewardTokens.length;

            if (address(rewardsController) != address(0)) {
                // Claims the rewards from the external pool
                address[] memory assets = new address[](1);
                assets[0] = address(aToken);
                (, uint256[] memory unclaimedAmounts) = rewardsController.getAllUserRewards(assets, address(this));

                for (uint256 i = 0; i < numRewards; ) {
                    unclaimedAmounts[i] += IERC20(_rewardTokens[i]).balanceOf(address(this));
                }
                return unclaimedAmounts;
            } else {
                uint256[] memory amounts = new uint256[](numRewards);
                for (uint256 i = 0; i < numRewards; ) {
                    amounts[i] = IERC20(_rewardTokens[i]).balanceOf(address(this));
                }
                return amounts;
            }
        } else {
            uint256[] memory amounts = new uint256[](rewardTokens.length);
            return amounts;
        }
    }

    // Fallback Functions for calldata and reciever for handling only ether transfer
    // UPDATE - A7 Audit Report
    receive() external payable {
        if (msg.sender != address(wrappedTxToken) && msg.sender != address(wethGateway)) {
            revert INVALID_TRANSACTIONAL_TOKEN_SENDER();
        }
    }
}
