pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MintableERC20.sol";

contract MockMobiusPool is MintableERC20 {
    IERC20 public reserve;

    address gauge;

    constructor(
        string memory name,
        string memory symbol,
        IERC20 _reserve
    ) MintableERC20(name, symbol) {
        reserve = _reserve;
    }

    function setGauge(address _gauge) external {
        gauge = _gauge;
    }

    function drain(uint256 _value) external {
        reserve.transfer(msg.sender, _value);
    }

    function send_liquidity(uint256 _amount) external returns (uint256) {
        reserve.transferFrom(msg.sender, address(this), _amount);
        _mint(msg.sender, _amount);
        return _amount;
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
        if (minAmount == 900000000000000000) {
            reserve.transfer(msg.sender, 6000000000000000000);
        } else if (minAmount == 9000) {
            reserve.transfer(msg.sender, tokenAmount / 2);
        } else {
            if (tokenAmount > reserve.balanceOf(address(this))) {
                tokenAmount = reserve.balanceOf(address(this));
            }
            reserve.transfer(msg.sender, tokenAmount);
        }
    }

    function getToken(uint8 index) external view returns (IERC20) {
        return reserve;
    }

    function calculateRemoveLiquidityOneToken(
        address account,
        uint256 tokenAmount,
        uint8 tokenIndex
    ) external view returns (uint256) {
        return tokenAmount;
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
