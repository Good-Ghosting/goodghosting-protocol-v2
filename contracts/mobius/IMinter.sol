pragma solidity ^0.8.7;

interface IMinter {
    function mint(address gauge_addr) external;

    function minted(address _addr, address gauge_addr) external view returns (uint256);
}
