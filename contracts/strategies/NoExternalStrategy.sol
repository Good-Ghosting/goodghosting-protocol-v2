// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.7;

import "./IStrategy.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error INVALID_REWARD_TOKEN();
error TOKEN_TRANSFER_FAILURE();
error TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();

/**
  @notice
  This strategy holds the deposited funds without transferring them to an external protocol.
  @author Francis Odisi & Viraz Malhotra.
*/
contract NoExternalStrategy is Ownable, IStrategy {
    /// @notice inbound token (deposit token) address
    IERC20 public inboundToken;

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
    function getTotalAmount() external view override returns (uint256) {
        return address(inboundToken) == address(0) ? address(this).balance : inboundToken.balanceOf(address(this));
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
    Returns the underlying token address.
    @return Returns the underlying inbound (deposit) token address.
    */
    function getUnderlyingAsset() external view override returns (address) {
        return address(inboundToken);
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
    function getLPTokenAmount(uint256 _amount) external pure override returns (uint256) {
        return 0;
    }

    //*********************************************************************//
    // -------------------------- constructor ---------------------------- //
    //*********************************************************************//

    /** 
    @param _inboundCurrency inbound currency address.
    */
    constructor(address _inboundCurrency, IERC20[] memory _rewardTokens) {
        inboundToken = IERC20(_inboundCurrency);
        for (uint256 i = 0; i < _rewardTokens.length; ) {
            if (address(_rewardTokens[i]) == address(0)) {
                revert INVALID_REWARD_TOKEN();
            }
            unchecked {
                ++i;
            }
        }
        rewardTokens = _rewardTokens;
    }

    //*********************************************************************//
    // ------------------------- internal method -------------------------- //
    //*********************************************************************//
    /** 
    @notice
    Transfers inbound token amount back to pool.
    @param _inboundCurrency Address of the inbound token.
    @param _amount transfer amount
    */
    function _transferInboundTokenToPool(address _inboundCurrency, uint256 _amount) internal {
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
    Deposits funds into this contract.
    @param _inboundCurrency Address of the inbound token.
    @param _minAmount Used for aam strategies, since every strategy overrides from the same strategy interface hence it is defined here.
    _minAmount isn't needed in this strategy but since all strategies override from the same interface and the amm strategies need it hence it is used here.
    */
    function invest(address _inboundCurrency, uint256 _minAmount) external payable override onlyOwner {}

    /**
    @notice
    Withdraws funds from this strategy in case of an early withdrawal.
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
        _transferInboundTokenToPool(_inboundCurrency, _amount);
    }

    /**
    @notice
    Redeems funds from this strategy when the waiting round for the good ghosting pool is over.
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
        uint256 _balance = _inboundCurrency == address(0)
            ? address(this).balance
            : IERC20(_inboundCurrency).balanceOf(address(this));
        // safety check since funds don't get transferred to a extrnal protocol
        if (_amount > _balance) {
            _amount = _balance;
        }

        _transferInboundTokenToPool(_inboundCurrency, _amount);

        if (!disableRewardTokenClaim) {
            for (uint256 i = 0; i < rewardTokens.length; ) {
                // safety check since funds don't get transferred to a extrnal protocol
                if (IERC20(rewardTokens[i]).balanceOf(address(this)) != 0) {
                    bool success = IERC20(rewardTokens[i]).transfer(
                        msg.sender,
                        IERC20(rewardTokens[i]).balanceOf(address(this))
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
        uint256[] memory amounts = new uint256[](rewardTokens.length);
        for (uint256 i = 0; i < rewardTokens.length; ) {
            amounts[i] = rewardTokens[i].balanceOf(address(this));
            unchecked {
                ++i;
            }
        }
        return amounts;
    }
}
