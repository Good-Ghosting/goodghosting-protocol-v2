pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ICurvePool is IERC20 {
    /**
    @param _amounts deposit amounts.
    @param _min_mint_amount min amount based on slippage.
    @param _use_underlying flag that indicates if underlying token is deposited.
    */
    function add_liquidity(
        uint256[3] calldata _amounts,
        uint256 _min_mint_amount,
        bool _use_underlying
    ) external returns (uint256);

    /**
    @param _amounts deposit amounts.
    @param _min_mint_amount min amount based on slippage.
    @param _use_underlying flag that indicates if underlying token is deposited.
    */
    function add_liquidity(
        uint256[5] calldata _amounts,
        uint256 _min_mint_amount,
        bool _use_underlying
    ) external returns (uint256);

    /**
    @param _amounts deposit amounts.
    @param _min_mint_amount min amount based on slippage.
    */
    function add_liquidity(uint256[3] calldata _amounts, uint256 _min_mint_amount) external;

    /**
    @param _amounts deposit amounts.
    @param _min_mint_amount min amount based on slippage.
    */
    function add_liquidity(uint256[5] calldata _amounts, uint256 _min_mint_amount) external;

    /**
    @param _amounts deposit amounts.
    @param _min_mint_amount min amount based on slippage.
    */
    function add_liquidity(uint256[2] calldata _amounts, uint256 _min_mint_amount) external;

    /**
    @param _token_amount token amount to be removed.
    @param i token index.
    @param _min_amount min amount based on slippage.
    @param _use_underlying flag that indicates if underlying token is deposited.
    */
    function remove_liquidity_one_coin(
        uint256 _token_amount,
        int128 i,
        uint256 _min_amount,
        bool _use_underlying
    ) external returns (uint256);

    /**
    @param _token_amount token amount to be removed.
    @param i token index.
    @param _min_amount min amount based on slippage.
    
    */
    function remove_liquidity_one_coin(uint256 _token_amount, int128 i, uint256 _min_amount) external returns (uint256);

    /**
    @param _token_amount token amount to be removed.
    @param i token index.
    @param _min_amount min amount based on slippage.
    */
    function remove_liquidity_one_coin(uint256 _token_amount, uint256 i, uint256 _min_amount) external;

    function lp_token() external view returns (address);

    function token() external view returns (address);

    function fee() external view returns (uint256);

    function pool() external view returns (address);

    /**
    @param _token_amount token amount to be removed.
    @param i token index.
    */
    function calc_withdraw_one_coin(uint256 _token_amount, int128 i) external view returns (uint256);

    /**
    @param token_amount token amount to be removed.
    @param i token index.
    */
    function calc_withdraw_one_coin(uint256 token_amount, uint256 i) external view returns (uint256);

    /**
    @param _amounts deposit amounts.
    @param is_deposit flag that indicates if a deposit is being made.
    */
    function calc_token_amount(uint256[3] calldata _amounts, bool is_deposit) external view returns (uint256);

    /**
    @param _amounts deposit amounts.
    @param is_deposit flag that indicates if a deposit is being made.
    */
    function calc_token_amount(uint256[5] calldata _amounts, bool is_deposit) external view returns (uint256);

    function calc_token_amount(uint256[2] calldata _amounts) external view returns (uint256);

    function underlying_coins(uint256 arg0) external view returns (address);

    function coins(uint256 arg0) external view returns (address);
}
