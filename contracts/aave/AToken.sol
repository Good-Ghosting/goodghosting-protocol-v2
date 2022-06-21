// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.7;

interface AToken {
    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
}
