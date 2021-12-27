pragma solidity ^0.8.7;

import "./IStrategy.sol";
import "../aave/ILendingPoolAddressesProvider.sol";
import "../aave/ILendingPool.sol";
import "../aave/AToken.sol";
import "../aave/IWETHGateway.sol";
import "../aave/IncentiveController.sol";
import "../polygon/WMatic.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AaveStrategy is Ownable, IStrategy {
    /// @notice Address of the Aave V2 incentive controller contract
    IncentiveController public immutable incentiveController;

    /// @notice Address of the Aave V2 weth gateway contract
    IWETHGateway public immutable wethGateway;

    /// @notice Address of the interest bearing token received when funds are transferred to the external pool
    AToken public adaiToken;

    /// @notice Which Aave instance we use to swap Inbound Token to interest bearing aDAI
    ILendingPoolAddressesProvider public immutable lendingPoolAddressProvider;

    /// @notice Lending pool address
    ILendingPool public immutable lendingPool;

    /// @notice AaveProtocolDataProvider address
    AaveProtocolDataProvider public immutable dataProvider;

    /// @notice reward token address for eg wmatic in case of polygon deployment
    IERC20 public immutable rewardToken;

    constructor(
        ILendingPoolAddressesProvider _lendingPoolAddressProvider,
        IWETHGateway _wethGateway,
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
        wethGateway = _wethGateway;
        // wmatic in case of polygon and address(0) for non-polygon deployment
        rewardToken = _rewardToken;
    }

    function invest(address _inboundCurrency, uint256 _minAmount) external payable override onlyOwner {
        uint256 contractBalance = 0;
        if (address(_inboundCurrency) == address(0) || _inboundCurrency == address(rewardToken)) {
            if (_inboundCurrency == address(rewardToken)) {
                // unwraps WMATIC back into MATIC
                WMatic(address(rewardToken)).withdraw(IERC20(_inboundCurrency).balanceOf(address(this)));
            }
            // Deposits MATIC into the pool
            wethGateway.depositETH{ value: address(this).balance }(address(lendingPool), address(this), 155);
        } else {
            contractBalance = IERC20(_inboundCurrency).balanceOf(address(this));
            require(
                IERC20(_inboundCurrency).approve(address(lendingPool), contractBalance),
                "Fail to approve allowance to lending pool"
            );
            lendingPool.deposit(_inboundCurrency, contractBalance, address(this), 155);
        }
    }

    function earlyWithdraw(
        address _inboundCurrency,
        uint256 _amount,
        uint256 _minAmount
    ) external override onlyOwner {
        require(_amount > 0, "_amount is 0");
        // atoken address in v2 is fetched from data provider contract
        (address adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(_inboundCurrency);
        adaiToken = AToken(adaiTokenAddress);
        if (adaiToken.balanceOf(address(this)) > 0) {
            if (address(_inboundCurrency) == address(0) || _inboundCurrency == address(rewardToken)) {
                require(adaiToken.approve(address(wethGateway), _amount), "Fail to approve allowance to wethGateway");

                wethGateway.withdrawETH(address(lendingPool), _amount, address(this));
                if (_inboundCurrency == address(rewardToken)) {
                    // Wraps MATIC back into WMATIC
                    WMatic(address(rewardToken)).deposit{ value: _amount }();
                }
            } else {
                lendingPool.withdraw(_inboundCurrency, _amount, address(this));
            }
        }
        if (address(_inboundCurrency) == address(0)) {
            (bool success, ) = msg.sender.call{ value: address(this).balance }("");
            require(success);
        } else {
            require(
                IERC20(_inboundCurrency).transfer(msg.sender, IERC20(_inboundCurrency).balanceOf(address(this))),
                "Transfer Failed"
            );
        }
    }

    function redeem(address _inboundCurrency, uint256 _minAmount) external override onlyOwner {
        require(_inboundCurrency != address(0), "Invalid _inboundCurrency address");

        // atoken address in v2 is fetched from data provider contract
        (address adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(_inboundCurrency);
        adaiToken = AToken(adaiTokenAddress);
        // Withdraws funds (principal + interest + rewards) from external pool
        if (adaiToken.balanceOf(address(this)) > 0) {
            if (address(_inboundCurrency) == address(0) || _inboundCurrency == address(rewardToken)) {
                require(
                    adaiToken.approve(address(wethGateway), type(uint256).max),
                    "Fail to approve allowance to wethGateway"
                );

                wethGateway.withdrawETH(address(lendingPool), type(uint256).max, address(this));
                if (_inboundCurrency == address(rewardToken)) {
                    // Wraps MATIC back into WMATIC
                    WMatic(address(rewardToken)).deposit{ value: address(this).balance }();
                }
            } else {
                lendingPool.withdraw(_inboundCurrency, type(uint256).max, address(this));
            }
        }
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
                require(rewardToken.transfer(msg.sender, rewardToken.balanceOf(address(this))), "Transfer Failed");
            }
        }

        if (address(_inboundCurrency) == address(0)) {
            (bool success, ) = msg.sender.call{ value: address(this).balance }("");
            require(success);
        } else {
            require(
                IERC20(_inboundCurrency).transfer(msg.sender, IERC20(_inboundCurrency).balanceOf(address(this))),
                "Transfer Failed"
            );
        }
    }

    function getRewardToken() external view override returns (IERC20) {
        return rewardToken;
    }

    function getGovernanceToken() external view override returns (IERC20) {
        return IERC20(address(0));
    }

    // Fallback Functions for calldata and reciever for handling only ether transfer
    receive() external payable {}
}
