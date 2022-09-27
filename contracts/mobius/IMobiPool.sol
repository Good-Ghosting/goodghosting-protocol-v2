pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMobiPool {

    /**
    @param amounts deposit amounts.
    @param minToMint min amount based on slippage.
    @param deadline timestamp value after this tx would revert.
    */
    function addLiquidity(
        uint256[] calldata amounts,
        uint256 minToMint,
        uint256 deadline
    ) external returns (uint256);

    /**
    @param tokenAmount token amount to be removed.
    @param tokenIndex token index of the pool.
    @param minAmount min amount based on slippage.
    @param deadline timestamp value after this tx would revert.
    */
    function removeLiquidityOneToken(
        uint256 tokenAmount,
        uint8 tokenIndex,
        uint256 minAmount,
        uint256 deadline
    ) external returns (uint256);

    function getLpToken() external view returns (address);

    /**
    @param account liquidity holder in the pool.
    @param amounts deposit amounts.
    @param deposit flag indicating a deposit.
    */
    function calculateTokenAmount(
        address account,
        uint256[] calldata amounts,
        bool deposit
    ) external view returns (uint256);

    /**
    @param account liquidity holder in the pool.
    @param tokenAmount oken amount to be removed.
    @param tokenIndex token index of the pool.
    */
    function calculateRemoveLiquidityOneToken(
        address account,
        uint256 tokenAmount,
        uint8 tokenIndex
    ) external view returns (uint256 availableTokenAmount);

    function getToken(uint8 index) external view returns (IERC20);
}
