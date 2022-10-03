pragma solidity 0.8.7;

contract MockCurveGaugeMinter {
    function minted(address _user, address _gauge) external view returns (uint256) {
        return 0;
    }

    function mint(address _guage) external {}
}
