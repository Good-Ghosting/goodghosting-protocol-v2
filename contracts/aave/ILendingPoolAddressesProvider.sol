// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.7;

abstract contract ILendingPoolAddressesProvider {
    function getLendingPool() public view virtual returns (address);

    function setLendingPoolImpl(address _pool) public virtual;

    function getAddress(bytes32 id) public view virtual returns (address);

    function getLendingPoolCore() public view virtual returns (address payable);

    function setLendingPoolCoreImpl(address _lendingPoolCore) public virtual;

    function getLendingPoolConfigurator() public view virtual returns (address);

    function setLendingPoolConfiguratorImpl(address _configurator) public virtual;

    function getLendingPoolDataProvider() public view virtual returns (address);

    function setLendingPoolDataProviderImpl(address _provider) public virtual;

    function getLendingPoolParametersProvider() public view virtual returns (address);

    function setLendingPoolParametersProviderImpl(address _parametersProvider) public virtual;

    function getTokenDistributor() public view virtual returns (address);

    function setTokenDistributor(address _tokenDistributor) public virtual;

    function getFeeProvider() public view virtual returns (address);

    function setFeeProviderImpl(address _feeProvider) public virtual;

    function getLendingPoolLiquidationManager() public view virtual returns (address);

    function setLendingPoolLiquidationManager(address _manager) public virtual;

    function getLendingPoolManager() public view virtual returns (address);

    function setLendingPoolManager(address _lendingPoolManager) public virtual;

    function getPriceOracle() public view virtual returns (address);

    function setPriceOracle(address _priceOracle) public virtual;

    function getLendingRateOracle() public view virtual returns (address);

    function setLendingRateOracle(address _lendingRateOracle) public virtual;
}
