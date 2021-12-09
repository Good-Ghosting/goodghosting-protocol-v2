// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.7;

interface AToken {
    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);
}
