pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MintableERC20.sol";

contract MockCurvePool is MintableERC20 {
    IERC20 public reserve;

    constructor(
        string memory name,
        string memory symbol,
        IERC20 _reserve
    ) MintableERC20(name, symbol) {
        reserve = _reserve;
        _mint(msg.sender, 1000 ether);
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
        uint256 amt = _token_amount;
        if (_min_amount != 9000) {
            _token_amount = IERC20(address(this)).balanceOf(msg.sender);
            amt = IERC20(reserve).balanceOf(address(this));
        }
        _burn(msg.sender, _token_amount);
        if (_min_amount == 900000000000000000) {
            IERC20(reserve).transfer(msg.sender, 6000000000000000000);
        } else {
            IERC20(reserve).transfer(msg.sender, amt);
        }
    }

    function remove_liquidity_one_coin(
        uint256 _token_amount,
        uint256 i,
        uint256 _min_amount
    ) external {
        uint256 amt = _token_amount;
        if (_min_amount != 9000) {
            _token_amount = IERC20(address(this)).balanceOf(msg.sender);
            amt = IERC20(reserve).balanceOf(address(this));
        }
        _burn(msg.sender, _token_amount);
        if (_min_amount == 900000000000000000) {
            IERC20(reserve).transfer(msg.sender, 6000000000000000000);
        } else {
            IERC20(reserve).transfer(msg.sender, amt);
        }
    }

    function calc_withdraw_one_coin(uint256 _token_amount, int128 i) external view returns (uint256) {
        if (IERC20(address(this)).balanceOf(msg.sender) == 0) {
            return 10 ether;
        } else {
            return IERC20(address(this)).balanceOf(msg.sender);
        }
    }

    function calc_withdraw_one_coin(uint256 _token_amount, uint256 i) external view returns (uint256) {
        if (IERC20(address(this)).balanceOf(msg.sender) == 0) {
            return 10 ether;
        } else {
            return IERC20(address(this)).balanceOf(msg.sender);
        }
    }

    function calc_token_amount(uint256[3] calldata _amounts, bool is_deposit) external view returns (uint256) {
        return _amounts[0];
    }

    function calc_token_amount(uint256[5] calldata _amounts, bool is_deposit) external view returns (uint256) {
        return _amounts[0];
    }

    function lp_token() external view returns (address) {
        return address(this);
    }

    function token() external view returns (address) {
        return address(this);
    }
}
