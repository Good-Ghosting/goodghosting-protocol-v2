// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ILendingPoolAddressesProvider } from "../aave/ILendingPoolAddressesProvider.sol";
import { IPoolAddressesProvider } from "../aaveV3/IPoolAddressesProvider.sol";
import { ILendingPool } from "../aave/ILendingPool.sol";
import { ILendingPoolV3 } from "../aaveV3/ILendingPoolV3.sol";

import "../aave/IWETHGateway.sol";

contract LendingPoolAddressesProviderMock is
    ILendingPoolAddressesProvider,
    IPoolAddressesProvider,
    ILendingPool,
    ILendingPoolV3,
    IWETHGateway,
    ERC20
{
    address public underlyingAssetAddress;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    /// ILendingPoolAddressesProvider interface
    function getAddress(bytes32 id) public view override returns (address) {
        return address(this);
    }

    function getLendingPool() public view override returns (address) {
        return address(this);
    }

    function getPool() external view override returns (address) {
        return address(this);
    }

    function setLendingPoolImpl(address _pool) public override {}

    function getLendingPoolCore() public view override returns (address payable) {
        return payable(address(this)); // cast to make it payable
    }

    function getReserveTokensAddresses(address asset) public view returns (address, address, address) {
        return (address(this), address(this), address(this));
    }

    function UNDERLYING_ASSET_ADDRESS() external view returns (address) {
        return underlyingAssetAddress;
    }

    function setLendingPoolCoreImpl(address _lendingPoolCore) public override {}

    function getLendingPoolConfigurator() public view override returns (address) {}

    function setLendingPoolConfiguratorImpl(address _configurator) public override {}

    function getLendingPoolDataProvider() public view override returns (address) {}

    function setLendingPoolDataProviderImpl(address _provider) public override {}

    function getLendingPoolParametersProvider() public view override returns (address) {}

    function setLendingPoolParametersProviderImpl(address _parametersProvider) public override {}

    function getTokenDistributor() public view override returns (address) {}

    function setTokenDistributor(address _tokenDistributor) public override {}

    function getFeeProvider() public view override returns (address) {}

    function setFeeProviderImpl(address _feeProvider) public override {}

    function getLendingPoolLiquidationManager() public view override returns (address) {}

    function setLendingPoolLiquidationManager(address _manager) public override {}

    function getLendingPoolManager() public view override returns (address) {}

    function setLendingPoolManager(address _lendingPoolManager) public override {}

    function getPriceOracle() public view override returns (address) {}

    function setPriceOracle(address _priceOracle) public override {}

    function getLendingRateOracle() public view override returns (address) {}

    function setLendingRateOracle(address _lendingRateOracle) public override {}

    /// ILendingPool interface
    function deposit(address _reserve, uint256 _amount, address onBehalfOf, uint16 _referralCode) public override {
        IERC20 reserve = IERC20(_reserve);
        reserve.transferFrom(msg.sender, address(this), _amount);
        _mint(msg.sender, _amount);
    }

    function supply(address _reserve, uint256 _amount, address onBehalfOf, uint16 _referralCode) public override {
        IERC20 reserve = IERC20(_reserve);
        reserve.transferFrom(msg.sender, address(this), _amount);
        _mint(msg.sender, _amount);
    }

    function withdraw(address asset, uint256 amount, address to) public override(ILendingPool, ILendingPoolV3) {
        if (amount > IERC20(address(this)).balanceOf(msg.sender)) {
            amount = IERC20(address(this)).balanceOf(msg.sender);
        }
        _burn(to, amount);
        IERC20(asset).transfer(to, amount);
    }

    function depositETH(address lendingPool, address onBehalfOf, uint16 referralCode) public payable override {
        _mint(msg.sender, msg.value);
    }

    function withdrawETH(address asset, uint256 amount, address to) public override {
        if (amount > IERC20(address(this)).balanceOf(msg.sender)) {
            amount = IERC20(address(this)).balanceOf(msg.sender);
        }
        _burn(to, amount);
        msg.sender.call{ value: amount }("");
    }

    //Helpers
    //We need to bootstrap the underlyingAssetAddress to use the redeem function
    function setUnderlyingAssetAddress(address _addr) public {
        underlyingAssetAddress = _addr;
    }

    //We need to bootstrap the pool with liquidity to pay interest
    function addLiquidity(address _reserve, address _bank, address _addr, uint256 _amount) public {
        IERC20 reserve = IERC20(_reserve);
        reserve.transferFrom(_addr, address(this), _amount);
        _mint(_bank, _amount);
    }

    // Fallback Functions for calldata and reciever for handling only ether transfer
    receive() external payable {}
}
