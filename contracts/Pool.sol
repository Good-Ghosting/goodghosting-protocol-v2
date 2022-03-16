// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./strategies/IStrategy.sol";

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error GAME_NOT_COMPLETED();
error GAME_COMPLETED();
error FLEXIBLE_DEPOSIT_GAME();
error INVALID_CUSTOM_FEE();
error INVALID_EARLY_WITHDRAW_FEE();
error INVALID_MAX_PLAYER_COUNT();
error INVALID_INBOUND_TOKEN();
error INVALID_STRATEGY();
error INVALID_DEPOSIT_COUNT();
error INVALID_SEGMENT_LENGTH();
error INVALID_SEGMENT_PAYMENT();
error INVALID_WAITING_ROUND_SEGMENT_LENGTH();
error GAME_ALREADY_STARTED();
error PLAYER_ALREADY_JOINED();
error MAX_PLAYER_COUNT_REACHED();
error INVALID_TRANSACTIONAL_TOKEN_AMOUNT();
error RENOUNCE_OWNERSHIP_NOT_ALLOWED();
error FUNDS_NOT_REDEEMED_FROM_EXTERNAL_POOL();
error ADMIN_FEE_WITHDRAWN();
error TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();
error PLAYER_DOES_NOT_EXIST();
error PLAYER_ALREADY_WITHDREW_EARLY();
error PLAYER_ALREADY_WITHDREW();
error NOT_PLAYER();
error INVALID_FLEXIBLE_AMOUNT();
error DEPOSIT_NOT_ALLOWED();
error PLAYER_ALREADY_PAID_IN_CURRENT_SEGMENT();
error PLAYER_DID_NOT_PAID_PREVIOUS_SEGMENT();
error FUNDS_REDEEMED_FROM_EXTERNAL_POOL();
error INSUFFICIENT_ALLOWANCE();
error EARLY_EXIT_NOT_POSSIBLE();
error GAME_NOT_INITIALIZED();

