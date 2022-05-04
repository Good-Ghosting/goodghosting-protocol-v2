pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MintableERC20.sol";

contract MockMobiusGauge is MintableERC20 {
    IERC20 public reserve;
    IERC20 public mobi;


    constructor(
        string memory name,
        string memory symbol,
        IERC20 _mobi,
        IERC20 _reserve
    ) MintableERC20(name, symbol) {
        mobi = _mobi;
        reserve = _reserve;
    }

    function drain(uint256 _value) external {
        reserve.transfer(msg.sender, _value);
    }

    function deposit(uint256 _value) external {
        _mint(msg.sender, _value);
        reserve.transferFrom(msg.sender, address(this), _value);
    }

    function withdraw(uint256 _value, bool _claim_rewards) external {
        _burn(msg.sender, _value);
        if (_claim_rewards) {
            mobi.transfer(msg.sender, mobi.balanceOf(address(this)));
        }
        if (_value > reserve.balanceOf(address(this))) {
            _value = reserve.balanceOf(address(this));
        }
        reserve.transfer(msg.sender, _value);
    }

    function claimable_reward(address _addr, address _token) external view returns (uint256) {
        return IERC20(_token).balanceOf(_token);
    }

    function claimable_tokens(address _addr) external view returns (uint256) {
        return mobi.balanceOf(address(this));
    }
}
