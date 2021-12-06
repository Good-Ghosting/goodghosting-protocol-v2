pragma solidity >=0.6.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MintableERC20.sol";

contract MockMobiusPool is MintableERC20 {
    IERC20 public reserve;

    constructor(
        string memory name,
        string memory symbol,
        IERC20 _reserve
    ) public MintableERC20(name, symbol) {
        reserve = _reserve;
    }

    function addLiquidity(
        uint256[] calldata amounts,
        uint256 minToMint,
        uint256 deadline
    ) external returns (uint256) {
        reserve.transferFrom(msg.sender, address(this), amounts[0]);
        _mint(msg.sender, amounts[0]);
        return amounts[0];
    }

    function removeLiquidityOneToken(
        uint256 tokenAmount,
        uint8 tokenIndex,
        uint256 minAmount,
        uint256 deadline
    ) external returns (uint256) {
        tokenAmount = IERC20(address(this)).balanceOf(msg.sender);
        _burn(msg.sender, tokenAmount);
        if (minAmount == 900000000000000000) {
            IERC20(reserve).transfer(msg.sender, 500000000000000000);
        } else {
            IERC20(reserve).transfer(msg.sender, tokenAmount);
        }
    }

    function calculateRemoveLiquidityOneToken(
        address account,
        uint256 tokenAmount,
        uint8 tokenIndex
    ) external view returns (uint256) {
        return IERC20(address(this)).balanceOf(msg.sender);
    }

    function calculateTokenAmount(
        address account,
        uint256[] calldata amounts,
        bool deposit
    ) external view returns (uint256) {
        return amounts[0];
    }

    function getLpToken() external view returns (address) {
        return address(this);
    }
}