/**
@title GoodGhosting V2 Contract
@notice Allows users to join a pool with a yield bearing strategy, the winners get interest and rewards, losers get their principal back.
*/
contract Pool is Ownable, Pausable {
    /// using for better readability.
    using SafeMath for uint256;

    /// @notice Multiplier used for calculating playerIndex to avoid precision issues.
    uint256 public constant MULTIPLIER = 10**8;

    /// @notice Maximum Flexible Deposit Amount in case of flexible pools.
    uint256 public immutable maxFlexibleSegmentPaymentAmount;

    /// @notice The time duration (in seconds) of each segment.
    uint256 public immutable segmentLength;

    /// @notice The time duration (in seconds) of each segment.
    uint256 public immutable waitingRoundSegmentLength;

    /// @notice The performance admin fee (percentage).
    uint128 public immutable adminFee;

    /// @notice Defines the max quantity of players allowed in the game.
    uint256 public immutable maxPlayersCount;

    /// @notice Address of the token used for depositing into the game by players.
    address public immutable inboundToken;

    /// @notice Flag which determines whether the segment payment is fixed or not.
    bool public immutable flexibleSegmentPayment;

    /// @notice Strategy Contract Address
    IStrategy public immutable strategy;

    /// @notice Flag which determines whether the deposit token is a transactional token like eth or matic.
    bool public immutable isTransactionalToken;

    /// @notice When the game started (deployed timestamp).
    uint256 public firstSegmentStart;

    /// @notice Timestamp when the waiting segment starts.
    uint256 public waitingRoundSegmentStart;

    /// @notice The number of segments in the game (segment count).
    uint256 public lastSegment;

    /// @notice The early withdrawal fee (percentage).
    uint128 public earlyWithdrawalFee;

    /// @notice Stores the total amount of net interest received in the game.
    uint256 public totalGameInterest;

    /// @notice total principal amount.
    uint256 public totalGamePrincipal;

    /// @notice performance fee amount allocated to the admin.
    uint256[3] public adminFeeAmount;

    /// @notice total amount of incentive tokens to be distributed among winners.
    uint256 public totalIncentiveAmount = 0;

    /// @notice Controls the amount of active players in the game (ignores players that early withdraw).
    uint256 public activePlayersCount = 0;

    /// @notice winner counter to track no of winners.
    uint256 public winnerCount = 0;

    /// @notice The amount to be paid on each segment.
    uint256 public segmentPayment;

    /// @notice share % from impermanent loss.
    uint256 public impermanentLossShare;

    /// @notice totalGovernancetoken balance.
    uint256 public strategyGovernanceTokenAmount = 0;

    /// @notice total rewardTokenAmount balance.
    uint256 public rewardTokenAmount = 0;

    /// @notice emaergency withdraw flag.
    bool public emergencyWithdraw = false;

    /// @notice Controls if tokens were redeemed or not from the pool.
    bool public redeemed;

    /// @notice Controls if reward tokens are to be claimed at the time of redeem.
    bool public disableRewardTokenClaim = false;

    /// @notice Controls if strategy governance tokens are to be claimed at the time of redeem.
    bool public disableStrategyGovernanceTokenClaim = false;

    /// @notice controls if admin withdrew or not the performance fee.
    bool public adminWithdraw;

    /// @notice Ownership Control flag.
    bool public allowRenouncingOwnership = false;

    /// @notice Defines an optional token address used to provide additional incentives to users. Accepts "0x0" adresses when no incentive token exists.
    IERC20 public incentiveToken;

    /// @notice address of additional reward token accured from investing via different strategies like wmatic.
    IERC20 public rewardToken;

    /// @notice address of strategyGovernanceToken accured from investing via different strategies like curve.
    IERC20 public strategyGovernanceToken;

    /// @notice struct for storing all player stats.
    struct Player {
        bool withdrawn;
        bool canRejoin;
        bool isWinner;
        address addr;
        uint256 mostRecentSegmentPaid;
        uint256 amountPaid;
        uint256 depositAmount;
    }

    /// @notice Stores info about the players in the game.
    mapping(address => Player) public players;

    /// @notice Stores info about the player index which is used to determine the share of interest of each winner.
    mapping(address => mapping(uint256 => uint256)) public playerIndex;

    /// @notice Stores info of the segment counter needed for ui as bbackup for graph.
    mapping(uint256 => uint256) public segmentCounter;

    /// @notice Stores info of cummalativePlayerIndexSum for each segment for early exit scenario.
    mapping(uint256 => uint256) public cummalativePlayerIndexSum;

    /// @notice list of players.
    address[] public iterablePlayers;

    //*********************************************************************//
    // ------------------------- events -------------------------- //
    //*********************************************************************//

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

    event VariablePoolParamsSet(
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

    //*********************************************************************//
    // ------------------------- modifiers -------------------------- //
    //*********************************************************************//

    modifier whenGameIsCompleted() {
        if (!isGameCompleted()) {
            revert GAME_NOT_COMPLETED();
        }
        _;
    }

    modifier whenGameIsNotCompleted() {
        if (isGameCompleted()) {
            revert GAME_COMPLETED();
        }
        _;
    }

    modifier whenGameIsInitialized() {
        if (firstSegmentStart == 0) {
            revert GAME_NOT_INITIALIZED();
        }
        _;
    }

    //*********************************************************************//
    // ------------------------- external views -------------------------- //
    //*********************************************************************//

    /// @dev Checks if the game is completed or not.
    /// @return "true" if completeted; otherwise, "false".
    function isGameCompleted() public view returns (bool) {
        // Game is completed when the current segment is greater than "lastSegment" of the game.
        return getCurrentSegment() > lastSegment || emergencyWithdraw;
    }

    /// @dev gets the number of players in the game.
    /// @return number of players.
    function getNumberOfPlayers() external view returns (uint256) {
        return iterablePlayers.length;
    }

    /// @dev Calculates the current segment of the game.
    /// @return current game segment.
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

    //*********************************************************************//
    // ------------------------- constructor -------------------------- //
    //*********************************************************************//

    /**
        Creates a new instance of GoodGhosting game
        @param _inboundCurrency Smart contract address of inbound currency used for the game.
        @param _maxFlexibleSegmentPaymentAmount Maximum Flexible Deposit Amount in case of flexible pools.
        @param _depositCount Number of segments in the game.
        @param _segmentLength Lenght of each segment, in seconds (i.e., 180 (sec) => 3 minutes).
        @param _waitingRoundSegmentLength Lenght of waiting round segment, in seconds (i.e., 180 (sec) => 3 minutes).
        @param _segmentPayment Amount of tokens each player needs to contribute per segment
        @param _earlyWithdrawalFee Fee paid by users on early withdrawals (before the game completes). Used as an integer percentage (i.e., 10 represents 10%).
        @param _customFee performance fee charged by admin. Used as an integer percentage (i.e., 10 represents 10%). Does not accept "decimal" fees like "0.5".
        @param _maxPlayersCount max quantity of players allowed to join the game
        @param _strategy investment strategy contract address.
        @param _isTransactionalToken isTransactionalToken flag.
     */
    constructor(
        address _inboundCurrency,
        uint256 _maxFlexibleSegmentPaymentAmount,
        uint256 _depositCount,
        uint256 _segmentLength,
        uint256 _waitingRoundSegmentLength,
        uint256 _segmentPayment,
        uint128 _earlyWithdrawalFee,
        uint128 _customFee,
        uint256 _maxPlayersCount,
        bool _flexibleSegmentPayment,
        IStrategy _strategy,
        bool _isTransactionalToken
    ) {
        flexibleSegmentPayment = _flexibleSegmentPayment;
        isTransactionalToken = _isTransactionalToken;
        if (_customFee > 100) {
            revert INVALID_CUSTOM_FEE();
        }
        if (_earlyWithdrawalFee > 100) {
            revert INVALID_EARLY_WITHDRAW_FEE();
        }
        if (_maxPlayersCount == 0) {
            revert INVALID_MAX_PLAYER_COUNT();
        }

        if (address(_inboundCurrency) == address(0) && !_isTransactionalToken) {
            revert INVALID_INBOUND_TOKEN();
        }
        if (address(_strategy) == address(0)) {
            revert INVALID_STRATEGY();
        }
        if (_depositCount == 0) {
            revert INVALID_DEPOSIT_COUNT();
        }
        if (_segmentLength == 0) {
            revert INVALID_SEGMENT_LENGTH();
        }
        if (!_flexibleSegmentPayment) {
            if (_segmentPayment == 0) {
                revert INVALID_SEGMENT_PAYMENT();
            }
        }
        if (_waitingRoundSegmentLength == 0) {
            revert INVALID_WAITING_ROUND_SEGMENT_LENGTH();
        }
        if (_waitingRoundSegmentLength < _segmentLength) {
            revert INVALID_WAITING_ROUND_SEGMENT_LENGTH();
        }

        // Initializes default variables
        lastSegment = _depositCount;
        segmentLength = _segmentLength;
        waitingRoundSegmentLength = _waitingRoundSegmentLength;
        segmentPayment = _segmentPayment;
        earlyWithdrawalFee = _earlyWithdrawalFee;
        adminFee = _customFee;
        inboundToken = _inboundCurrency;
        strategy = _strategy;
        maxPlayersCount = _maxPlayersCount;
        maxFlexibleSegmentPaymentAmount = _maxFlexibleSegmentPaymentAmount;
    }

    function initialize() external onlyOwner whenNotPaused {
       firstSegmentStart = block.timestamp; //gets current time
       waitingRoundSegmentStart = block.timestamp + (segmentLength * lastSegment);
    }

    //*********************************************************************//
    // ------------------------- internal methods -------------------------- //
    //*********************************************************************//

    /**
    @dev Initializes the player stats when they join..
    @param _minAmount Slippage based amount to cover for impermanent loss scenario.
    @param _depositAmount Variable Deposit Amount in case of a variable deposit pool.
    */
    function _joinGame(uint256 _minAmount, uint256 _depositAmount) internal virtual {
        if (getCurrentSegment() > 0) {
            revert GAME_ALREADY_STARTED();
        }
        if (players[msg.sender].addr == msg.sender && !players[msg.sender].canRejoin) {
            revert PLAYER_ALREADY_JOINED();
        }

        activePlayersCount = activePlayersCount.add(1);
        if (activePlayersCount > maxPlayersCount) {
            revert MAX_PLAYER_COUNT_REACHED();
        }

        bool canRejoin = players[msg.sender].canRejoin;
        if (flexibleSegmentPayment) {
            if (_depositAmount > maxFlexibleSegmentPaymentAmount) {
                revert INVALID_FLEXIBLE_AMOUNT();
            }
        }
        uint256 amount = flexibleSegmentPayment ? _depositAmount : segmentPayment;
        if (isTransactionalToken) {
            if (msg.value != amount) {
                revert INVALID_TRANSACTIONAL_TOKEN_AMOUNT();
            }
        }

        Player memory newPlayer = Player({
            addr: msg.sender,
            mostRecentSegmentPaid: 0,
            amountPaid: 0,
            withdrawn: false,
            canRejoin: false,
            isWinner: false,
            depositAmount: amount
        });
        players[msg.sender] = newPlayer;
        if (!canRejoin) {
            iterablePlayers.push(msg.sender);
        }

        emit JoinedGame(msg.sender, amount);
        _transferInboundTokenToContract(_minAmount, amount);
    }

    /**
        @dev Manages the transfer of funds from the player to the specific strategy used for the game/pool and updates the player index 
             which determines the interest and reward share of the winner based on the deposit amount amount and the time they deposit in a particular segment.
        @param _minAmount Slippage based amount to cover for impermanent loss scenario.
        @param _depositAmount Variable Deposit Amount in case of a variable deposit pool.
     */
    function _transferInboundTokenToContract(uint256 _minAmount, uint256 _depositAmount) internal virtual {
        if (!isTransactionalToken) {
            if (IERC20(inboundToken).allowance(msg.sender, address(this)) < _depositAmount) {
                revert INSUFFICIENT_ALLOWANCE();
            }
        }

        uint256 currentSegment = getCurrentSegment();
        players[msg.sender].mostRecentSegmentPaid = currentSegment;

        players[msg.sender].amountPaid = players[msg.sender].amountPaid.add(_depositAmount);
        // PLAYER INDEX CALCULATION TO DETERMINE INTEREST SHARE
        // player index = prev. segment player index + segment amount deposited / time stamp of deposit
        uint256 currentSegmentplayerIndex = _depositAmount.mul(MULTIPLIER).div(block.timestamp);
        playerIndex[msg.sender][currentSegment] = currentSegmentplayerIndex;

        for (uint256 i = 0; i <= players[msg.sender].mostRecentSegmentPaid; i++) {
            cummalativePlayerIndexSum[currentSegment] = cummalativePlayerIndexSum[currentSegment].add(
                playerIndex[msg.sender][i]
            );
        }
        // check if this is deposit for the last segment. If yes, the player is a winner.
        // since both join game and deposit method call this method so having it here
        if (currentSegment == lastSegment.sub(1)) {
            // array indexes start from 0
            winnerCount = winnerCount.add(uint256(1));
            players[msg.sender].isWinner = true;
        }
        segmentCounter[currentSegment] += 1;
        if (currentSegment > 0) {
            if (segmentCounter[currentSegment - 1] > 0) {
                segmentCounter[currentSegment - 1] -= 1;
            }
        }
        totalGamePrincipal = totalGamePrincipal.add(_depositAmount);
        if (!isTransactionalToken) {
            IERC20(inboundToken).transferFrom(msg.sender, address(strategy), _depositAmount);
        }

        strategy.invest{ value: msg.value }(inboundToken, _minAmount);
    }

    /// @dev Sets the game stats without redeeming the funds from the strategy.
    /// Can only be called after the game is completed when each player withdraws.
    function setGlobalPoolParamsForFlexibleDepositPool() internal virtual whenGameIsCompleted {
        // Since this is only called in the case of variable deposit & it is called everytime a player decides to withdraw,
        // so totalBalance keeps a track of the ucrrent balance & the accumalated principal + interest stored in the strategy protocol.
        uint256 totalBalance = isTransactionalToken
            ? address(this).balance.add(strategy.getTotalAmount(inboundToken))
            : IERC20(inboundToken).balanceOf(address(this)).add(strategy.getTotalAmount(inboundToken));

        // calculates gross interest
        uint256 grossInterest = 0;
        uint256 grossRewardTokenAmount = 0;
        uint256 grossStrategyGovernanceTokenAmount = 0;
        // impermanent loss checks
        if (totalBalance >= totalGamePrincipal) {
            grossInterest = totalBalance.sub(totalGamePrincipal);
        } else {
            // handling impermanent loss case
            impermanentLossShare = (totalBalance.mul(uint256(100))).div(totalGamePrincipal);
            totalGamePrincipal = totalBalance;
        }

        rewardToken = strategy.getRewardToken();
        strategyGovernanceToken = strategy.getGovernanceToken();

        // the reward calaculation is the sum of the current reward amount the remaining rewards being accumalated in the strategy protocols.
        if (address(rewardToken) != address(0) && inboundToken != address(rewardToken)) {
            grossRewardTokenAmount = rewardTokenAmount.add(
                strategy.getAccumalatedRewardTokenAmount(inboundToken, disableRewardTokenClaim)
            );
        }

        if (address(strategyGovernanceToken) != address(0) && inboundToken != address(strategyGovernanceToken)) {
            grossStrategyGovernanceTokenAmount = strategyGovernanceTokenAmount.add(
                strategy.getAccumalatedGovernanceTokenAmount(inboundToken, disableStrategyGovernanceTokenClaim)
            );
        }

        // calculates the performance/admin fee (takes a cut - the admin percentage fee - from the pool's interest, strategy rewards).
        // calculates the "gameInterest" (net interest) that will be split among winners in the game
        // calculates the rewardTokenAmount that will be split among winners in the game
        // calculates the strategyGovernanceTokenAmount that will be split among winners in the game
        uint256[3] memory _adminFeeAmount;
        if (adminFee > 0) {
            // since this method is called when each player withdraws in a variable deposit game/pool so we need to make sure that if the admin fee % is more than 0 then the fee is only calculated once.
            if (adminFeeAmount[0] == 0) {
                _adminFeeAmount[0] = (grossInterest.mul(adminFee)).div(uint256(100));
                _adminFeeAmount[1] = (grossRewardTokenAmount.mul(adminFee)).div(uint256(100));
                _adminFeeAmount[2] = (grossStrategyGovernanceTokenAmount.mul(adminFee)).div(uint256(100));

                totalGameInterest = grossInterest.sub(_adminFeeAmount[0]);
                rewardTokenAmount = grossRewardTokenAmount.sub(_adminFeeAmount[1]);
                strategyGovernanceTokenAmount = grossStrategyGovernanceTokenAmount.sub(_adminFeeAmount[2]);
            }
        } else {
            totalGameInterest = grossInterest;
            rewardTokenAmount = grossRewardTokenAmount;
            strategyGovernanceTokenAmount = grossStrategyGovernanceTokenAmount;
        }

        // when there's no winners, admin takes all the interest + rewards
        if (winnerCount == 0 && !emergencyWithdraw) {
            adminFeeAmount[0] = grossInterest;
            adminFeeAmount[1] = grossRewardTokenAmount;
            adminFeeAmount[2] = grossStrategyGovernanceTokenAmount;
        } else if (adminFeeAmount[0] == 0) {
            adminFeeAmount[0] = _adminFeeAmount[0];
            adminFeeAmount[1] = _adminFeeAmount[1];
            adminFeeAmount[2] = _adminFeeAmount[2];
        }

        // If there's an incentive token address defined, sets the total incentive amount to be distributed among winners.
        if (
            address(incentiveToken) != address(0) &&
            address(rewardToken) != address(incentiveToken) &&
            address(strategyGovernanceToken) != address(incentiveToken) &&
            inboundToken != address(incentiveToken)
        ) {
            totalIncentiveAmount = IERC20(incentiveToken).balanceOf(address(this));
        }

        emit VariablePoolParamsSet(
            totalBalance,
            totalGamePrincipal,
            totalGameInterest,
            totalIncentiveAmount,
            rewardTokenAmount,
            strategyGovernanceTokenAmount
        );
    }

    //*********************************************************************//
    // ------------------------- external/public methods -------------------------- //
    //*********************************************************************//

    /**
    @dev Enable early game completion in case of a emergency like the strategy contract becomes inactive in the midddle of the game etc.
    // Once enabled players can withdraw their funds along with interest for winners.
    */
    function enableEmergencyWithdraw() external onlyOwner whenGameIsNotCompleted {
        if (totalGamePrincipal == 0) {
            revert EARLY_EXIT_NOT_POSSIBLE();
        }
        uint256 currentSegment = getCurrentSegment();
        lastSegment = currentSegment;
        emergencyWithdraw = true;
    }

    /**
    @dev Set's the incentive token address.
    @param _incentiveToken Incentive token address
    */
    function setIncentiveToken(IERC20 _incentiveToken) external onlyOwner whenGameIsNotCompleted {
        incentiveToken = _incentiveToken;
    }

    /**
    @dev Disable claiming reward tokens.
    */
    function disableClaimingRewardTokens() external onlyOwner whenGameIsNotCompleted {
        disableRewardTokenClaim = true;
    }

    /**
    @dev Disable claiming strategy governance reward tokens.
    */
    function disableClaimingStrategyGovernanceRewardTokens() external onlyOwner whenGameIsNotCompleted {
        disableStrategyGovernanceTokenClaim = true;
    }

    /// @dev pauses the game. This function can be called only by the contract's admin.
    function pause() external onlyOwner whenNotPaused {
        _pause();
    }

    /// @dev unpauses the game. This function can be called only by the contract's admin.
    function unpause() external onlyOwner whenPaused {
        _unpause();
    }

    /// @dev Unlocks renounceOwnership.
    function unlockRenounceOwnership() external onlyOwner {
        allowRenouncingOwnership = true;
    }

    /// @dev Renounces Ownership.
    function renounceOwnership() public override onlyOwner {
        if (!allowRenouncingOwnership) {
            revert RENOUNCE_OWNERSHIP_NOT_ALLOWED();
        }
        super.renounceOwnership();
    }

    /**
    @dev Allows admin to set a lower early withdrawal fee.
    @param _newEarlyWithdrawFees New earlywithdrawal fee.
    */
    function lowerEarlyWithdrawFees(uint128 _newEarlyWithdrawFees) external virtual onlyOwner {
        if (_newEarlyWithdrawFees >= earlyWithdrawalFee) {
            revert INVALID_EARLY_WITHDRAW_FEE();
        }
        earlyWithdrawalFee = _newEarlyWithdrawFees;
    }

    /// @dev Allows the admin to withdraw the performance fee, if applicable. This function can be called only by the contract's admin.
    /// Cannot be called before the game ends.
    function adminFeeWithdraw() external virtual onlyOwner whenGameIsCompleted {
        if (adminWithdraw) {
            revert ADMIN_FEE_WITHDRAWN();
        }
        adminWithdraw = true;

        if (!flexibleSegmentPayment) {
            if (!redeemed) {
                revert FUNDS_NOT_REDEEMED_FROM_EXTERNAL_POOL();
            }
        } else {
            setGlobalPoolParamsForFlexibleDepositPool();
        }

        // when there are no winners, admin will be able to withdraw the
        // additional incentives sent to the pool, avoiding locking the funds.
        uint256 adminIncentiveAmount = 0;
        uint256 adminRewardTokenAmount = 0;
        uint256 adminGovernanceTokenAmount = 0;

        if (adminFeeAmount[0] > 0 || adminFeeAmount[1] > 0 || adminFeeAmount[2] > 0) {
            strategy.redeem(
                inboundToken,
                adminFeeAmount[0],
                flexibleSegmentPayment,
                0,
                disableRewardTokenClaim,
                disableStrategyGovernanceTokenClaim
            );
            if (isTransactionalToken) {
                if (adminFeeAmount[0] > address(this).balance) {
                    adminFeeAmount[0] = address(this).balance;
                }
                (bool success, ) = msg.sender.call{ value: adminFeeAmount[0] }("");
                if (!success) {
                    revert TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();
                }
            } else {
                if (adminFeeAmount[0] > IERC20(inboundToken).balanceOf(address(this))) {
                    adminFeeAmount[0] = IERC20(inboundToken).balanceOf(address(this));
                }
                IERC20(inboundToken).transfer(owner(), adminFeeAmount[0]);
            }
            if (address(rewardToken) != address(0)) {
                adminRewardTokenAmount = adminFeeAmount[1];
                rewardToken.transfer(owner(), adminFeeAmount[1]);
            }

            if (address(strategyGovernanceToken) != address(0)) {
                adminGovernanceTokenAmount = adminFeeAmount[2];
                strategyGovernanceToken.transfer(owner(), adminFeeAmount[2]);
            }
        }

        if (winnerCount == 0) {
            if (totalIncentiveAmount > 0) {
                adminIncentiveAmount = totalIncentiveAmount;
                IERC20(incentiveToken).transfer(owner(), adminIncentiveAmount);
            }
        }

        // emitting it here since to avoid duplication made the if block common for incentive and reward tokens
        emit AdminWithdrawal(
            owner(),
            totalGameInterest,
            adminFeeAmount[0],
            adminIncentiveAmount,
            adminRewardTokenAmount,
            adminGovernanceTokenAmount
        );
    }

    /**
    @dev Allows a player to join the game/pool by makking the first deposit.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario.
    @param _depositAmount Variable Deposit Amount in case of a variable deposit pool.
    */
    function joinGame(uint256 _minAmount, uint256 _depositAmount) external payable virtual whenGameIsInitialized whenNotPaused {
        _joinGame(_minAmount, _depositAmount);
    }

    /**
    @dev Allows a player to withdraw funds before the game ends. An early withdrawal fee is charged.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario in case of a amm strategy like curve or mobius.
    */
    function earlyWithdraw(uint256 _minAmount) external whenNotPaused whenGameIsNotCompleted {
        Player storage player = players[msg.sender];
        if (player.amountPaid == 0) {
            revert PLAYER_DOES_NOT_EXIST();
        }
        if (player.withdrawn) {
            revert PLAYER_ALREADY_WITHDREW_EARLY();
        }
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

        for (uint256 i = 0; i <= players[msg.sender].mostRecentSegmentPaid; i++) {
            if (cummalativePlayerIndexSum[currentSegment] > 0) {
                cummalativePlayerIndexSum[currentSegment] = cummalativePlayerIndexSum[currentSegment].sub(
                    playerIndex[msg.sender][i]
                );
            } else {
                cummalativePlayerIndexSum[currentSegment - 1] = cummalativePlayerIndexSum[currentSegment - 1].sub(
                    playerIndex[msg.sender][i]
                );
            }
        }

        if (winnerCount > 0 && player.isWinner) {
            winnerCount = winnerCount.sub(uint256(1));
            player.isWinner = false;
        }
        if (segmentCounter[currentSegment] > 0) {
            segmentCounter[currentSegment] -= 1;
        }

        emit EarlyWithdrawal(msg.sender, withdrawAmount, totalGamePrincipal);
        strategy.earlyWithdraw(inboundToken, withdrawAmount, _minAmount);
        if (isTransactionalToken) {
            if (address(this).balance < withdrawAmount) {
                withdrawAmount = address(this).balance;
            }
            (bool success, ) = msg.sender.call{ value: withdrawAmount }("");
            if (!success) {
                revert TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();
            }
        } else {
            if (IERC20(inboundToken).balanceOf(address(this)) < withdrawAmount) {
                withdrawAmount = IERC20(inboundToken).balanceOf(address(this));
            }
            IERC20(inboundToken).transfer(msg.sender, withdrawAmount);
        }
    }

    /**
    @dev Allows player to withdraw their funds after the game ends with no loss (fee). Winners get a share of the interest earned & additional rewards based on the player index.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario in case of a amm strategy like curve or mobius.
    */
    function withdraw(uint256 _minAmount) external virtual {
        Player storage player = players[msg.sender];
        if (player.amountPaid == 0) {
            revert PLAYER_DOES_NOT_EXIST();
        }
        if (player.withdrawn) {
            revert PLAYER_ALREADY_WITHDREW();
        }
        player.withdrawn = true;

        if (!flexibleSegmentPayment) {
            // First player to withdraw redeems everyone's funds
            if (!redeemed) {
                redeemFromExternalPoolForFixedDepositPool(_minAmount);
            }
        } else {
            setGlobalPoolParamsForFlexibleDepositPool();
        }
        uint256 payout = player.amountPaid;
        uint256 playerIncentive = 0;
        uint256 playerReward = 0;
        uint256 playerInterestShare = 0;
        uint256 playerGovernanceTokenReward = 0;
        uint256 playerSharePercentage = 0;

        if (
            player.isWinner ||
            ((
                lastSegment == 0
                    ? players[msg.sender].mostRecentSegmentPaid >= lastSegment
                    : players[msg.sender].mostRecentSegmentPaid >= lastSegment.sub(1)
            ) && emergencyWithdraw)
        ) {
            // Calculate Cummalative index for each player
            uint256 cumulativePlayerIndex = 0;
            uint256 segmentPaid = emergencyWithdraw
                ? lastSegment == 0 ? 0 : lastSegment.sub(1)
                : players[msg.sender].mostRecentSegmentPaid;
            for (uint256 i = 0; i <= segmentPaid; i++) {
                cumulativePlayerIndex = cumulativePlayerIndex.add(playerIndex[msg.sender][i]);
            }
            playerSharePercentage = cumulativePlayerIndex.mul(100).div(
                cummalativePlayerIndexSum[lastSegment == 0 ? 0 : lastSegment.sub(1)]
            );
            if (impermanentLossShare > 0 && totalGameInterest == 0) {
                // new payput in case of impermanent loss
                payout = player.amountPaid.mul(impermanentLossShare).div(uint256(100));
            } else {
                // Player is a winner and gets a bonus!
                // the player share of interest is calculated from player index
                // player share % = playerIndex / cummalativePlayerIndexSum of player indexes of all winners * 100
                // so, interest share = player share % * total game interest
                playerInterestShare = totalGameInterest.mul(playerSharePercentage).div(uint256(100));
                payout = payout.add(playerInterestShare);
            }

            // Calculates winner's share of the additional rewards & incentives
            if (totalIncentiveAmount > 0) {
                playerIncentive = totalIncentiveAmount.mul(playerSharePercentage).div(uint256(100));
            }
            if (address(rewardToken) != address(0) && rewardTokenAmount > 0) {
                playerReward = rewardTokenAmount.mul(playerSharePercentage).div(uint256(100));
            }

            if (address(strategyGovernanceToken) != address(0) && strategyGovernanceTokenAmount > 0) {
                playerGovernanceTokenReward = strategyGovernanceTokenAmount.mul(playerSharePercentage).div(
                    uint256(100)
                );
            }

            if (flexibleSegmentPayment) {
                totalGameInterest = totalGameInterest.sub(playerInterestShare);
                cummalativePlayerIndexSum[lastSegment.sub(1)] = cummalativePlayerIndexSum[lastSegment.sub(1)].sub(
                    cumulativePlayerIndex
                );
                rewardTokenAmount = rewardTokenAmount.sub(playerReward);
                strategyGovernanceTokenAmount = strategyGovernanceTokenAmount.sub(playerGovernanceTokenReward);
                totalIncentiveAmount = totalIncentiveAmount.sub(playerIncentive);
            }
        }
        emit Withdrawal(msg.sender, payout, playerIncentive, playerReward, playerGovernanceTokenReward);
        // Updating total principal as well after each player withdraws
        if (flexibleSegmentPayment) {
            if (totalGamePrincipal < player.amountPaid) {
                totalGamePrincipal = 0;
            } else {
                totalGamePrincipal = totalGamePrincipal.sub(player.amountPaid);
            }

            strategy.redeem(
                inboundToken,
                payout,
                flexibleSegmentPayment,
                _minAmount,
                disableRewardTokenClaim,
                disableStrategyGovernanceTokenClaim
            );
        }

        // sending the inbound token amount i.e principal + interest to the winners and just the principal in case of players
        // adding a balance safety check to ensure the tx does not revert in case of impermanent loss
        if (isTransactionalToken) {
            if (payout > address(this).balance) {
                payout = address(this).balance;
            }
            (bool success, ) = msg.sender.call{ value: payout }("");
            if (!success) {
                revert TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();
            }
        } else {
            if (payout > IERC20(inboundToken).balanceOf(address(this))) {
                payout = IERC20(inboundToken).balanceOf(address(this));
            }
            IERC20(inboundToken).transfer(msg.sender, payout);
        }

        // sending the rewards & incentives to the winners
        if (playerIncentive > 0) {
            IERC20(incentiveToken).transfer(msg.sender, playerIncentive);
        }

        if (playerReward > 0) {
            IERC20(rewardToken).transfer(msg.sender, playerReward);
        }

        if (playerGovernanceTokenReward > 0) {
            IERC20(strategyGovernanceToken).transfer(msg.sender, playerGovernanceTokenReward);
        }
    }

    /**
    @dev Allows players to make deposits for the game segments, after joining the game.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario.
    @param _depositAmount Variable Deposit Amount in case of a variable deposit pool.
    */
    function makeDeposit(uint256 _minAmount, uint256 _depositAmount) external payable whenNotPaused {
        if (players[msg.sender].withdrawn) {
            revert PLAYER_ALREADY_WITHDREW_EARLY();
        }
        // only registered players can deposit
        if (players[msg.sender].addr != msg.sender) {
            revert NOT_PLAYER();
        }
        if (flexibleSegmentPayment) {
            if (_depositAmount != players[msg.sender].depositAmount) {
                revert INVALID_FLEXIBLE_AMOUNT();
            }
        }
        uint256 currentSegment = getCurrentSegment();
        // User can only deposit between segment 1 and segment n-1 (where n is the number of segments for the game) or if the emergencyWithdraw flag has not been enabled.
        // Details:
        // Segment 0 is paid when user joins the game (the first deposit window).
        // Last segment doesn't accept payments, because the payment window for the last
        // segment happens on segment n-1 (penultimate segment).
        // Any segment greater than the last segment means the game is completed, and cannot
        // receive payments
        if (currentSegment == 0 || currentSegment >= lastSegment || emergencyWithdraw) {
            revert DEPOSIT_NOT_ALLOWED();
        }

        //check if current segment is currently unpaid
        if (players[msg.sender].mostRecentSegmentPaid == currentSegment) {
            revert PLAYER_ALREADY_PAID_IN_CURRENT_SEGMENT();
        }

        // check if player has made payments up to the previous segment
        if (players[msg.sender].mostRecentSegmentPaid != currentSegment.sub(1)) {
            revert PLAYER_DID_NOT_PAID_PREVIOUS_SEGMENT();
        }

        uint256 amount = flexibleSegmentPayment ? _depositAmount : segmentPayment;
        if (isTransactionalToken) {
            if (msg.value != amount) {
                revert INVALID_TRANSACTIONAL_TOKEN_AMOUNT();
            }
        }
        emit Deposit(msg.sender, currentSegment, amount);
        _transferInboundTokenToContract(_minAmount, amount);
    }

    /**
    @dev Redeems funds from the external pool and updates the game stats.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario.
    */
    function redeemFromExternalPoolForFixedDepositPool(uint256 _minAmount) public virtual whenGameIsCompleted {
        if (redeemed) {
            revert FUNDS_REDEEMED_FROM_EXTERNAL_POOL();
        }
        redeemed = true;
        uint256 totalBalance = 0;
        // Withdraws funds (principal + interest + rewards) from external pool

        strategy.redeem(
            inboundToken,
            0,
            flexibleSegmentPayment,
            _minAmount,
            disableRewardTokenClaim,
            disableStrategyGovernanceTokenClaim
        );

        if (isTransactionalToken) {
            totalBalance = address(this).balance;
        } else {
            totalBalance = IERC20(inboundToken).balanceOf(address(this));
        }

        // calculates gross interest
        uint256 grossInterest = 0;
        uint256 grossRewardTokenAmount = 0;
        uint256 grossStrategyGovernanceTokenAmount = 0;
        // Sanity check to avoid reverting due to overflow in the "subtraction" below.
        // This could only happen in case Aave changes the 1:1 ratio between
        // aToken vs. Token in the future
        if (totalBalance >= totalGamePrincipal) {
            grossInterest = totalBalance.sub(totalGamePrincipal);
        } else {
            // handling impermanent loss case
            impermanentLossShare = (totalBalance.mul(uint256(100))).div(totalGamePrincipal);
            totalGamePrincipal = totalBalance;
        }

        rewardToken = strategy.getRewardToken();
        strategyGovernanceToken = strategy.getGovernanceToken();

        if (address(rewardToken) != address(0) && inboundToken != address(rewardToken)) {
            grossRewardTokenAmount = rewardToken.balanceOf(address(this));
        }

        if (address(strategyGovernanceToken) != address(0) && inboundToken != address(strategyGovernanceToken)) {
            grossStrategyGovernanceTokenAmount = strategyGovernanceToken.balanceOf(address(this));
        }

        // calculates the performance/admin fee (takes a cut - the admin percentage fee - from the pool's interest, strategy rewards).
        // calculates the "gameInterest" (net interest) that will be split among winners in the game
        // calculates the rewardTokenAmount that will be split among winners in the game
        // calculates the strategyGovernanceTokenAmount that will be split among winners in the game
        uint256[3] memory _adminFeeAmount;
        if (adminFee > 0) {
            _adminFeeAmount[0] = (grossInterest.mul(adminFee)).div(uint256(100));
            _adminFeeAmount[1] = (grossRewardTokenAmount.mul(adminFee)).div(uint256(100));
            _adminFeeAmount[2] = (grossStrategyGovernanceTokenAmount.mul(adminFee)).div(uint256(100));

            totalGameInterest = grossInterest.sub(_adminFeeAmount[0]);
            rewardTokenAmount = grossRewardTokenAmount.sub(_adminFeeAmount[1]);
            strategyGovernanceTokenAmount = grossStrategyGovernanceTokenAmount.sub(_adminFeeAmount[2]);
        } else {
            totalGameInterest = grossInterest;
            rewardTokenAmount = grossRewardTokenAmount;
            strategyGovernanceTokenAmount = grossStrategyGovernanceTokenAmount;
        }

        // when there's no winners, admin takes all the interest + rewards
        if (winnerCount == 0 && !emergencyWithdraw) {
            adminFeeAmount[1] = grossRewardTokenAmount;
            adminFeeAmount[2] = grossStrategyGovernanceTokenAmount;
            adminFeeAmount[0] = grossInterest;
        } else {
            adminFeeAmount[0] = _adminFeeAmount[0];
            adminFeeAmount[1] = _adminFeeAmount[1];
            adminFeeAmount[2] = _adminFeeAmount[2];
        }

        // If there's an incentive token address defined, sets the total incentive amount to be distributed among winners.
        if (
            address(incentiveToken) != address(0) &&
            address(rewardToken) != address(incentiveToken) &&
            address(strategyGovernanceToken) != address(incentiveToken) &&
            inboundToken != address(incentiveToken)
        ) {
            totalIncentiveAmount = IERC20(incentiveToken).balanceOf(address(this));
        }

        emit FundsRedeemedFromExternalPool(
            isTransactionalToken ? address(this).balance : IERC20(inboundToken).balanceOf(address(this)),
            totalGamePrincipal,
            totalGameInterest,
            totalIncentiveAmount,
            rewardTokenAmount,
            strategyGovernanceTokenAmount
        );
    }

    // Fallback Functions for calldata and reciever for handling only ether transfer
    receive() external payable {}
}
