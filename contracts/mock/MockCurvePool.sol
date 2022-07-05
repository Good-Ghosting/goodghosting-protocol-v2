pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./MintableERC20.sol";

contract MockCurvePool is MintableERC20, Ownable {
    IERC20 public reserve;

    address gauge;

    bool setImpermanentLoss;

    constructor(
        string memory name,
        string memory symbol,
        IERC20 _reserve
    ) MintableERC20(name, symbol) {
        reserve = _reserve;
        _mint(msg.sender, 1000 ether);
    }

    function setILoss() external onlyOwner {
        setImpermanentLoss = true;
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

    function add_liquidity(
        uint256[3] memory _amounts,
        uint256 _min_mint_amount,
        bool _use_underlying
    ) external returns (uint256) {
        reserve.transferFrom(msg.sender, address(this), _amounts[0]);
        _mint(msg.sender, _amounts[0]);
        return _amounts[0];
    }

    function add_liquidity(uint256[5] memory _amounts, uint256 _min_mint_amount) external {
        reserve.transferFrom(msg.sender, address(this), _amounts[0]);
        _mint(msg.sender, _amounts[0]);
    }

    function remove_liquidity_one_coin(
        uint256 _token_amount,
        int128 i,
        uint256 _min_amount,
        bool _use_underlying
    ) external returns (uint256) {
        if (_min_amount == 900000000000000000) {
            reserve.transfer(msg.sender, 6000000000000000000);
        } else if (_min_amount == 9000) {
            reserve.transfer(msg.sender, _token_amount / 2);
        } else {
            if (_token_amount > reserve.balanceOf(address(this))) {
                _token_amount = reserve.balanceOf(address(this));
            }
            reserve.transfer(msg.sender, _token_amount);
        }
    }

    function remove_liquidity_one_coin(
        uint256 _token_amount,
        uint256 i,
        uint256 _min_amount
    ) external {
        if (_min_amount == 900000000000000000) {
            reserve.transfer(msg.sender, 6000000000000000000);
        } else if (_min_amount == 9000) {
            reserve.transfer(msg.sender, _token_amount / 2);
        } else {
            if (_token_amount > reserve.balanceOf(address(this))) {
                _token_amount = reserve.balanceOf(address(this));
            }
            reserve.transfer(msg.sender, _token_amount);
        }
    }

    function underlying_coins(uint256 arg0) external view returns (address) {
        return address(reserve);
    }

    function calc_withdraw_one_coin(uint256 _token_amount, int128 i) external view returns (uint256) {
        if (setImpermanentLoss) {
            return _token_amount / 2;
        } else {
            return _token_amount;
        }
    }

    function calc_withdraw_one_coin(uint256 _token_amount, uint256 i) external view returns (uint256) {
        if (setImpermanentLoss) {
            return _token_amount / 2;
        } else {
            return _token_amount;
        }
    }

    function calc_token_amount(uint256[3] calldata _amounts, bool is_deposit) external view returns (uint256) {
        if (_amounts[0] == 1) {
            return 0;
        } else {
            return _amounts[0];
        }
    }

    function calc_token_amount(uint256[5] calldata _amounts, bool is_deposit) external view returns (uint256) {
        if (_amounts[0] == 1) {
            return 0;
        } else {
            return _amounts[0];
        }
    }

    function lp_token() external view returns (address) {
        return address(this);
    }

    function token() external view returns (address) {
        return address(this);
    }
}
