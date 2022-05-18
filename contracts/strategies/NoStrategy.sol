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
error TOKEN_TRANSFER_FAILURE();
error TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();

/**
  @notice
  Interacts with aave v2 & moola protocol to generate interest for the goodghosting pool it is used in, so it's responsible for deposits, withdrawals and getting rewards and sending these back to the pool.
*/
contract NoStrategy is Ownable, IStrategy {
    /// @notice reward token address for eg wmatic in case of polygon deployment
    IERC20 public inboundToken;

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
    Returns the total accumalated amount i.e principal + interest stored in aave, only used in case of variable deposit pools.
    @return Total accumalated amount.
    */
    function getTotalAmount() external view override returns (uint256) {
        return inboundToken.balanceOf(address(this));
    }

    /** 
    @notice
    Get net deposit for a deposit amount (used only for amm strategies).
    @return net amount.
    */
    function getNetDepositAmount(uint256 _amount) external pure override returns (uint256) {
        return _amount;
    }

    /** 
    @notice
    Returns the underlying token address.
    @return Underlying token address.
    */
    function getUnderlyingAsset() external view override returns (address) {
        return address(inboundToken);
    }

    /** 
    @notice
    Returns the instances of the reward tokens
    */
    function getRewardTokens() external pure override returns (IERC20[] memory) {
        IERC20[] memory tokens = new IERC20[](0);
        return tokens;
    }

    //*********************************************************************//
    // -------------------------- constructor ---------------------------- //
    //*********************************************************************//

    /** 
    @param _inboundCurrency inbound currency address.
    */
    constructor(
        address _inboundCurrency
    ) {
        inboundToken = IERC20(_inboundCurrency);
    }

    /**
    @notice
    Deposits funds into aave.
    @param _inboundCurrency Address of the inbound token.
    @param _minAmount Used for aam strategies, since every strategy overrides from the same strategy interface hence it is defined here.
    _minAmount isn't needed in this strategy but since all strategies override from the same interface and the amm strategies need it hence it is used here.
    */
    function invest(address _inboundCurrency, uint256 _minAmount) external payable override onlyOwner {}

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
        if (_inboundCurrency == address(0)) {
            (bool success, ) = msg.sender.call{ value: _amount }("");
            if (!success) {
                revert TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();
            }
        } else {
            bool success = IERC20(_inboundCurrency).transfer(
                msg.sender,
                _amount
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
    ) external override onlyOwner {
        uint256 redeemAmount = variableDeposits ? _amount : _inboundCurrency == address(0) ? address(this).balance : IERC20(_inboundCurrency).balanceOf(address(this));

        if (_inboundCurrency == address(0)) {
            (bool txTokenTransferSuccessful, ) = msg.sender.call{ value: redeemAmount}("");
            if (!txTokenTransferSuccessful) {
                revert TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();
            }
        } else {
            bool success = IERC20(_inboundCurrency).transfer(
                msg.sender,
                redeemAmount
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
        pure
        override
        returns (uint256[] memory)
    {
        uint256[] memory amounts = new uint256[](0);
        return amounts;
    }

    // Fallback Functions for calldata and reciever for handling only ether transfer
    receive() external payable {}
}
