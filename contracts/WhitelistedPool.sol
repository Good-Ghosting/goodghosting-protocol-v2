// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "./Pool.sol";
import "./MerkleDistributor.sol";

contract WhitelistedPool is Pool, MerkleDistributor {
    /**
        Creates a new instance of GoodGhosting game
        @param _inboundCurrency Smart contract address of inbound currency used for the game.
        @param _maxFlexibleSegmentPaymentAmount Maximum Flexible Deposit Amount in case of flexible pools.
        @param _depositCount Number of segments in the game.
        @param _segmentLength Lenght of each segment, in seconds (i.e., 180 (sec) => 3 minutes).
        @param _waitingRoundSegmentLength Lenght of waiting round segment, in seconds (i.e., 180 (sec) => 3 minutes).
        @param _segmentPayment Amount of tokens each player needs to contribute per segment
        @param _earlyWithdrawalFee Fee paid by users on early withdrawals (before the game completes). Used as an integer percentage (i.e., 10 represents 10%).
        @param _customFee performance fee charged by admin. Used as an integer percentage (i.e., 10 represents 10%). Does not accept "decimal" fees like "0.5".
        @param _maxPlayersCount max quantity of players allowed to join the game
        @param _strategy investment strategy contract address.
        @param _isTransactionalToken isTransactionalToken flag.
     */
    constructor(
        address _inboundCurrency,
        uint256 _maxFlexibleSegmentPaymentAmount,
        uint256 _depositCount,
        uint256 _segmentLength,
        uint256 _waitingRoundSegmentLength,
        uint256 _segmentPayment,
        uint128 _earlyWithdrawalFee,
        uint128 _customFee,
        uint256 _maxPlayersCount,
        bool _flexibleSegmentPayment,
        IStrategy _strategy,
        bool _isTransactionalToken
    )
        Pool(
            _inboundCurrency,
            _maxFlexibleSegmentPaymentAmount,
            _depositCount,
            _segmentLength,
            _waitingRoundSegmentLength,
            _segmentPayment,
            _earlyWithdrawalFee,
            _customFee,
            _maxPlayersCount,
            _flexibleSegmentPayment,
            _strategy,
            _isTransactionalToken
        )
    {}

    /**
    @dev Initializes the pool
    @param _merkleRoot Merkle Root for whitelisted players.
    */
    function initializePool(bytes32 _merkleRoot) external onlyOwner whenNotPaused {
        setMerkleRoot(_merkleRoot);
        firstSegmentStart = block.timestamp; //gets current time
        waitingRoundSegmentStart = block.timestamp + (segmentLength * lastSegment);
    }

    /// @notice Does not allow users to join. Must use "joinWhitelistedGame instead.
    /// @dev Must override function from parent contract (GoodGhosting.sol) and revert to enforce whitelisting.
    /// @param _minAmount Slippage based amount to cover for impermanent loss scenario.
    /// @param _depositAmount Variable Deposit Amount in case of a variable deposit pool.
    function joinGame(uint256 _minAmount, uint256 _depositAmount)
        external
        payable
        override
        whenGameIsInitialized
        whenNotPaused
    {
        revert("Whitelisting enabled - use joinWhitelistedGame(uint256, bytes32[]) instead");
    }

    /// @notice Allows a whitelisted player to join the game.
    /// @param index Merkle proof player index
    /// @param merkleProof Merkle proof of the player
    /// @param _minAmount Slippage based amount to cover for impermanent loss scenario.
    /// @param _depositAmount Variable Deposit Amount in case of a variable deposit pool.
    /// @dev Cannot be called when the game is paused. Different function name to avoid confusion (instead of overloading "joinGame")
    function joinWhitelistedGame(
        uint256 index,
        bytes32[] calldata merkleProof,
        uint256 _minAmount,
        uint256 _depositAmount
    ) external payable whenNotPaused {
        claim(index, msg.sender, true, merkleProof);
        _joinGame(_minAmount, _depositAmount);
    }
}
