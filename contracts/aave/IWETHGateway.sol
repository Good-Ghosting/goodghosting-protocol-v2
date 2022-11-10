// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.7;

interface IWETHGateway {
    function depositETH(address lendingPool, address onBehalfOf, uint16 referralCode) external payable;

    function withdrawETH(address lendingPool, uint256 amount, address to) external;
}
