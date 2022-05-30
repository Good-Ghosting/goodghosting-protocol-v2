// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

// Allows anyone to claim a token if they exist in a merkle root.
interface IMerkleValidator {
    // Returns the merkle root of the merkle tree containing account balances available to claim.
    function merkleRoot() external view returns (bytes32);
    // Claim the given amount of the token to the given address. Reverts if the inputs are invalid.
    function validate(uint256 index, address account, bool isValid, bytes32[] calldata merkleProof) external view;
}