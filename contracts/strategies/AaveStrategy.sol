pragma solidity >=0.6.11;

import "../aave/ILendingPoolAddressesProvider.sol";
import "../aave/ILendingPool.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../aave/AToken.sol";
import "../aave/IncentiveController.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../libraries/LowGasSafeMath.sol";
import "./IStrategy.sol";

contract AaveStrategy is Ownable, IStrategy {
    using LowGasSafeMath for uint256;

    /// @notice Address of the Aave V2 incentive controller contract
    IncentiveController public immutable incentiveController;

    /// @notice Address of the interest bearing token received when funds are transferred to the external pool
    AToken public immutable adaiToken;

    /// @notice Which Aave instance we use to swap DAI to interest bearing aDAI
    ILendingPoolAddressesProvider public immutable lendingPoolAddressProvider;

    /// @notice Lending pool address
    ILendingPool public immutable lendingPool;

    /// @notice AaveProtocolDataProvider address
    AaveProtocolDataProvider public immutable dataProvider;

    /// @notice wmatic in case of polygon deployment else address(0)
    IERC20 public immutable rewardToken;

    constructor(
        ILendingPoolAddressesProvider _lendingPoolAddressProvider,
        address _dataProvider,
        address _incentiveController,
        IERC20 _rewardToken
    ) {
        require(address(_lendingPoolAddressProvider) != address(0), "invalid _lendingPoolAddressProvider address");
        require(address(_dataProvider) != address(0), "invalid _dataProvider address");
        lendingPoolAddressProvider = _lendingPoolAddressProvider;
        // address(0) for non-polygon deployment
        incentiveController = IncentiveController(_incentiveController);
        dataProvider = AaveProtocolDataProvider(_dataProvider);
        // lending pool needs to be approved in v2 since it is the core contract in v2 and not lending pool core
        lendingPool = ILendingPool(_lendingPoolAddressProvider.getLendingPool());
        // wmatic in case of polygon and address(0) for non-polygon deployment
        rewardToken = _rewardToken;
    }

    function invest(
        IERC20 _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount
    ) external override onlyOwner {
        require(address(_inboundCurrency) != address(0), "invalid token address");
        require(_amount > 0, "amount < 0");
        require(_inboundCurrency.approve(address(lendingPool), _amount), "Fail to approve allowance to lending pool");
        lendingPool.deposit(address(_inboundCurrency), _amount, address(this), 155);
    }

    function earlyWithdraw(
        IERC20 _inboundCurrency,
        address _game,
        uint256 _amount
    ) external override onlyOwner {
        require(_amount > 0, "_amount is 0");
        require(address(_inboundCurrency) != address(0), "Invalid _inboundCurrency address");
        require(_game != address(0), "Invalid _game address");
        // atoken address in v2 is fetched from data provider contract
        (address adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(address(_inboundCurrency));
        adaiToken = AToken(adaiTokenAddress);
        if (adaiToken.balanceOf(address(this)) > 0) {
            lendingPool.withdraw(address(_inboundCurrency), _amount, address(this));
            require(_inboundCurrency.transfer(_game, _inboundCurrency.balanceOf(address(this))), "Transfer Failed");
        }
    }

    function redeem(IERC20 _inboundCurrency, address _game) external override onlyOwner {
        require(address(_inboundCurrency) != address(0), "Invalid _inboundCurrency address");
        require(_game != address(0), "Invalid _game address");

        // atoken address in v2 is fetched from data provider contract
        (address adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(address(_inboundCurrency));
        adaiToken = AToken(adaiTokenAddress);
        // Withdraws funds (principal + interest + rewards) from external pool
        if (adaiToken.balanceOf(address(this)) > 0) {
            lendingPool.withdraw(address(_inboundCurrency), type(uint256).max, address(this));
            // Claims the rewards from the external pool
            address[] memory assets = new address[](1);
            assets[0] = address(adaiToken);

            if (address(rewardToken) != address(0)) {
                uint256 claimableRewards = incentiveController.getRewardsBalance(assets, address(this));
                // moola the celo version of aave does not have the incentive controller logic
                if (claimableRewards > 0) {
                    incentiveController.claimRewards(assets, claimableRewards, address(this));
                }
                // moola the celo version of aave does not have the incentive controller logic
                if (rewardToken.balanceOf(address(this)) > 0) {
                    require(
                        rewardToken.transfer(address(_game), rewardToken.balanceOf(address(this))),
                        "Transfer Failed"
                    );
                }
            }
        }

        require(_inboundCurrency.transfer(_game, _inboundCurrency.balanceOf(address(this))), "Transfer Failed");
    }

    function getRewardToken() external view override returns (IERC20) {
        return rewardToken;
    }

    function getGovernanceToken() external pure override returns (IERC20) {
        return IERC20(address(0));
    }
}
