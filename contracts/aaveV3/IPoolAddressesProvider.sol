// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.7;

interface IPoolAddressesProvider {
    function getPool() external view returns (address);
}
