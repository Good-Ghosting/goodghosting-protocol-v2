// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./strategies/IStrategy.sol";

//*********************************************************************//
// --------------------------- custom errors ------------------------- //
//*********************************************************************//
error TOKEN_TRANSFER_FAILURE();
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
error EARLY_EXIT_NOT_POSSIBLE();
error GAME_NOT_INITIALIZED();
error GAME_ALREADY_INITIALIZED();
error INVALID_OWNER();

/**
@title GoodGhosting V2 Hodl Contract
@notice Allows users to join a pool with a yield bearing strategy, the winners get interest and rewards, losers get their principal back.
*/
contract Pool is Ownable, Pausable, ReentrancyGuard {
    /// using for better readability.
    using SafeMath for uint256;

    /// @notice Multiplier used for calculating playerIndex to avoid precision issues.
    uint256 public constant MULTIPLIER = 10**8;

    /// @notice Maximum Flexible Deposit Amount in case of flexible pools.
    uint256 public immutable maxFlexibleSegmentPaymentAmount;

    /// @notice The time duration (in seconds) of each segment.
    uint256 public immutable segmentLength;

    /// @notice The time duration (in seconds) of last segment (waiting round).
    uint256 public immutable waitingRoundSegmentLength;

    /// @notice The performance admin fee (percentage).
    uint128 public immutable adminFee;

    /// @notice Defines the max quantity of players allowed in the game.
    uint256 public immutable maxPlayersCount;

    /// @notice The amount to be paid on each segment in case "flexibleSegmentPayment" is false (fixed payments).
    uint256 public immutable segmentPayment;

    /// @notice Address of the token used for depositing into the game by players.
    address public immutable inboundToken;

    /// @notice Flag which determines whether the segment payment is fixed or not.
    bool public immutable flexibleSegmentPayment;

    /// @notice Strategy Contract Address
    IStrategy public strategy;

    /// @notice Flag which determines whether the deposit token is a transactional token like eth or matic (blockchain native token, not ERC20).
    bool public immutable isTransactionalToken;

    /// @notice When the game started (game initialized timestamp).
    uint256 public firstSegmentStart;

    /// @notice Timestamp when the waiting segment starts.
    uint256 public waitingRoundSegmentStart;

    /// @notice The number of segments in the game (segment count).
    uint256 public depositCount;

    /// @notice The early withdrawal fee (percentage).
    uint128 public earlyWithdrawalFee;

    /// @notice Stores the total amount of net interest received in the game.
    uint256 public totalGameInterest;

    /// @notice total principal amount.
    uint256 public totalGamePrincipal;

    /// @notice performance fee amount allocated to the admin.
    uint256[] public adminFeeAmount;

    /// @notice total amount of incentive tokens to be distributed among winners.
    uint256 public totalIncentiveAmount = 0;

    /// @notice Controls the amount of active players in the game (ignores players that early withdraw).
    uint256 public activePlayersCount = 0;

    /// @notice winner counter to track no of winners.
    uint256 public winnerCount = 0;

    /// @notice share % from impermanent loss.
    uint256 public impermanentLossShare;

    /// @notice total rewardTokenAmounts.
    uint256[] public rewardTokenAmounts;

    /// @notice emaergency withdraw flag.
    bool public emergencyWithdraw = false;

    /// @notice Controls if tokens were redeemed or not from the pool.
    bool public redeemed;

    /// @notice Controls if reward tokens are to be claimed at the time of redeem.
    bool public disableRewardTokenClaim = false;

    /// @notice controls if admin withdrew or not the performance fee.
    bool public adminWithdraw;

    /// @notice Ownership Control flag.
    bool public allowRenouncingOwnership = false;

    /// @notice Defines an optional token address used to provide additional incentives to users. Accepts "0x0" adresses when no incentive token exists.
    IERC20 public incentiveToken;

    /// @notice address of additional reward token accured from investing via different strategies like wmatic.
    IERC20[] public rewardTokens;

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

    /// @notice Stores info of the segment counter needed for ui as backup for graph.
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

    event Withdrawal(address indexed player, uint256 amount, uint256 playerIncentive, uint256[] playerRewardAmounts);

    event FundsRedeemedFromExternalPool(
        uint256 totalAmount,
        uint256 totalGamePrincipal,
        uint256 totalGameInterest,
        uint256 totalIncentiveAmount,
        uint256[] totalRewardAmounts
    );

    event VariablePoolParamsSet(
        uint256 totalAmount,
        uint256 totalGamePrincipal,
        uint256 totalGameInterest,
        uint256 totalIncentiveAmount,
        uint256[] totalRewardAmounts
    );

    event EarlyWithdrawal(address indexed player, uint256 amount, uint256 totalGamePrincipal);

    event AdminWithdrawal(
        address indexed admin,
        uint256 totalGameInterest,
        uint256 adminIncentiveAmount,
        uint256[] adminFeeAmounts
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

    modifier whenGameIsNotInitialized() {
        if (firstSegmentStart > 0) {
            revert GAME_ALREADY_INITIALIZED();
        }
        _;
    }

    //*********************************************************************//
    // ------------------------- external views -------------------------- //
    //*********************************************************************//

    /// @dev Checks if the game is completed or not.
    /// @return "true" if completeted; otherwise, "false".
    function isGameCompleted() public view returns (bool) {
        // Game is completed when the current segment is greater than "depositCount" of the game
        // or if "emergencyWithdraw" was enabled.
        return getCurrentSegment() > depositCount || emergencyWithdraw;
    }

    /// @dev gets the number of players in the game.
    /// @return number of players.
    function getNumberOfPlayers() external view returns (uint256) {
        return iterablePlayers.length;
    }

    /// @dev Calculates the current segment of the game.
    /// @return current game segment.
    function getCurrentSegment() public view whenGameIsInitialized returns (uint256) {
        uint256 currentSegment;
        if (
            waitingRoundSegmentStart <= block.timestamp &&
            block.timestamp <= (waitingRoundSegmentStart.add(waitingRoundSegmentLength))
        ) {
            uint256 waitingRoundSegment = block.timestamp.sub(waitingRoundSegmentStart).div(waitingRoundSegmentLength);
            currentSegment = depositCount.add(waitingRoundSegment);
        } else {
            currentSegment = block.timestamp.sub(firstSegmentStart).div(segmentLength);
        }
        return currentSegment;
    }

    /// @dev Checks if the game has been initialized or not.
    function isInitialized() external view returns(bool) {
        return firstSegmentStart > 0;
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
        if (!_flexibleSegmentPayment && _segmentPayment == 0) {
            revert INVALID_SEGMENT_PAYMENT();
        }
        if (_waitingRoundSegmentLength == 0) {
            revert INVALID_WAITING_ROUND_SEGMENT_LENGTH();
        }
        if (_waitingRoundSegmentLength < _segmentLength) {
            revert INVALID_WAITING_ROUND_SEGMENT_LENGTH();
        }

        address _underlyingAsset = _strategy.getUnderlyingAsset();
        if (
            _underlyingAsset != address(0) &&
            _underlyingAsset != _inboundCurrency &&
            !_isTransactionalToken
        ) {
                revert INVALID_INBOUND_TOKEN();
        }

        // Initializes default variables
        depositCount = _depositCount;
        segmentLength = _segmentLength;
        waitingRoundSegmentLength = _waitingRoundSegmentLength;
        segmentPayment = _segmentPayment;
        earlyWithdrawalFee = _earlyWithdrawalFee;
        adminFee = _customFee;
        inboundToken = _inboundCurrency;
        strategy = _strategy;
        maxPlayersCount = _maxPlayersCount;
        maxFlexibleSegmentPaymentAmount = _maxFlexibleSegmentPaymentAmount;
        rewardTokens = strategy.getRewardTokens();
        rewardTokenAmounts = new uint256[](rewardTokens.length);
        adminFeeAmount = new uint256[](rewardTokens.length + 1);
    }

    /**
    @dev Initializes the pool
    */
    function initialize() public virtual onlyOwner whenGameIsNotInitialized whenNotPaused {
        if (strategy.strategyOwner() != address(this)) {
          revert INVALID_OWNER();
        }
        firstSegmentStart = block.timestamp; //gets current time
        waitingRoundSegmentStart = block.timestamp + (segmentLength * depositCount);
    }

    //*********************************************************************//
    // ------------------------- internal methods -------------------------- //
    //*********************************************************************//

    /**
    @dev Initializes the player stats when they join.
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
        } else {
            if (msg.value != 0) {
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
    function _transferInboundTokenToContract(uint256 _minAmount, uint256 _depositAmount) internal virtual nonReentrant {
        uint256 currentSegment = getCurrentSegment();
        players[msg.sender].mostRecentSegmentPaid = currentSegment;

        players[msg.sender].amountPaid = players[msg.sender].amountPaid.add(_depositAmount);
        // PLAYER INDEX CALCULATION TO DETERMINE INTEREST SHARE
        // player index = prev. segment player index + segment amount deposited / time stamp of deposit
        uint256 currentSegmentplayerIndex = _depositAmount.mul(MULTIPLIER).div(block.timestamp);
        playerIndex[msg.sender][currentSegment] = currentSegmentplayerIndex;

        uint256 cummalativePlayerIndexSumInMemory = cummalativePlayerIndexSum[currentSegment];
        for (uint256 i = 0; i <= players[msg.sender].mostRecentSegmentPaid; i++) {
            cummalativePlayerIndexSumInMemory = cummalativePlayerIndexSumInMemory.add(playerIndex[msg.sender][i]);
        }
        cummalativePlayerIndexSum[currentSegment] = cummalativePlayerIndexSumInMemory;
        // check if this is deposit for the last segment. If yes, the player is a winner.
        // since both join game and deposit method call this method so having it here
        if (currentSegment == depositCount.sub(1)) {
            // array indexes start from 0
            winnerCount = winnerCount.add(uint256(1));
            players[msg.sender].isWinner = true;
        }

        // segment counter calculation needed for ui as backup in case graph goes down
        segmentCounter[currentSegment] += 1;
        if (currentSegment > 0) {
            if (segmentCounter[currentSegment - 1] > 0) {
                segmentCounter[currentSegment - 1] -= 1;
            }
        }
        totalGamePrincipal = totalGamePrincipal.add(_depositAmount);
        if (!isTransactionalToken) {
            bool success = IERC20(inboundToken).transferFrom(msg.sender, address(strategy), _depositAmount);
            if (!success) {
                revert TOKEN_TRANSFER_FAILURE();
            }
        }

        strategy.invest{ value: msg.value }(inboundToken, _minAmount);
    }

    /// @dev Sets the game stats without redeeming the funds from the strategy.
    /// Can only be called after the game is completed when each player withdraws.
    function setGlobalPoolParamsForFlexibleDepositPool() internal virtual nonReentrant whenGameIsCompleted {
        // Since this is only called in the case of variable deposit & it is called everytime a player decides to withdraw,
        // so totalBalance keeps a track of the ucrrent balance & the accumalated principal + interest stored in the strategy protocol.
        uint256 totalBalance = isTransactionalToken
            ? address(this).balance.add(strategy.getTotalAmount())
            : IERC20(inboundToken).balanceOf(address(this)).add(strategy.getTotalAmount());

        // calculates gross interest
        uint256 grossInterest = 0;

        // impermanent loss checks
        if (totalBalance >= totalGamePrincipal) {
            grossInterest = totalBalance.sub(totalGamePrincipal);
        } else {
            // handling impermanent loss case
            impermanentLossShare = (totalBalance.mul(uint256(100))).div(totalGamePrincipal);
            totalGamePrincipal = totalBalance;
        }

        uint256[] memory grossRewardTokenAmount = new uint256[](rewardTokens.length);
        uint256[] memory _adminFeeAmount = new uint256[](rewardTokens.length + 1);

        for (uint256 i = 0; i < rewardTokens.length; i++) {
            // the reward calaculation is the sum of the current reward amount the remaining rewards being accumalated in the strategy protocols.
            // the reason being like totalBalance for every player this is updated and prev. value is used to add any left over value
            if (address(rewardTokens[i]) != address(0) && inboundToken != address(rewardTokens[i])) {
                grossRewardTokenAmount[i] = rewardTokenAmounts[i].add(
                    strategy.getAccumulatedRewardTokenAmounts(disableRewardTokenClaim)[i]
                );
            }
        }

        // calculates the performance/admin fee (takes a cut - the admin percentage fee - from the pool's interest, strategy rewards).
        // calculates the "gameInterest" (net interest) that will be split among winners in the game
        // calculates the rewardTokenAmounts that will be split among winners in the game
        // the admin fee will only be caluclated the first time once hence the nested if to ensure that although this method is called multiple times but the admin fee only get's set once
        if (adminFee > 0) {
            // since this method is called when each player withdraws in a variable deposit game/pool so we need to make sure that if the admin fee % is more than 0 then the fee is only calculated once.
            if (adminFeeAmount[0] == 0) {
                _adminFeeAmount[0] = (grossInterest.mul(adminFee)).div(uint256(100));
                for (uint256 i = 0; i < rewardTokens.length; i++) {
                    _adminFeeAmount[i + 1] = (grossRewardTokenAmount[i].mul(adminFee)).div(uint256(100));
                    rewardTokenAmounts[i] = grossRewardTokenAmount[i].sub(_adminFeeAmount[i + 1]);
                }

                totalGameInterest = grossInterest.sub(_adminFeeAmount[0]);
            }
        } else {
            totalGameInterest = grossInterest;
            for (uint256 i = 0; i < rewardTokens.length; i++) {
                rewardTokenAmounts[i] = grossRewardTokenAmount[i];
            }
        }

        // when there's no winners, admin takes all the interest + rewards
        if (winnerCount == 0 && !emergencyWithdraw) {
            adminFeeAmount[0] = grossInterest;
            for (uint256 i = 0; i < rewardTokens.length; i++) {
                adminFeeAmount[i + 1] = grossRewardTokenAmount[i];
            }
        } else if (adminFeeAmount[0] == 0) {
            adminFeeAmount[0] = _adminFeeAmount[0];
            for (uint256 i = 0; i < rewardTokens.length; i++) {
                adminFeeAmount[i + 1] = _adminFeeAmount[i + 1];
            }
        }

        for (uint256 i = 0; i < rewardTokens.length; i++) {
            // If there's an incentive token address defined, sets the total incentive amount to be distributed among winners.
            if (
                address(incentiveToken) != address(0) &&
                address(rewardTokens[i]) != address(incentiveToken) &&
                inboundToken != address(incentiveToken)
            ) {
                totalIncentiveAmount = IERC20(incentiveToken).balanceOf(address(this));
                break;
            }
        }

        emit VariablePoolParamsSet(
            totalBalance,
            totalGamePrincipal,
            totalGameInterest,
            totalIncentiveAmount,
            rewardTokenAmounts
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
        depositCount = getCurrentSegment();
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
    @dev Disable claiming reward tokens for emergency scenarios, like when external reward contracts become
        inactive or rewards funds aren't available, allowing users to withdraw principal + interest from contract.
    */
    function disableClaimingRewardTokens() external onlyOwner whenGameIsNotCompleted {
        disableRewardTokenClaim = true;
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

        if (adminFeeAmount[0] > 0 || adminFeeAmount[1] > 0 || (adminFeeAmount.length > 2 && adminFeeAmount[2] > 0)) {
            strategy.redeem(inboundToken, adminFeeAmount[0], flexibleSegmentPayment, 0, disableRewardTokenClaim);
            if (isTransactionalToken) {
                // safety check
                // this scenario is very tricky to mock
                // and our mock contracts are pretty complex currently so haven't tested this line with unit tests
                if (adminFeeAmount[0] > address(this).balance) {
                    adminFeeAmount[0] = address(this).balance;
                }
                (bool success, ) = msg.sender.call{ value: adminFeeAmount[0] }("");
                if (!success) {
                    revert TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();
                }
            } else {
                // safety check
                if (adminFeeAmount[0] > IERC20(inboundToken).balanceOf(address(this))) {
                    adminFeeAmount[0] = IERC20(inboundToken).balanceOf(address(this));
                }
                bool success = IERC20(inboundToken).transfer(owner(), adminFeeAmount[0]);
                if (!success) {
                    revert TOKEN_TRANSFER_FAILURE();
                }
            }

            for (uint256 i = 0; i < rewardTokens.length; i++) {
                if (address(rewardTokens[i]) != address(0)) {
                    bool success = rewardTokens[i].transfer(owner(), adminFeeAmount[i + 1]);
                    if (!success) {
                        revert TOKEN_TRANSFER_FAILURE();
                    }
                }
            }
        }

        if (winnerCount == 0) {
            if (totalIncentiveAmount > 0) {
                bool success = IERC20(incentiveToken).transfer(owner(), totalIncentiveAmount);
                if (!success) {
                    revert TOKEN_TRANSFER_FAILURE();
                }
            }
        }

        // emitting it here since to avoid duplication made the if block common for incentive and reward tokens
        emit AdminWithdrawal(owner(), totalGameInterest, totalIncentiveAmount, adminFeeAmount);
    }

    /**
    @dev Allows a player to join the game/pool by makking the first deposit.
    @param _minAmount Slippage based amount to cover for impermanent loss scenario.
    @param _depositAmount Variable Deposit Amount in case of a variable deposit pool.
    */
    function joinGame(uint256 _minAmount, uint256 _depositAmount)
        external
        payable
        virtual
        whenGameIsInitialized
        whenNotPaused
    {
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
        // since there is complexity of 2 vars here with if else logic so not using 2 memory vars here only 1.
        uint256 cummalativePlayerIndexSumForCurrentSegment = cummalativePlayerIndexSum[currentSegment];
        for (uint256 i = 0; i <= players[msg.sender].mostRecentSegmentPaid; i++) {
            if (cummalativePlayerIndexSumForCurrentSegment > 0) {
                cummalativePlayerIndexSumForCurrentSegment = cummalativePlayerIndexSumForCurrentSegment.sub(
                    playerIndex[msg.sender][i]
                );
            } else {
                cummalativePlayerIndexSum[currentSegment - 1] = cummalativePlayerIndexSum[currentSegment - 1].sub(
                    playerIndex[msg.sender][i]
                );
            }
        }
        cummalativePlayerIndexSum[currentSegment] = cummalativePlayerIndexSumForCurrentSegment;

        // update winner count
        if (winnerCount > 0 && player.isWinner) {
            winnerCount = winnerCount.sub(uint256(1));
            player.isWinner = false;
        }

        // segment counter calculation needed for ui as backup in case graph goes down
        if (segmentCounter[currentSegment] > 0) {
            segmentCounter[currentSegment] -= 1;
        }

        emit EarlyWithdrawal(msg.sender, withdrawAmount, totalGamePrincipal);
        strategy.earlyWithdraw(inboundToken, withdrawAmount, _minAmount);
        if (isTransactionalToken) {
            // safety check
            // this scenario is very tricky to mock
            // and our mock contracts are pretty complex currently so haven't tested this line with unit tests
            if (address(this).balance < withdrawAmount) {
                withdrawAmount = address(this).balance;
            }
            (bool success, ) = msg.sender.call{ value: withdrawAmount }("");
            if (!success) {
                revert TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();
            }
        } else {
            // safety check
            if (IERC20(inboundToken).balanceOf(address(this)) < withdrawAmount) {
                withdrawAmount = IERC20(inboundToken).balanceOf(address(this));
            }
            bool success = IERC20(inboundToken).transfer(msg.sender, withdrawAmount);
            if (!success) {
                revert TOKEN_TRANSFER_FAILURE();
            }
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
        uint256 playerInterestShare = 0;
        uint256 playerSharePercentage = 0;
        uint256[] memory playerReward = new uint256[](rewardTokens.length);

        if (
            player.isWinner ||
            ((
                depositCount == 0
                    ? players[msg.sender].mostRecentSegmentPaid >= depositCount
                    : players[msg.sender].mostRecentSegmentPaid >= depositCount.sub(1)
            ) && emergencyWithdraw)
        ) {
            // Calculate Cummalative index for each player
            uint256 playerIndexSum = 0;
            uint256 segmentPaid = emergencyWithdraw
                ? depositCount == 0 ? 0 : depositCount.sub(1)
                : players[msg.sender].mostRecentSegmentPaid;

            // calculate playerIndexSum for each player
            for (uint256 i = 0; i <= segmentPaid; i++) {
                playerIndexSum = playerIndexSum.add(playerIndex[msg.sender][i]);
            }

            // calculate playerSharePercentage for each player
            uint256 segment = depositCount == 0 ? 0 : depositCount.sub(1);
            playerSharePercentage = (playerIndexSum.mul(100)).div(cummalativePlayerIndexSum[segment]);

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
            for (uint256 i = 0; i < rewardTokens.length; i++) {
                if (address(rewardTokens[i]) != address(0) && rewardTokenAmounts[i] > 0) {
                    playerReward[i] = rewardTokenAmounts[i].mul(playerSharePercentage).div(uint256(100));
                }
            }

            // subtract global params to make sure they are updated in case of flexible segment payment
            if (flexibleSegmentPayment) {
                totalGameInterest = totalGameInterest.sub(playerInterestShare);
                cummalativePlayerIndexSum[depositCount.sub(1)] = cummalativePlayerIndexSum[depositCount.sub(1)].sub(
                    playerIndexSum
                );
                for (uint256 i = 0; i < rewardTokens.length; i++) {
                    rewardTokenAmounts[i] = rewardTokenAmounts[i].sub(playerReward[i]);
                }

                totalIncentiveAmount = totalIncentiveAmount.sub(playerIncentive);
            }
        }
        emit Withdrawal(msg.sender, payout, playerIncentive, playerReward);
        // Updating total principal as well after each player withdraws this is separate since we have to do this for non-players
        if (flexibleSegmentPayment) {
            if (totalGamePrincipal < player.amountPaid) {
                totalGamePrincipal = 0;
            } else {
                totalGamePrincipal = totalGamePrincipal.sub(player.amountPaid);
            }

            // Withdraws funds (principal + interest + rewards) from external pool
            strategy.redeem(inboundToken, payout, flexibleSegmentPayment, _minAmount, disableRewardTokenClaim);
        }

        // sending the inbound token amount i.e principal + interest to the winners and just the principal in case of players
        // adding a balance safety check to ensure the tx does not revert in case of impermanent loss
        if (isTransactionalToken) {
            // this scenario is very tricky to mock
            // and our mock contracts are pretty complex currently so haven't tested this line with unit tests
            if (payout > address(this).balance) {
                payout = address(this).balance;
            }
            (bool success, ) = msg.sender.call{ value: payout }("");
            if (!success) {
                revert TRANSACTIONAL_TOKEN_TRANSFER_FAILURE();
            }
        } else {
            // this scenario is very tricky to mock
            // and our mock contracts are pretty complex currently so haven't tested this line with unit tests
            if (payout > IERC20(inboundToken).balanceOf(address(this))) {
                payout = IERC20(inboundToken).balanceOf(address(this));
            }
            bool success = IERC20(inboundToken).transfer(msg.sender, payout);
            if (!success) {
                revert TOKEN_TRANSFER_FAILURE();
            }
        }

        // sending the rewards & incentives to the winners
        if (playerIncentive > 0) {
            bool success = IERC20(incentiveToken).transfer(msg.sender, playerIncentive);
            if (!success) {
                revert TOKEN_TRANSFER_FAILURE();
            }
        }

        for (uint256 i = 0; i < playerReward.length; i++) {
            if (playerReward[i] > 0) {
                bool success = IERC20(rewardTokens[i]).transfer(msg.sender, playerReward[i]);
                if (!success) {
                    revert TOKEN_TRANSFER_FAILURE();
                }
            }
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
        if (currentSegment == 0 || currentSegment >= depositCount || emergencyWithdraw) {
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
        } else {
            if (msg.value != 0) {
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
        strategy.redeem(inboundToken, 0, flexibleSegmentPayment, _minAmount, disableRewardTokenClaim);

        if (isTransactionalToken) {
            totalBalance = address(this).balance;
        } else {
            totalBalance = IERC20(inboundToken).balanceOf(address(this));
        }

        // calculates gross interest
        uint256 grossInterest = 0;
        // Sanity check to avoid reverting due to overflow in the "subtraction" below.
        if (totalBalance >= totalGamePrincipal) {
            grossInterest = totalBalance.sub(totalGamePrincipal);
        } else {
            // handling impermanent loss case
            impermanentLossShare = (totalBalance.mul(uint256(100))).div(totalGamePrincipal);
            totalGamePrincipal = totalBalance;
        }

        rewardTokens = strategy.getRewardTokens();
        uint256[] memory grossRewardTokenAmount = new uint256[](rewardTokens.length);
        uint256[] memory _adminFeeAmount = new uint256[](rewardTokens.length + 1);

        for (uint256 i = 0; i < rewardTokens.length; i++) {
            // the reward calaculation is the sum of the current reward amount the remaining rewards being accumalated in the strategy protocols.
            // the reason being like totalBalance for every player this is updated and prev. value is used to add any left over value
            if (address(rewardTokens[i]) != address(0) && inboundToken != address(rewardTokens[i])) {
                grossRewardTokenAmount[i] = rewardTokens[i].balanceOf(address(this));
            }
        }

        // calculates the performance/admin fee (takes a cut - the admin percentage fee - from the pool's interest, strategy rewards).
        // calculates the "gameInterest" (net interest) that will be split among winners in the game
        // calculates the rewardTokenAmounts that will be split among winners in the game

        if (adminFee > 0) {
            _adminFeeAmount[0] = (grossInterest.mul(adminFee)).div(uint256(100));
            totalGameInterest = grossInterest.sub(_adminFeeAmount[0]);

            for (uint256 i = 0; i < rewardTokens.length; i++) {
                _adminFeeAmount[i + 1] = (grossRewardTokenAmount[i].mul(adminFee)).div(uint256(100));
                rewardTokenAmounts[i] = grossRewardTokenAmount[i].sub(_adminFeeAmount[i + 1]);
            }
        } else {
            totalGameInterest = grossInterest;
            for (uint256 i = 0; i < rewardTokens.length; i++) {
                rewardTokenAmounts[i] = grossRewardTokenAmount[i];
            }
        }

        // when there's no winners, admin takes all the interest + rewards
        if (winnerCount == 0 && !emergencyWithdraw) {
            adminFeeAmount[0] = grossInterest;
            for (uint256 i = 0; i < rewardTokens.length; i++) {
                adminFeeAmount[i + 1] = grossRewardTokenAmount[i];
            }
        } else if (adminFeeAmount[0] == 0) {
            adminFeeAmount[0] = _adminFeeAmount[0];
            for (uint256 i = 0; i < rewardTokens.length; i++) {
                adminFeeAmount[i + 1] = _adminFeeAmount[i + 1];
            }
        }

        // If there's an incentive token address defined, sets the total incentive amount to be distributed among winners.
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            // If there's an incentive token address defined, sets the total incentive amount to be distributed among winners.
            if (
                address(incentiveToken) != address(0) &&
                address(rewardTokens[i]) != address(incentiveToken) &&
                inboundToken != address(incentiveToken)
            ) {
                totalIncentiveAmount = IERC20(incentiveToken).balanceOf(address(this));
                break;
            }
        }

        emit FundsRedeemedFromExternalPool(
            isTransactionalToken ? address(this).balance : IERC20(inboundToken).balanceOf(address(this)),
            totalGamePrincipal,
            totalGameInterest,
            totalIncentiveAmount,
            rewardTokenAmounts
        );
    }

    // Fallback Functions for calldata and reciever for handling only ether transfer
    receive() external payable {
        if (!isTransactionalToken) {
                revert INVALID_TRANSACTIONAL_TOKEN_AMOUNT();
        }
    }
}
