// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./strategies/IStrategy.sol";

/// @title GoodGhosting V2 Contract
/// @notice Used for games deployed on a EVM Network
contract Pool is Ownable, Pausable {
    // using for better readability
    using SafeMath for uint256;

    /// @notice Multiplier used for calculating playerIndex to avoid precision issues
    uint256 public constant MULTIPLIER = 10**5;

    /// @notice Stores the total amount of net interest received in the game.
    uint256 public totalGameInterest;

    /// @notice total principal amount
    uint256 public totalGamePrincipal;

    /// @notice performance fee amount allocated to the admin
    uint256 public adminFeeAmount;

    /// @notice player index sum
    uint256 public sum;

    /// @notice total amount of incentive tokens to be distributed among winners
    uint256 public totalIncentiveAmount = 0;

    /// @notice Controls the amount of active players in the game (ignores players that early withdraw)
    uint256 public activePlayersCount = 0;

    /// @notice winner counter to track no of winners
    uint256 public winnerCount = 0;

    /// @notice The amount to be paid on each segment
    uint256 public segmentPayment;

    /// @notice The number of segments in the game (segment count)
    uint256 public immutable lastSegment;

    /// @notice When the game started (deployed timestamp)
    uint256 public immutable firstSegmentStart;

    uint256 public immutable waitingRoundSegmentStart;

    /// @notice The time duration (in seconds) of each segment
    uint256 public immutable segmentLength;

    /// @notice The time duration (in seconds) of each segment
    uint256 public immutable waitingRoundSegmentLength;

    /// @notice The early withdrawal fee (percentage)
    uint128 public immutable earlyWithdrawalFee;

    /// @notice The performance admin fee (percentage)
    uint128 public immutable adminFee;

    /// @notice Defines the max quantity of players allowed in the game
    uint256 public immutable maxPlayersCount;

    /// @notice share % from impermanent loss
    uint256 public impermanentLossShare;

    /// @notice totalGovernancetoken balance
    uint256 strategyGovernanceTokenAmount = 0;

    /// @notice total rewardTokenAmount balance
    uint256 rewardTokenAmount = 0;

    /// @notice Controls if tokens were redeemed or not from the pool
    bool public redeemed;

    /// @notice Flag which determines whether the segment payment is fixed or not
    bool public immutable flexibleSegmentPayment;

    /// @notice controls if admin withdrew or not the performance fee.
    bool public adminWithdraw;

    /// @notice Ownership Control flag
    bool public allowRenouncingOwnership = false;

    /// @notice Strategy Contract Address
    IStrategy public immutable strategy;

    /// @notice Address of the token used for depositing into the game by players
    IERC20 public immutable inboundToken;

    /// @notice Defines an optional token address used to provide additional incentives to users. Accepts "0x0" adresses when no incentive token exists.
    IERC20 public immutable incentiveToken;

    /// @notice address of additional reward token accured from investing via different strategies like wmatic
    IERC20 public rewardToken;

    /// @notice address of strategyGovernanceToken accured from investing via different strategies like curve
    IERC20 public strategyGovernanceToken;

    struct Player {
        bool withdrawn;
        bool canRejoin;
        bool isWinner;
        address addr;
        uint256 mostRecentSegmentPaid;
        uint256 amountPaid;
    }

    /// @notice Stores info about the players in the game
    mapping(address => Player) public players;

    mapping(address => mapping(uint256 => uint256)) public playerIndex;

    /// @notice list of players
    address[] public iterablePlayers;

    event JoinedGame(address indexed player, uint256 amount);

    event Deposit(address indexed player, uint256 indexed segment, uint256 amount);

    event Withdrawal(
        address indexed player,
        uint256 amount,
        uint256 playerIncentive,
        uint256 playerRewardAAmount,
        uint256 playerGovernanceRewardAmount
    );

    event FundsRedeemedFromExternalPool(
        uint256 totalAmount,
        uint256 totalGamePrincipal,
        uint256 totalGameInterest,
        uint256 totalIncentiveAmount,
        uint256 totalRewardAAmount,
        uint256 totalGovernanceRewardAmount
    );

    event EarlyWithdrawal(address indexed player, uint256 amount, uint256 totalGamePrincipal);

    event AdminWithdrawal(
        address indexed admin,
        uint256 totalGameInterest,
        uint256 adminFeeAmount,
        uint256 adminIncentiveAmount,
        uint256 adminRewardAAmount,
        uint256 adminGovernanceRewardAmount
    );

    modifier whenGameIsCompleted() {
        require(isGameCompleted(), "Game is not completed");
        _;
    }

    modifier whenGameIsNotCompleted() {
        require(!isGameCompleted(), "Game is already completed");
        _;
    }

    /**
        Creates a new instance of GoodGhosting game
        @param _inboundCurrency Smart contract address of inbound currency used for the game.
        @param _segmentCount Number of segments in the game.
        @param _segmentLength Lenght of each segment, in seconds (i.e., 180 (sec) => 3 minutes).
        @param _waitingRoundSegmentLength Lenght of waiting round segment, in seconds (i.e., 180 (sec) => 3 minutes).
        @param _segmentPayment Amount of tokens each player needs to contribute per segment
        @param _earlyWithdrawalFee Fee paid by users on early withdrawals (before the game completes). Used as an integer percentage (i.e., 10 represents 10%).
        @param _customFee performance fee charged by admin. Used as an integer percentage (i.e., 10 represents 10%). Does not accept "decimal" fees like "0.5".
        @param _maxPlayersCount max quantity of players allowed to join the game
        @param _incentiveToken optional token address used to provide additional incentives to users. Accepts "0x0" adresses when no incentive token exists.
     */
    constructor(
        IERC20 _inboundCurrency,
        uint256 _segmentCount,
        uint256 _segmentLength,
        uint256 _waitingRoundSegmentLength,
        uint256 _segmentPayment,
        uint128 _earlyWithdrawalFee,
        uint128 _customFee,
        uint256 _maxPlayersCount,
        bool _flexibleSegmentPayment,
        IERC20 _incentiveToken,
        IStrategy _strategy
    ) {
        flexibleSegmentPayment = _flexibleSegmentPayment;
        require(_customFee <= 20, "_customFee must be less than or equal to 20%");
        require(_earlyWithdrawalFee <= 10, "_earlyWithdrawalFee must be less than or equal to 10%");
        require(_earlyWithdrawalFee > 0, "_earlyWithdrawalFee must be greater than zero");
        require(_maxPlayersCount > 0, "_maxPlayersCount must be greater than zero");
        require(address(_inboundCurrency) != address(0), "invalid _inboundCurrency address");
        require(address(_strategy) != address(0), "invalid _strategy address");
        require(_segmentCount > 0, "_segmentCount must be greater than zero");
        require(_segmentLength > 0, "_segmentLength must be greater than zero");
        require(_segmentPayment > 0, "_segmentPayment must be greater than zero");
        require(_waitingRoundSegmentLength > 0, "_waitingRoundSegmentLength must be greater than zero");

        // Initializes default variables
        firstSegmentStart = block.timestamp; //gets current time
        waitingRoundSegmentStart = block.timestamp + (_segmentLength * _segmentCount);
        lastSegment = _segmentCount;
        segmentLength = _segmentLength;
        waitingRoundSegmentLength = _waitingRoundSegmentLength;
        segmentPayment = _segmentPayment;
        earlyWithdrawalFee = _earlyWithdrawalFee;
        adminFee = _customFee;
        inboundToken = _inboundCurrency;
        strategy = _strategy;
        maxPlayersCount = _maxPlayersCount;
        incentiveToken = _incentiveToken;
    }

    /// @notice pauses the game. This function can be called only by the contract's admin.
    function pause() external onlyOwner whenNotPaused {
        _pause();
    }

    /// @notice unpauses the game. This function can be called only by the contract's admin.
    function unpause() external onlyOwner whenPaused {
        _unpause();
    }

    /// @notice Unlocks renounceOwnership.
    function unlockRenounceOwnership() external onlyOwner {
        allowRenouncingOwnership = true;
    }

    /// @notice Renounces Ownership.
    function renounceOwnership() public override onlyOwner {
        require(allowRenouncingOwnership, "Not allowed");
        super.renounceOwnership();
    }

    /// @notice Allows the admin to withdraw the performance fee, if applicable. This function can be called only by the contract's admin.
    /// @dev Cannot be called before the game ends.
    function adminFeeWithdraw() external virtual onlyOwner whenGameIsCompleted {
        require(redeemed, "Funds not redeemed from external pool");
        require(!adminWithdraw, "Admin has already withdrawn");
        adminWithdraw = true;

        // when there are no winners, admin will be able to withdraw the
        // additional incentives sent to the pool, avoiding locking the funds.
        uint256 adminIncentiveAmount = 0;
        uint256 adminRewardTokenAmount = 0;
        uint256 adminGovernanceTokenAmount = 0;

        if (adminFeeAmount > 0) {
            require(IERC20(inboundToken).transfer(owner(), adminFeeAmount), "Fail to transfer ER20 tokens to admin");
        }

        if (winnerCount == 0) {
            if (totalIncentiveAmount > 0) {
                adminIncentiveAmount = totalIncentiveAmount;
                require(
                    IERC20(incentiveToken).transfer(owner(), adminIncentiveAmount),
                    "Fail to transfer ER20 incentive tokens to admin"
                );
            }

            if (address(rewardToken) != address(0) && rewardToken.balanceOf(address(this)) > 0) {
                adminRewardTokenAmount = rewardToken.balanceOf(address(this));
                require(
                    rewardToken.transfer(owner(), rewardToken.balanceOf(address(this))),
                    "Fail to transfer ER20 reward tokens to admin"
                );
            }

            if (
                address(strategyGovernanceToken) != address(0) && strategyGovernanceToken.balanceOf(address(this)) > 0
            ) {
                adminGovernanceTokenAmount = strategyGovernanceToken.balanceOf(address(this));
                require(
                    strategyGovernanceToken.transfer(owner(), strategyGovernanceToken.balanceOf(address(this))),
                    "Fail to transfer ER20 strategy governance tokens to admin"
                );
            }
        }
        // emitting it here since to avoid duplication made the if block common for incentive and reward tokens
        emit AdminWithdrawal(
            owner(),
            totalGameInterest,
            adminFeeAmount,
            adminIncentiveAmount,
            adminRewardTokenAmount,
            adminGovernanceTokenAmount
        );
    }

    /// @notice Calculates the current segment of the game.
    /// @return current game segment
    function getCurrentSegment() public view returns (uint256) {
        uint256 currentSegment;
        if (
            waitingRoundSegmentStart <= block.timestamp &&
            block.timestamp <= (waitingRoundSegmentStart.add(waitingRoundSegmentLength))
        ) {
            uint256 waitingRoundSegment = block.timestamp.sub(waitingRoundSegmentStart).div(waitingRoundSegmentLength);
            currentSegment = lastSegment.add(waitingRoundSegment);
        } else {
            currentSegment = block.timestamp.sub(firstSegmentStart).div(segmentLength);
        }
        return currentSegment;
    }

    /// @notice Checks if the game is completed or not.
    /// @return "true" if completeted; otherwise, "false".
    function isGameCompleted() public view returns (bool) {
        // Game is completed when the current segment is greater than "lastSegment" of the game.
        return getCurrentSegment() > lastSegment;
    }

    /// @notice gets the number of players in the game
    /// @return number of players
    function getNumberOfPlayers() external view returns (uint256) {
        return iterablePlayers.length;
    }

    /// @notice Allows a player to join the game
    function joinGame(uint256 _minAmount, uint256 _depositAmount) external virtual whenNotPaused {
        _joinGame(_minAmount, _depositAmount);
    }

    /// @notice Allows a player to join the game and controls
    function _joinGame(uint256 _minAmount, uint256 _depositAmount) internal virtual {
        require(getCurrentSegment() == 0, "Game has already started");
        require(
            players[msg.sender].addr != msg.sender || players[msg.sender].canRejoin,
            "Cannot join the game more than once"
        );

        activePlayersCount = activePlayersCount.add(1);
        require(activePlayersCount <= maxPlayersCount, "Reached max quantity of players allowed");

        bool canRejoin = players[msg.sender].canRejoin;
        Player memory newPlayer = Player({
            addr: msg.sender,
            mostRecentSegmentPaid: 0,
            amountPaid: 0,
            withdrawn: false,
            canRejoin: false,
            isWinner: false
        });
        players[msg.sender] = newPlayer;
        if (!canRejoin) {
            iterablePlayers.push(msg.sender);
        }
        if (flexibleSegmentPayment) {
            segmentPayment = _depositAmount;
        }
        emit JoinedGame(msg.sender, segmentPayment);
        _transferInboundTokenToContract(_minAmount, _depositAmount);
    }

    /// @notice Allows a player to withdraws funds before the game ends. An early withdrawl fee is charged.
    /// @dev Cannot be called after the game is completed.
    function earlyWithdraw(uint256 _minAmount) external whenNotPaused whenGameIsNotCompleted {
        Player storage player = players[msg.sender];
        require(player.amountPaid > 0, "Player does not exist");
        require(!player.withdrawn, "Player has already withdrawn");
        player.withdrawn = true;
        activePlayersCount = activePlayersCount.sub(1);

        // In an early withdraw, users get their principal minus the earlyWithdrawalFee % defined in the constructor.
        uint256 withdrawAmount = player.amountPaid.sub(player.amountPaid.mul(earlyWithdrawalFee).div(uint256(100)));
        // Decreases the totalGamePrincipal on earlyWithdraw
        totalGamePrincipal = totalGamePrincipal.sub(player.amountPaid);
        uint256 currentSegment = getCurrentSegment();

        // Users that early withdraw during the first segment, are allowed to rejoin.
        if (currentSegment == 0) {
            player.canRejoin = true;
            playerIndex[msg.sender][currentSegment] = 0;
        }

        if (winnerCount > 0 && player.isWinner) {
            winnerCount = winnerCount.sub(uint256(1));
            player.isWinner = false;
            for (uint256 i = 0; i <= players[msg.sender].mostRecentSegmentPaid; i++) {
                sum = sum.sub(playerIndex[msg.sender][i]);
            }
        }

        emit EarlyWithdrawal(msg.sender, withdrawAmount, totalGamePrincipal);
        strategy.earlyWithdraw(inboundToken, withdrawAmount, _minAmount);
        if (inboundToken.balanceOf(address(this)) < withdrawAmount) {
            withdrawAmount = inboundToken.balanceOf(address(this));
        }
        require(
            IERC20(inboundToken).transfer(msg.sender, withdrawAmount),
            "Fail to transfer ERC20 tokens on early withdraw"
        );
    }

    /// @notice Allows player to withdraw their funds after the game ends with no loss (fee). Winners get a share of the interest earned.
    function withdraw(uint256 _minAmount) external virtual {
        Player storage player = players[msg.sender];
        require(player.amountPaid > 0, "Player does not exist");
        require(!player.withdrawn, "Player has already withdrawn");
        player.withdrawn = true;

        // First player to withdraw redeems everyone's funds
        if (!redeemed) {
            redeemFromExternalPool(_minAmount);
        }

        uint256 payout = player.amountPaid;
        uint256 playerIncentive = 0;
        uint256 playerReward = 0;
        uint256 playerGovernanceTokenReward = 0;

        if (player.isWinner) {
            // Player is a winner and gets a bonus!
            // the player share of interest is calculated from player index
            // player share % = playerIndex / sum of player indexes of all winners * 100
            // so, interest share = player share % * total game interest
            if (impermanentLossShare > 0) {
                // new payput in case of impermanent loss
                payout = player.amountPaid.mul(impermanentLossShare).div(uint256(100));
            } else {
                // Player is a winner and gets a bonus!
                uint256 cumulativePlayerIndex = 0;
                for (uint256 i = 0; i <= players[msg.sender].mostRecentSegmentPaid; i++) {
                    cumulativePlayerIndex = cumulativePlayerIndex.add(playerIndex[msg.sender][i]);
                }

                uint256 playerShare = cumulativePlayerIndex.mul(100).div(sum);
                playerShare = totalGameInterest.mul(playerShare).div(uint256(100));
                payout = payout.add(playerShare);
            }

            // If there's additional incentives, distributes them to winners
            if (totalIncentiveAmount > 0) {
                playerIncentive = totalIncentiveAmount.div(winnerCount);
            }
            if (address(rewardToken) != address(0) && rewardTokenAmount > 0) {
                playerReward = rewardTokenAmount.div(winnerCount);
            }

            if (address(strategyGovernanceToken) != address(0) && strategyGovernanceTokenAmount > 0) {
                playerGovernanceTokenReward = strategyGovernanceTokenAmount.div(winnerCount);
            }
        }

        emit Withdrawal(msg.sender, payout, playerIncentive, playerReward, playerGovernanceTokenReward);

        require(IERC20(inboundToken).transfer(msg.sender, payout), "Fail to transfer ERC20 tokens on withdraw");

        if (playerIncentive > 0) {
            require(
                IERC20(incentiveToken).transfer(msg.sender, playerIncentive),
                "Fail to transfer ERC20 incentive tokens on withdraw"
            );
        }

        if (playerReward > 0) {
            require(
                IERC20(rewardToken).transfer(msg.sender, playerReward),
                "Fail to transfer ERC20 reward tokens on withdraw"
            );
        }

        if (playerGovernanceTokenReward > 0) {
            require(
                IERC20(strategyGovernanceToken).transfer(msg.sender, playerGovernanceTokenReward),
                "Fail to transfer ERC20 strategy governance on withdraw"
            );
        }
    }

    /// @notice Allows players to make deposits for the game segments, after joining the game.
    function makeDeposit(uint256 _minAmount, uint256 _depositAmount) external whenNotPaused {
        require(!players[msg.sender].withdrawn, "Player already withdraw from game");
        // only registered players can deposit
        require(players[msg.sender].addr == msg.sender, "Sender is not a player");

        uint256 currentSegment = getCurrentSegment();
        // User can only deposit between segment 1 and segment n-1 (where n is the number of segments for the game).
        // Details:
        // Segment 0 is paid when user joins the game (the first deposit window).
        // Last segment doesn't accept payments, because the payment window for the last
        // segment happens on segment n-1 (penultimate segment).
        // Any segment greater than the last segment means the game is completed, and cannot
        // receive payments
        require(
            currentSegment > 0 && currentSegment < lastSegment,
            "Deposit available only between segment 1 and segment n-1 (penultimate)"
        );

        //check if current segment is currently unpaid
        require(players[msg.sender].mostRecentSegmentPaid != currentSegment, "Player already paid current segment");

        // check if player has made payments up to the previous segment
        require(
            players[msg.sender].mostRecentSegmentPaid == currentSegment.sub(1),
            "Player didn't pay the previous segment - game over!"
        );

        if (flexibleSegmentPayment) {
            segmentPayment = _depositAmount;
        }
        emit Deposit(msg.sender, currentSegment, segmentPayment);
        _transferInboundTokenToContract(_minAmount, _depositAmount);
    }

    /// @notice Redeems funds from the external pool and updates the internal accounting controls related to the game stats.
    /// @dev Can only be called after the game is completed.
    function redeemFromExternalPool(uint256 _minAmount) public virtual whenGameIsCompleted {
        require(!redeemed, "Redeem operation already happened for the game");
        redeemed = true;
        // Withdraws funds (principal + interest + rewards) from external pool
        strategy.redeem(inboundToken, _minAmount);

        uint256 totalBalance = IERC20(inboundToken).balanceOf(address(this));

        // calculates gross interest
        uint256 grossInterest = 0;
        // Sanity check to avoid reverting due to overflow in the "subtraction" below.
        // This could only happen in case Aave changes the 1:1 ratio between
        // aToken vs. Token in the future
        if (totalBalance > totalGamePrincipal) {
            grossInterest = totalBalance.sub(totalGamePrincipal);
        } else {
            // handling impermanent loss case
            impermanentLossShare = (totalBalance.mul(uint256(100))).div(totalGamePrincipal);
            totalGamePrincipal = totalBalance;
        }

        // If there's an incentive token address defined, sets the total incentive amount to be distributed among winners.
        if (address(incentiveToken) != address(0)) {
            totalIncentiveAmount = IERC20(incentiveToken).balanceOf(address(this));
        }
        // calculates the performance/admin fee (takes a cut - the admin percentage fee - from the pool's interest).
        // calculates the "gameInterest" (net interest) that will be split among winners in the game
        uint256 _adminFeeAmount;
        if (adminFee > 0) {
            _adminFeeAmount = (grossInterest.mul(adminFee)).div(uint256(100));
            totalGameInterest = grossInterest.sub(_adminFeeAmount);
        } else {
            _adminFeeAmount = 0;
            totalGameInterest = grossInterest;
        }

        // when there's no winners, admin takes all the interest + rewards
        if (winnerCount == 0) {
            adminFeeAmount = grossInterest;
        } else {
            adminFeeAmount = _adminFeeAmount;
        }

        rewardToken = strategy.getRewardToken();
        strategyGovernanceToken = strategy.getGovernanceToken();

        if (address(rewardToken) != address(0)) {
            rewardTokenAmount = rewardToken.balanceOf(address(this));
        }

        if (address(strategyGovernanceToken) != address(0)) {
            strategyGovernanceTokenAmount = strategyGovernanceToken.balanceOf(address(this));
        }

        emit FundsRedeemedFromExternalPool(
            IERC20(inboundToken).balanceOf(address(this)),
            totalGamePrincipal,
            totalGameInterest,
            totalIncentiveAmount,
            rewardTokenAmount,
            strategyGovernanceTokenAmount
        );
    }

    /**
        @dev Manages the transfer of funds from the player to the contract, recording
        the required accounting operations to control the user's position in the pool.
     */
    function _transferInboundTokenToContract(uint256 _minAmount, uint256 _depositAmount) internal virtual {
        if (flexibleSegmentPayment) {
            segmentPayment = _depositAmount;
        }
        require(
            inboundToken.allowance(msg.sender, address(this)) >= segmentPayment,
            "You need to have allowance to do transfer Inbound Token on the smart contract"
        );

        uint256 currentSegment = getCurrentSegment();
        players[msg.sender].mostRecentSegmentPaid = currentSegment;

        players[msg.sender].amountPaid = players[msg.sender].amountPaid.add(segmentPayment);
        // PLAYER INDEX CALCULATION TO DETERMINE INTEREST SHARE
        // player index = prev. segment player index + segment amount deposited / time stamp of deposit
        uint256 currentSegmentplayerIndex = segmentPayment.mul(MULTIPLIER).div(block.timestamp);
        playerIndex[msg.sender][currentSegment] = currentSegmentplayerIndex;

        // check if this is deposit for the last segment. If yes, the player is a winner.
        // since both join game and deposit method call this method so having it here
        if (currentSegment == lastSegment.sub(1)) {
            // array indexes start from 0
            winnerCount = winnerCount.add(uint256(1));
            players[msg.sender].isWinner = true;
            for (uint256 i = 0; i <= players[msg.sender].mostRecentSegmentPaid; i++) {
                sum = sum.add(playerIndex[msg.sender][i]);
            }
        }
        totalGamePrincipal = totalGamePrincipal.add(segmentPayment);
        require(inboundToken.transferFrom(msg.sender, address(strategy), segmentPayment), "Transfer failed");
        strategy.invest(inboundToken, _minAmount);
    }
}
