pragma solidity 0.8.7;

interface ICurveMinter {
    function mint(address _guage) external;

    function minted(address _user, address _gauge) external view returns (uint256);
}
