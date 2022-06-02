const { ethers } = require("hardhat");
import * as chai from "chai";
import { assert } from "chai";
import { solidity } from "ethereum-waffle";
import { ERC20__factory } from "../src/types";
import {
  mintTokens,
  approveToken,
  deployPool,
  unableToJoinGame,
  joinGame,
  makeDeposit,
  redeem,
  shouldNotBeAbleToDeposit,
  joinGamePaySegmentsAndComplete,
  advanceToEndOfGame,
  joinGamePaySegmentsAndNotComplete,
  getRewardTokenInstance,
} from "./pool.utils";

chai.use(solidity);

const { expect } = chai;
const depositCount = 3;
const segmentLength = 600;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const segmentPayment = "10000000000000000000";
const maxPlayersCount = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
let contracts: any;

export const shouldBehaveLikeGGPool = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      false,
      false,
      0,
      strategyType,
      0,
      false,
    );
  });

  it("reverts if admin passes a invalid early withdraw fee while lowering it", async () => {
    await expect(contracts.goodGhosting.lowerEarlyWithdrawFees(90)).to.be.revertedWith("INVALID_EARLY_WITHDRAW_FEE");
  });

  it("admin is able to reduce early withdrawal fees", async () => {
    await contracts.goodGhosting.lowerEarlyWithdrawFees(0);
    const earlyWithdrawalFee = await contracts.goodGhosting.earlyWithdrawalFee();
    assert(earlyWithdrawalFee.eq(ethers.BigNumber.from(0)));
  });

  it("check if inbound and interest token have distinct addresses", async () => {
    const inBoundTokenAddress = contracts.inboundToken.address;
    let interestTokenAddress;
    if (strategyType === "aave" || strategyType === "aaveV3") {
      interestTokenAddress = contracts.lendingPool.address;
    } else if (strategyType === "curve") {
      interestTokenAddress = contracts.curvePool.address;
    } else if (strategyType === "mobius") {
      interestTokenAddress = contracts.mobiPool.address;
    } else {
      interestTokenAddress = ZERO_ADDRESS;
    }
    assert(
      inBoundTokenAddress !== interestTokenAddress,
      `Inbound Token ${inBoundTokenAddress} and Interest Token ${interestTokenAddress} shouldn't be the same address`,
    );
  });

  it("checks that the strategy contract has no token balance before the pool is deployed", async () => {
    const inBoundBalance = await contracts.inboundToken.balanceOf(contracts.strategy.address);
    let interestBalance;
    if (strategyType === "aave" || strategyType === "aaveV3") {
      interestBalance = await contracts.lendingPool.balanceOf(contracts.strategy.address);
    } else if (strategyType === "curve") {
      interestBalance = await contracts.curvePool.balanceOf(contracts.strategy.address);
    } else if (strategyType === "mobius") {
      interestBalance = await contracts.mobiPool.balanceOf(contracts.strategy.address);
    } else {
      interestBalance = 0;
    }
    assert(
      inBoundBalance.toNumber() === 0,
      `On start, smart contract's inbound balance should be 0 - got ${inBoundBalance.toNumber()}`,
    );
    assert(
      interestBalance.toNumber() === 0,
      `on start, smart contract's interest token balance should be 0 - got ${interestBalance.toNumber()}`,
    );
  });

  it("checks if player1 received minted Inbound tokens", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const usersDaiBalance = await contracts.inboundToken.balanceOf(player1.address);
    assert(
      ethers.BigNumber.from(parseInt(ethers.utils.formatEther(usersDaiBalance))).gte(ethers.BigNumber.from(1000)),
      `Player1 balance should be greater than or equal to 100 Inbound Token at start - current balance: ${usersDaiBalance}`,
    );
  });

  it("reverts if the admin triggers early game exit when no one has joined the game", async () => {
    await expect(contracts.goodGhosting.enableEmergencyWithdraw()).to.be.revertedWith("EARLY_EXIT_NOT_POSSIBLE()");
  });

  it("reverts if a player try to join a game after emergency withdraw has been called by the admin", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await contracts.goodGhosting.enableEmergencyWithdraw();
    await approveToken(contracts.inboundToken, player1, contracts.goodGhosting.address, segmentPayment);
    await expect(contracts.goodGhosting.connect(player1).joinGame(0, segmentPayment)).to.be.revertedWith(
      "GAME_COMPLETED()",
    );
  });

  it("reverts if admin calls the enableEmergencyWithdraw function multiple times", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await contracts.goodGhosting.enableEmergencyWithdraw();
    await expect(contracts.goodGhosting.enableEmergencyWithdraw()).to.be.revertedWith("GAME_COMPLETED()");
  });

  it("reverts if the contract is deployed with more than 100% early withdraw fee", async () => {
    await expect(
      deployPool(
        depositCount,
        segmentLength,
        segmentPayment,
        101,
        0,
        maxPlayersCount,
        true,
        false,
        true,
        false,
        false,
        false,
        0,
        strategyType,
        0,
        false,
      ),
    ).to.be.revertedWith("INVALID_EARLY_WITHDRAW_FEE()");
  });

  it("reverts if the contract is deployed with invalid inbound token address", async () => {
    await expect(
      deployPool(
        depositCount,
        segmentLength,
        segmentPayment,
        1,
        0,
        maxPlayersCount,
        false,
        false,
        true,
        false,
        false,
        false,
        0,
        strategyType,
        0,
        false,
      ),
    ).to.be.revertedWith("INVALID_INBOUND_TOKEN()");
  });

  it("reverts if the contract is deployed with invalid strategy address", async () => {
    await expect(
      deployPool(
        depositCount,
        segmentLength,
        segmentPayment,
        1,
        0,
        maxPlayersCount,
        true,
        false,
        false,
        false,
        false,
        false,
        0,
        strategyType,
        0,
        false,
      ),
    ).to.be.revertedWith("INVALID_STRATEGY()");
  });

  it("reverts if the contract is deployed with segment count as 0", async () => {
    await expect(
      deployPool(
        0,
        segmentLength,
        segmentPayment,
        1,
        0,
        maxPlayersCount,
        true,
        false,
        true,
        false,
        false,
        false,
        0,
        strategyType,
        0,
        false,
      ),
    ).to.be.revertedWith("INVALID_DEPOSIT_COUNT()");
  });

  it("reverts if the contract is deployed with segment length as 0", async () => {
    await expect(
      deployPool(
        depositCount,
        0,
        segmentPayment,
        1,
        0,
        maxPlayersCount,
        true,
        false,
        true,
        false,
        false,
        false,
        0,
        strategyType,
        0,
        false,
      ),
    ).to.be.revertedWith("INVALID_SEGMENT_LENGTH()");
  });

  it("reverts if the contract is deployed with segment payment as 0", async () => {
    await expect(
      deployPool(
        depositCount,
        segmentLength,
        0,
        1,
        0,
        maxPlayersCount,
        true,
        false,
        true,
        false,
        false,
        false,
        0,
        strategyType,
        0,
        false,
      ),
    ).to.be.revertedWith("INVALID_SEGMENT_PAYMENT()");
  });

  it("reverts if the contract is deployed with admin fee more than 100%", async () => {
    await expect(
      deployPool(
        depositCount,
        segmentLength,
        segmentPayment,
        1,
        101,
        maxPlayersCount,
        true,
        false,
        true,
        false,
        false,
        false,
        0,
        strategyType,
        0,
        false,
      ),
    ).to.be.revertedWith("INVALID_CUSTOM_FEE()");
  });

  it("reverts if the contract is deployed with max player count equal to zero", async () => {
    await expect(
      deployPool(
        depositCount,
        segmentLength,
        segmentPayment,
        1,
        0,
        "0",
        true,
        false,
        true,
        false,
        false,
        false,
        0,
        strategyType,
        0,
        false,
      ),
    ).to.be.revertedWith("INVALID_MAX_PLAYER_COUNT()");
  });

  it("accepts setting type(uint256).max as the max number of players", async () => {
    const contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      false,
      false,
      0,
      strategyType,
      0,
      false,
    );
    const expectedValue = ethers.BigNumber.from(2).pow(ethers.BigNumber.from(256)).sub(ethers.BigNumber.from(1));

    const result = ethers.BigNumber.from(await contracts.goodGhosting.maxPlayersCount());
    assert(expectedValue.eq(result), "expected max number of players to equal type(uint256).max");
  });

  it("checks if the contract's variables were properly initialized", async () => {
    const inboundCurrencyResult = await contracts.goodGhosting.inboundToken();
    const lastSegmentResult = await contracts.goodGhosting.depositCount();
    const segmentLengthResult = await contracts.goodGhosting.segmentLength();
    const segmentPaymentResult = await contracts.goodGhosting.segmentPayment();
    const earlyWithdrawFee = await contracts.goodGhosting.earlyWithdrawalFee();
    const adminFee = await contracts.goodGhosting.adminFee();
    const maxPlayersCountResult = await contracts.goodGhosting.maxPlayersCount();
    assert(
      ethers.BigNumber.from(earlyWithdrawFee).eq(ethers.BigNumber.from(1)),
      `Early Withdraw Fee doesn't match, expected 10 got ${earlyWithdrawFee}`,
    );
    assert(
      ethers.BigNumber.from(adminFee).eq(ethers.BigNumber.from(1)),
      `Admin Fee doesn't match, expected 1 got ${adminFee}`,
    );
    assert(
      inboundCurrencyResult === contracts.inboundToken.address,
      `Inbound currency doesn't match. expected ${contracts.inboundToken.address}; got ${inboundCurrencyResult}`,
    );
    assert(
      ethers.BigNumber.from(lastSegmentResult).eq(ethers.BigNumber.from(depositCount)),
      `LastSegment info doesn't match. expected ${depositCount}; got ${lastSegmentResult}`,
    );
    assert(
      ethers.BigNumber.from(segmentLengthResult).eq(ethers.BigNumber.from(segmentLength)),
      `SegmentLength doesn't match. expected ${segmentLength}; got ${segmentLengthResult}`,
    );
    assert(
      ethers.BigNumber.from(segmentPaymentResult).eq(ethers.BigNumber.from(segmentPayment)),
      `SegmentPayment doesn't match. expected ${segmentPayment}; got ${segmentPaymentResult}`,
    );
    assert(
      ethers.BigNumber.from(maxPlayersCountResult).eq(maxPlayersCount),
      `MaxPlayersCount doesn't match. expected ${maxPlayersCount.toString()}; got ${maxPlayersCountResult}`,
    );
  });

  it("checks if game starts at segment zero", async () => {
    const expectedSegment = ethers.BigNumber.from(0);
    const result = await contracts.goodGhosting.getCurrentSegment();
    assert(
      result.eq(ethers.BigNumber.from(0)),
      `should start at segment ${expectedSegment} but started at ${result.toNumber()} instead.`,
    );
  });

  it("checks if the game segments increase", async () => {
    let result: any = -1;
    for (let expectedSegment = 0; expectedSegment <= depositCount; expectedSegment++) {
      result = await contracts.goodGhosting.getCurrentSegment();
      assert(
        result.eq(ethers.BigNumber.from(expectedSegment)),
        `expected segment ${expectedSegment} actual ${result.toNumber()}`,
      );
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
    }
  });

  it("checks if the game completes when last segment completes", async () => {
    let result: any = -1;
    let currentSegment: any = -1;

    async function checksCompletion(expected: any, errorMsg: string) {
      currentSegment = await contracts.goodGhosting.getCurrentSegment();
      result = await contracts.goodGhosting.isGameCompleted();
      assert(result === expected, errorMsg);
    }

    for (let i = 0; i <= depositCount; i++) {
      await checksCompletion(false, `game completed prior than expected; current segment: ${currentSegment}`);
      if (i == depositCount) {
        const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
        await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
        await ethers.provider.send("evm_mine", []);
      } else {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
      }
    }

    await checksCompletion(true, `game did not completed after last segment: ${currentSegment}`);
  });

  it("does not revert when admin invokes pause()", async () => {
    await contracts.goodGhosting.pause();
  });

  it("does not revert when admin invokes unpause()", async () => {
    await contracts.goodGhosting.pause();
    await contracts.goodGhosting.unpause();
  });

  it("reverts when non-admin invokes pause()", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await expect(contracts.goodGhosting.connect(player1).pause()).to.be.revertedWith(
      "Ownable: caller is not the owner",
    );
  });

  it("reverts when non-admin invokes unpause()", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await contracts.goodGhosting.pause();
    await expect(contracts.goodGhosting.connect(player1).unpause()).to.be.revertedWith(
      "Ownable: caller is not the owner",
    );
  });

  it("pauses the contract", async () => {
    await contracts.goodGhosting.pause();
    const result = await contracts.goodGhosting.paused();
    assert(result, "contract is not paused");
  });

  it("unpauses the contract", async () => {
    await contracts.goodGhosting.pause();
    await contracts.goodGhosting.unpause();
    const result = await contracts.goodGhosting.pause();
    assert(result, "contract is paused");
  });

  it("reverts when admins tries to renounceOwnership without unlocking it first", async () => {
    await expect(contracts.goodGhosting.renounceOwnership()).to.be.revertedWith("RENOUNCE_OWNERSHIP_NOT_ALLOWED()");
  });

  it("allows admin to renounceOwnership after unlocking it first", async () => {
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
    const accounts = await ethers.getSigners();
    await contracts.goodGhosting.unlockRenounceOwnership();
    const currentOwner = await contracts.goodGhosting.owner();
    assert(currentOwner, accounts[0]);
    await contracts.goodGhosting.renounceOwnership();
    const newOwner = await contracts.goodGhosting.owner();
    assert(newOwner, ZERO_ADDRESS);
  });
};

export const shouldBehaveLikeJoiningGGPool = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      false,
      false,
      1,
      strategyType,
      0,
      false,
    );
  });

  it("reverts if transactional token is sent while joining when the transactional token flag is false", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];

    await expect(
      contracts.goodGhosting.connect(player1).joinGame(0, segmentPayment, { value: segmentPayment }),
    ).to.be.revertedWith("INVALID_TRANSACTIONAL_TOKEN_AMOUNT()");
  });

  it("reverts if the contract is paused", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];

    await contracts.goodGhosting.pause();
    await unableToJoinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentPayment,
      "Pausable: paused",
    );
  });

  it("reverts if user does not approve the contract to spend dai", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await expect(contracts.goodGhosting.connect(player1).joinGame(0, segmentPayment)).to.be.reverted;
  });

  it("reverts if the user tries to join the game twice", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await unableToJoinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentPayment,
      "PLAYER_ALREADY_JOINED()",
    );
  });

  it("reverts if more players than maxPlayersCount try to join", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];
    const player2 = accounts[3];

    const contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      2,
      true,
      false,
      true,
      false,
      false,
      false,
      0,
      strategyType,
      0,
      false,
    );

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);

    await mintTokens(contracts.inboundToken, deployer.address);
    await unableToJoinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      deployer,
      segmentPayment,
      segmentPayment,
      "MAX_PLAYER_COUNT_REACHED()",
    );
  });

  it("players are able to withdraw if admin enables emergency withdraw during the joining segment", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];
    let governanceTokenPlayer1BalanceAfterWithdraw = 0,
      governanceTokenPlayer2BalanceAfterWithdraw = 0,
      rewardTokenPlayer1BalanceAfterWithdraw = 0,
      rewardTokenPlayer2BalanceAfterWithdraw = 0,
      governanceTokenPlayer1BalanceBeforeWithdraw = 0,
      governanceTokenPlayer2BalanceBeforeWithdraw = 0,
      rewardTokenPlayer1BalanceBeforeWithdraw = 0,
      rewardTokenPlayer2BalanceBeforeWithdraw = 0;

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await contracts.goodGhosting.enableEmergencyWithdraw();

    if (strategyType === "curve") {
      governanceTokenPlayer1BalanceBeforeWithdraw = await contracts.curve.balanceOf(player1.address);
      governanceTokenPlayer2BalanceBeforeWithdraw = await contracts.curve.balanceOf(player2.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenPlayer1BalanceBeforeWithdraw = await contracts.mobi.balanceOf(player1.address);
      governanceTokenPlayer2BalanceBeforeWithdraw = await contracts.mobi.balanceOf(player2.address);
    }

    const rewardTokenInstance = await getRewardTokenInstance(contracts.strategy, player1);

    rewardTokenPlayer1BalanceBeforeWithdraw = await rewardTokenInstance.balanceOf(player1.address);
    rewardTokenPlayer2BalanceBeforeWithdraw = await rewardTokenInstance.balanceOf(player2.address);

    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);

    await contracts.goodGhosting.connect(player1).withdraw(0);
    await contracts.goodGhosting.connect(player2).withdraw(0);

    if (strategyType === "curve") {
      governanceTokenPlayer1BalanceAfterWithdraw = await contracts.curve.balanceOf(player1.address);
      governanceTokenPlayer2BalanceAfterWithdraw = await contracts.curve.balanceOf(player2.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenPlayer1BalanceAfterWithdraw = await contracts.mobi.balanceOf(player1.address);
      governanceTokenPlayer2BalanceAfterWithdraw = await contracts.mobi.balanceOf(player2.address);
    }
    rewardTokenPlayer1BalanceAfterWithdraw = await rewardTokenInstance.balanceOf(player1.address);
    rewardTokenPlayer2BalanceAfterWithdraw = await rewardTokenInstance.balanceOf(player2.address);

    assert(
      ethers.BigNumber.from(rewardTokenPlayer1BalanceAfterWithdraw).gt(
        ethers.BigNumber.from(rewardTokenPlayer1BalanceBeforeWithdraw),
      ),
    );

    assert(
      ethers.BigNumber.from(rewardTokenPlayer2BalanceAfterWithdraw).gt(
        ethers.BigNumber.from(rewardTokenPlayer2BalanceBeforeWithdraw),
      ),
    );
    if (strategyType === "curve" || strategyType === "mobius") {
      assert(
        ethers.BigNumber.from(governanceTokenPlayer1BalanceAfterWithdraw).gt(
          ethers.BigNumber.from(governanceTokenPlayer1BalanceBeforeWithdraw),
        ),
      );
      assert(
        ethers.BigNumber.from(governanceTokenPlayer2BalanceAfterWithdraw).gt(
          ethers.BigNumber.from(governanceTokenPlayer2BalanceBeforeWithdraw),
        ),
      );
    }
  });

  it("player withdrawal segment is updated correctly", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
    const playerInfo = await contracts.goodGhosting.players(player1.address);
    assert(playerInfo.withdrawalSegment.eq(ethers.BigNumber.from(0)));
  });

  it("increases activePlayersCount when a new player joins", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const playerCountBefore = await contracts.goodGhosting.activePlayersCount();
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    const playerCountAfter = await contracts.goodGhosting.activePlayersCount();
    assert(playerCountAfter.eq(playerCountBefore.add(ethers.BigNumber.from(1))));
  });

  it("second player can join after cap spot (maxPlayersCount) is open by an early withdraw", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];
    const player2 = accounts[3];
    const contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      2,
      true,
      false,
      true,
      false,
      false,
      false,
      0,
      strategyType,
      0,
      false,
    );

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);

    await mintTokens(contracts.inboundToken, deployer.address);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, deployer, segmentPayment, segmentPayment);
  });

  it("early withdraw player can rejoin if spot (maxPlayersCount) is available", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];
    const player2 = accounts[3];

    const contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      2,
      true,
      false,
      true,
      false,
      false,
      false,
      0,
      strategyType,
      0,
      false,
    );

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    await mintTokens(contracts.inboundToken, deployer.address);
    await unableToJoinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      deployer,
      segmentPayment,
      segmentPayment,
      "MAX_PLAYER_COUNT_REACHED()",
    );
  });

  it("stores the player(s) who joined the game", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    // // Player1 joins the game
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    for (let j = 0; j < 10; j++) {
      await ethers.provider.send("evm_mine", []);
    }

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);

    // Reads stored players and compares against player1 and player2
    // Remember: "iterablePlayers" is an array, so we need to pass the index we want to retrieve.
    const storedPlayer1 = await contracts.goodGhosting.iterablePlayers(0);
    const storedPlayer2 = await contracts.goodGhosting.iterablePlayers(1);
    assert(storedPlayer1 === player1.address);
    assert(storedPlayer2 === player2.address);

    // Checks player's info stored in the struct.
    const playerInfo1 = await contracts.goodGhosting.players(player1.address);
    assert(playerInfo1.mostRecentSegmentPaid.eq(ethers.BigNumber.from(0)));
    assert(playerInfo1.amountPaid.eq(segmentPayment));
    assert(playerInfo1.canRejoin === false, strategyType);
    assert(playerInfo1.withdrawn === false, strategyType);

    const playerInfo2 = await contracts.goodGhosting.players(player2.address);
    assert(playerInfo2.mostRecentSegmentPaid.eq(ethers.BigNumber.from(0)));
    assert(playerInfo2.amountPaid.eq(segmentPayment));
    assert(playerInfo2.canRejoin === false, strategyType);
    assert(playerInfo2.withdrawn === false, strategyType);
  });

  it("transfers the first payment to the contract", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    // Player1 joins the game
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    let contractsDaiBalance;
    if (strategyType === "aave" || strategyType === "aaveV3") {
      contractsDaiBalance = await contracts.lendingPool.balanceOf(contracts.strategy.address);
    } else if (strategyType === "curve") {
      contractsDaiBalance = await contracts.curveGauge.balanceOf(contracts.strategy.address);
    } else if (strategyType === "mobius") {
      contractsDaiBalance = await contracts.mobiGauge.balanceOf(contracts.strategy.address);
    } else {
      contractsDaiBalance = await contracts.inboundToken.balanceOf(contracts.strategy.address);
    }
    assert(
      contractsDaiBalance.lte(segmentPayment) && contractsDaiBalance.gt(ethers.BigNumber.from(0)),
      "Contract balance should increase when user joins the game",
    );
  });

  it("emits the event JoinedGame", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];

    await approveToken(contracts.inboundToken, player1, contracts.goodGhosting.address, segmentPayment);
    await expect(contracts.goodGhosting.connect(player1).joinGame(0, segmentPayment))
      .to.emit(contracts.goodGhosting, "JoinedGame")
      .withArgs(player1.address, ethers.BigNumber.from(segmentPayment));
  });
};

export const shouldBehaveLikeReJoiningGGPool = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      false,
      false,
      0,
      strategyType,
      0,
      false,
    );
  });
  it("reverts if a user tries to rejoin the game in segment 0 without doing an early withdraw", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await unableToJoinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentPayment,
      "PLAYER_ALREADY_JOINED()",
    );
  });

  it("user can rejoin the game on segment 0 after an early withdrawal", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
  });

  it("does not increase the number of players when a user rejoins the game on segment 0 after an early withdrawal", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    const numPlayers = await contracts.goodGhosting.getNumberOfPlayers();
    assert(numPlayers.eq(ethers.BigNumber.from(2)));
  });

  it("verifies the player info stored in the contract after user rejoins after an early withdraw", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
    const playerIndexBeforeRejoin = await contracts.goodGhosting.playerIndex(player1.address, 0);
    assert(playerIndexBeforeRejoin.eq(0));

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    const playerInfo = await contracts.goodGhosting.players(player1.address);
    assert(playerInfo.mostRecentSegmentPaid.eq(ethers.BigNumber.from(0)));
    assert(playerInfo.amountPaid.eq(segmentPayment));
    assert(playerInfo.canRejoin === false, strategyType);
    assert(playerInfo.withdrawn === false, strategyType);
    const playerIndexAfterRejoin = await contracts.goodGhosting.playerIndex(player1.address, 0);
    assert(playerIndexAfterRejoin.gt(playerIndexBeforeRejoin));
  });
};

export const shouldBehaveLikeDepositingGGPool = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      false,
      false,
      0,
      strategyType,
      0,
      false,
    );
  });

  it("reverts if transactional token is sent while depositing when the transactional token flag is false", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    // Advances to last segment
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);

    await expect(
      contracts.goodGhosting.connect(player1).makeDeposit(0, segmentPayment, { value: segmentPayment }),
    ).to.be.revertedWith("INVALID_TRANSACTIONAL_TOKEN_AMOUNT()");
  });

  it("reverts if the contract is paused", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await contracts.goodGhosting.pause();
    await shouldNotBeAbleToDeposit(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentPayment,
      "Pausable: paused",
    );
  });

  it("reverts if user didn't join the game", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await shouldNotBeAbleToDeposit(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentPayment,
      "NOT_PLAYER()",
    );
  });

  it("reverts if user tries to deposit during segment 0", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await shouldNotBeAbleToDeposit(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentPayment,
      "DEPOSIT_NOT_ALLOWED()",
    );
  });

  it("reverts if user is making a deposit during segment n (last segment)", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    // Advances to last segment
    await ethers.provider.send("evm_increaseTime", [segmentLength * depositCount]);
    await ethers.provider.send("evm_mine", []);

    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);
    await shouldNotBeAbleToDeposit(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentPayment,
      "DEPOSIT_NOT_ALLOWED()",
    );
  });

  it("reverts if user tries to deposit after the game ends", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await shouldNotBeAbleToDeposit(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentPayment,
      "DEPOSIT_NOT_ALLOWED()",
    );
  });

  it("reverts if user is making a duplicated deposit for the same segment", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    // Moves to the next segment
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await shouldNotBeAbleToDeposit(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentPayment,
      "PLAYER_ALREADY_PAID_IN_CURRENT_SEGMENT()",
    );
  });

  it("makes sure the segment counter get's updated correctly", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    let segmentCounter = await contracts.goodGhosting.segmentCounter(0);
    assert(segmentCounter.eq(2));
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    segmentCounter = await contracts.goodGhosting.segmentCounter(1);
    assert(segmentCounter.eq(2));
    segmentCounter = await contracts.goodGhosting.segmentCounter(0);
    assert(segmentCounter.eq(0));
  });

  it("user can deposit successfully if all requirements are met", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    await approveToken(contracts.inboundToken, player1, contracts.goodGhosting.address, segmentPayment);
    const currentSegment = await contracts.goodGhosting.getCurrentSegment();
    await expect(contracts.goodGhosting.connect(player1).makeDeposit(0, segmentPayment))
      .to.emit(contracts.goodGhosting, "Deposit")
      .withArgs(
        player1.address,
        currentSegment,
        ethers.BigNumber.from(segmentPayment),
        ethers.BigNumber.from(segmentPayment),
      );
  });

  it("transfers the payment to the contract", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const expectedBalance = ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from(2));
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    let contractsDaiBalance;
    if (strategyType === "aave" || strategyType === "aaveV3") {
      contractsDaiBalance = await contracts.lendingPool.balanceOf(contracts.strategy.address);
    } else if (strategyType === "curve") {
      contractsDaiBalance = await contracts.curveGauge.balanceOf(contracts.strategy.address);
    } else if (strategyType === "mobius") {
      contractsDaiBalance = await contracts.mobiGauge.balanceOf(contracts.strategy.address);
    } else {
      contractsDaiBalance = await contracts.inboundToken.balanceOf(contracts.strategy.address);
    }
    assert(
      expectedBalance.gte(contractsDaiBalance) && contractsDaiBalance.gt(ethers.BigNumber.from(0)),
      "Contract balance should increase when user deposits",
    );
  });

  it("makes sure the total principal amount increases", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    await approveToken(contracts.inboundToken, player1, contracts.goodGhosting.address, segmentPayment);
    const principalBeforeDeposit = await contracts.goodGhosting.totalGamePrincipal();
    await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    const principalAfterDeposit = await contracts.goodGhosting.totalGamePrincipal();
    const difference = principalAfterDeposit.sub(principalBeforeDeposit);
    assert(difference.eq(segmentPayment));
  });

  it("makes sure the player info stored in contract is updated", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    const playerIndexBeforeDeposit = await contracts.goodGhosting.playerIndex(player1.address, 0);

    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    const playerInfo = await contracts.goodGhosting.players(player1.address);
    assert(playerInfo.mostRecentSegmentPaid.eq(ethers.BigNumber.from(1)));
    assert(playerInfo.amountPaid.eq(ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from(2))));
    assert(playerInfo.canRejoin === false, strategyType);
    assert(playerInfo.withdrawn === false, strategyType);
    const playerIndexAfterDeposit = await contracts.goodGhosting.playerIndex(player1.address, 1);

    assert(playerIndexAfterDeposit.add(playerIndexBeforeDeposit).gt(playerIndexBeforeDeposit));
  });
};

export const shouldBehaveLikeEarlyWithdrawingGGPool = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      false,
      false,
      1,
      strategyType,
      0,
      false,
    );
  });
  it("reverts if the contract is paused", async () => {
    await contracts.goodGhosting.pause();
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await expect(contracts.goodGhosting.connect(player1).earlyWithdraw(0)).to.be.revertedWith("Pausable: paused");
  });

  it("reverts if the game is completed", async () => {
    await advanceToEndOfGame(contracts.goodGhosting, segmentLength, depositCount);
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await expect(contracts.goodGhosting.connect(player1).earlyWithdraw(0)).to.be.revertedWith("GAME_COMPLETED()");
  });

  it("reverts if a non-player tries to withdraw", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await expect(contracts.goodGhosting.connect(player2).earlyWithdraw(0)).to.be.revertedWith(
      "PLAYER_DOES_NOT_EXIST()",
    );
  });

  it("makes sure the segment counter get's updated correctly when user earlywithdraws", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
    let segmentCounter = await contracts.goodGhosting.segmentCounter(0);
    assert(segmentCounter.eq(1));
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    segmentCounter = await contracts.goodGhosting.segmentCounter(1);
    assert(segmentCounter.eq(1));
    segmentCounter = await contracts.goodGhosting.segmentCounter(0);
    assert(segmentCounter.eq(0));
  });

  it("sets withdrawn flag to true after user withdraws before end of game", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);

    const player1Result = await contracts.goodGhosting.players(player1.address);
    assert(player1Result.withdrawn);
  });

  it("reverts if user tries to withdraw more than once", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
    await expect(contracts.goodGhosting.connect(player1).earlyWithdraw(0)).to.be.revertedWith(
      "PLAYER_ALREADY_WITHDREW_EARLY()",
    );
  });

  it("withdraws user balance subtracted by early withdraw fee", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    // Expect Player1 to get back their deposit minus the early withdraw fee defined in the constructor.
    const player1PreWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
    await contracts.goodGhosting.connect(player1).earlyWithdraw("90");
    const player1PostWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
    const feeAmount = ethers.BigNumber.from(segmentPayment)
      .mul(ethers.BigNumber.from(1))
      .div(ethers.BigNumber.from(100)); // fee is set as an integer, so needs to be converted to a percentage

    assert(
      player1PostWithdrawBalance
        .sub(player1PreWithdrawBalance)
        .eq(ethers.BigNumber.from(segmentPayment).sub(feeAmount)),
    );
  });

  it("fee collected from early withdrawal is part of segment deposit so it should generate interest", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);

    const principalAmountBeforeWithdraw = await contracts.goodGhosting.totalGamePrincipal();
    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
    const principalAmount = await contracts.goodGhosting.totalGamePrincipal();
    // the principal amount when deducted during an early withdraw does not include fees since the fee goes to admin if there are no winners or is admin fee % > 0
    // so we check since segment deposit funds do generate interest so we check that segment deposit should be more than the principal
    assert(principalAmountBeforeWithdraw.gt(principalAmount));
  });

  it("withdraws user balance subtracted by early withdraw fee when not enough withdrawable balance in the contract", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    // Expect Player1 to get back their deposit minus the early withdraw fee defined in the constructor.
    const player1PreWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
    await contracts.goodGhosting.connect(player1).earlyWithdraw("90");
    const player1PostWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
    const feeAmount = ethers.BigNumber.from(segmentPayment)
      .mul(ethers.BigNumber.from(1))
      .div(ethers.BigNumber.from(100)); // fee is set as an integer, so needs to be converted to a percentage
    assert(
      player1PostWithdrawBalance
        .sub(player1PreWithdrawBalance)
        .eq(ethers.BigNumber.from(segmentPayment).sub(feeAmount)),
    );
  });

  it("emits EarlyWithdrawal event when user withdraws before end of game", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    const feeAmount = ethers.BigNumber.from(segmentPayment)
      .mul(ethers.BigNumber.from(1))
      .div(ethers.BigNumber.from(100)); // fee is set as an integer, so needs to be converted to a percentage
    const playerInfo = await contracts.goodGhosting.players(player1.address);

    await expect(contracts.goodGhosting.connect(player1).earlyWithdraw(0))
      .to.emit(contracts.goodGhosting, "EarlyWithdrawal")
      .withArgs(
        player1.address,
        playerInfo.amountPaid.sub(feeAmount),
        ethers.BigNumber.from(0),
        ethers.BigNumber.from(0),
      );
  });

  it("user is able to withdraw in the last segment", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    // fee is set as an integer, so needs to be converted to a percentage

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      if (index === depositCount - 1) {
        const playerInfo = await contracts.goodGhosting.players(player1.address);

        const feeAmount = ethers.BigNumber.from(playerInfo.amountPaid)
          .mul(ethers.BigNumber.from(1))
          .div(ethers.BigNumber.from(100));
        await expect(contracts.goodGhosting.connect(player1).earlyWithdraw(0))
          .to.emit(contracts.goodGhosting, "EarlyWithdrawal")
          .withArgs(
            player1.address,
            playerInfo.amountPaid.sub(feeAmount),
            ethers.BigNumber.from(0),
            ethers.BigNumber.from(0),
          );
      } else {
        // protocol deposit of the prev. deposit
        await approveToken(contracts.inboundToken, player1, contracts.goodGhosting.address, segmentPayment);
        await contracts.goodGhosting.connect(player1).makeDeposit(0, segmentPayment);
      }
    }
  });

  it("user is able to early withdraw in the waiting round", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    // fee is set as an integer, so needs to be converted to a percentage

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      // protocol deposit of the prev. deposit
      await approveToken(contracts.inboundToken, player1, contracts.goodGhosting.address, segmentPayment);
      await contracts.goodGhosting.connect(player1).makeDeposit(0, segmentPayment);
    }
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);

    const playerInfo = await contracts.goodGhosting.players(player1.address);

    const feeAmount = ethers.BigNumber.from(playerInfo.amountPaid)
      .mul(ethers.BigNumber.from(1))
      .div(ethers.BigNumber.from(100));
    await expect(contracts.goodGhosting.connect(player1).earlyWithdraw(0))
      .to.emit(contracts.goodGhosting, "EarlyWithdrawal")
      .withArgs(
        player1.address,
        playerInfo.amountPaid.sub(feeAmount),
        ethers.BigNumber.from(0),
        ethers.BigNumber.from(0),
      );
  });

  if (strategyType === "curve" || strategyType === "mobius") {
    it("user is able to do an early withdraw if there is an impermanent loss", async () => {
      const accounts = await ethers.getSigners();
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);

      // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await approveToken(contracts.inboundToken, player1, contracts.goodGhosting.address, segmentPayment);
        await contracts.goodGhosting.connect(player1).makeDeposit(0, segmentPayment);
        // protocol deposit of the prev. deposit
        await approveToken(contracts.inboundToken, player2, contracts.goodGhosting.address, segmentPayment);
        await contracts.goodGhosting.connect(player2).makeDeposit(0, segmentPayment);
      }
      const player1Info = await contracts.goodGhosting.players(player1.address);

      // impermanent loss amount defined in mock contracts
      const impermanentLossAmount = "6000000000000000000";
      await expect(contracts.goodGhosting.connect(player1).earlyWithdraw("900000000000000000"))
        .to.emit(contracts.goodGhosting, "EarlyWithdrawal")
        .withArgs(player1.address, impermanentLossAmount, player1Info.amountPaid, player1Info.netAmountPaid);
    });
  }

  it("user is able to withdraw in the last segment when 2 players join the game and one of them early withdraws when the segment amount is less than withdraw amount", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);

    // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await approveToken(contracts.inboundToken, player1, contracts.goodGhosting.address, segmentPayment);
      await contracts.goodGhosting.connect(player1).makeDeposit(0, segmentPayment);
      // protocol deposit of the prev. deposit
      await approveToken(contracts.inboundToken, player2, contracts.goodGhosting.address, segmentPayment);
      await contracts.goodGhosting.connect(player2).makeDeposit(0, segmentPayment);
    }
    const player1Info = await contracts.goodGhosting.players(player1.address);
    const player2Info = await contracts.goodGhosting.players(player2.address);

    const feeAmount = player1Info.amountPaid.mul(ethers.BigNumber.from(1)).div(ethers.BigNumber.from(100));
    await expect(contracts.goodGhosting.connect(player1).earlyWithdraw(0))
      .to.emit(contracts.goodGhosting, "EarlyWithdrawal")
      .withArgs(
        player1.address,
        player1Info.amountPaid.sub(feeAmount),
        player2Info.amountPaid,
        player2Info.netAmountPaid,
      );
  });

  it("reduces winner count when there are 2 player in the pool and one of them withdrew early in the last segment", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);

    // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    const winnerCountBeforeWithdraw = await contracts.goodGhosting.winnerCount();
    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
    const winnerCountAfterWithdraw = await contracts.goodGhosting.winnerCount();
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    assert(winnerCountBeforeWithdraw.eq(ethers.BigNumber.from(2)));
    assert(winnerCountAfterWithdraw.eq(ethers.BigNumber.from(1)));
  });

  it("reduces player index when there are 2 player in the pool and one of them withdrew early in the last segment", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);

    // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    const currentSegment = await contracts.goodGhosting.getCurrentSegment();
    const cumalativePlayerIndexBeforeWithdraw = await contracts.goodGhosting.cumulativePlayerIndexSum(
      currentSegment - 1,
    );
    const player1Info = await contracts.goodGhosting.players(player1.address);
    const player2Info = await contracts.goodGhosting.players(player2.address);
    let cummalativePlayer1IndexBeforeWithdraw = ethers.BigNumber.from(0),
      cummalativePlayer2IndexBeforeWithdraw = ethers.BigNumber.from(0);
    for (let i = 0; i <= player1Info.mostRecentSegmentPaid; i++) {
      let index1 = await contracts.goodGhosting.playerIndex(player1.address, i);
      cummalativePlayer1IndexBeforeWithdraw = cummalativePlayer1IndexBeforeWithdraw.add(
        ethers.BigNumber.from(index1.toString()),
      );
    }

    for (let i = 0; i <= player2Info.mostRecentSegmentPaid; i++) {
      let index2 = await contracts.goodGhosting.playerIndex(player2.address, i);
      cummalativePlayer2IndexBeforeWithdraw = cummalativePlayer2IndexBeforeWithdraw.add(
        ethers.BigNumber.from(index2.toString()),
      );
    }

    assert(
      cumalativePlayerIndexBeforeWithdraw.eq(
        ethers.BigNumber.from(cummalativePlayer1IndexBeforeWithdraw).add(
          ethers.BigNumber.from(cummalativePlayer2IndexBeforeWithdraw),
        ),
      ),
    );
    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
    const cumalativePlayerIndexAfterWithdraw = await contracts.goodGhosting.cumulativePlayerIndexSum(
      currentSegment - 1,
    );
    assert(cumalativePlayerIndexAfterWithdraw.eq(cummalativePlayer2IndexBeforeWithdraw));
  });
};

export const shouldBehaveLikeRedeemingFromGGPool = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      false,
      false,
      1,
      strategyType,
      0,
      false,
    );
  });
  it("reverts if game is not completed", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await expect(
      contracts.goodGhosting.connect(player1).redeemFromExternalPoolForFixedDepositPool(0),
    ).to.be.revertedWith("GAME_NOT_COMPLETED()");
  });

  it("reverts if funds are already redeemed", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await redeem(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      segmentPayment,
    );
    await expect(contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0)).to.be.revertedWith(
      "FUNDS_REDEEMED_FROM_EXTERNAL_POOL()",
    );
  });

  it("reverts if the incentive token is same as the inbound or reward token", async () => {
    await expect(contracts.goodGhosting.setIncentiveToken(contracts.inboundToken.address)).to.be.revertedWith(
      "INVALID_INCENTIVE_TOKEN()",
    );
  });

  it("allows anyone to redeem from external pool when game is completed", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await redeem(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      segmentPayment,
    );
  });

  it("transfer funds to contract then redeems from external pool", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const expectedBalance = ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from(depositCount));
    await redeem(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      segmentPayment,
    );
    const contractsDaiBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
    // No interest is generated during tests so far, so contract balance must equals the amount deposited.
    assert(expectedBalance.eq(contractsDaiBalance));
  });

  it("make sure no rewards are claimed if admin enables the reward disable flag", async () => {
    const accounts = await ethers.getSigners();
    let governanceTokenRewards = 0;
    const player1 = accounts[2];
    await contracts.goodGhosting.disableClaimingRewardTokens();

    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool("90");
    if (strategyType === "curve") {
      governanceTokenRewards = await contracts.curve.balanceOf(contracts.goodGhosting.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenRewards = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
    }
    assert(ethers.BigNumber.from(governanceTokenRewards).eq(ethers.BigNumber.from(0)));
    const rewardTokenBalance = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);
    assert(ethers.BigNumber.from(rewardTokenBalance).eq(ethers.BigNumber.from(0)));
  });

  it("emits event FundsRedeemedFromExternalPool when redeem is successful", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    let governanceTokenRewards = 0;
    let adminGovernanceTokenFee = 0;
    const player1 = accounts[2];
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await mintTokens(contracts.inboundToken, deployer.address);

    if (strategyType === "aave" || strategyType === "aaveV3") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
      await contracts.lendingPool
        .connect(deployer)
        .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
      const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

      await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
    } else if (strategyType === "curve") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.curvePool.address, ethers.utils.parseEther("100000"));
      const poolTokenBalance = await contracts.curvePool.balanceOf(deployer.address);

      await contracts.curvePool.connect(deployer).transfer(contracts.strategy.address, poolTokenBalance.toString());
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    const result = await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool("90");

    if (strategyType === "curve") {
      governanceTokenRewards = await contracts.curve.balanceOf(contracts.goodGhosting.address);
      adminGovernanceTokenFee = ethers.BigNumber.from(governanceTokenRewards)
        .mul(ethers.BigNumber.from(1))
        .div(ethers.BigNumber.from(100));
    } else if (strategyType === "mobius") {
      governanceTokenRewards = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
      adminGovernanceTokenFee = ethers.BigNumber.from(governanceTokenRewards)
        .mul(ethers.BigNumber.from(1))
        .div(ethers.BigNumber.from(100));
    }
    const totalPrincipal = ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from(depositCount));
    const contractsDaiBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
    const adminFeeAmount = ethers.BigNumber.from(contractsDaiBalance)
      .sub(totalPrincipal)
      .mul(ethers.BigNumber.from(1))
      .div(ethers.BigNumber.from(100));
    const expectedInterestValue = ethers.BigNumber.from(contractsDaiBalance).sub(totalPrincipal).sub(adminFeeAmount);
    const rewardTokenBalance = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);
    const adminRewardFeeAmount = ethers.BigNumber.from(rewardTokenBalance)
      .mul(ethers.BigNumber.from(1))
      .div(ethers.BigNumber.from(100));

    const rewardAmounts: any = [];
    rewardAmounts[0] = ethers.BigNumber.from(rewardTokenBalance)
      .sub(ethers.BigNumber.from(adminRewardFeeAmount))
      .toString();
    if (strategyType !== "aave" && strategyType !== "aaveV3" && strategyType !== "no_strategy") {
      rewardAmounts[1] = ethers.BigNumber.from(governanceTokenRewards)
        .sub(ethers.BigNumber.from(adminGovernanceTokenFee))
        .toString();
    }

    await expect(result)
      .to.emit(contracts.goodGhosting, "FundsRedeemedFromExternalPool")
      .withArgs(
        ethers.BigNumber.from(contractsDaiBalance),
        totalPrincipal,
        expectedInterestValue,
        ethers.BigNumber.from(0),
        rewardAmounts,
      );
  });

  it("checks the interest is updated correctly when admin fees is more than 0%", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    const player1 = accounts[2];
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await mintTokens(contracts.inboundToken, deployer.address);

    if (strategyType === "aave" || strategyType === "aaveV3") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
      await contracts.lendingPool
        .connect(deployer)
        .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
      const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

      await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
    } else if (strategyType === "curve") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.curvePool.address, ethers.utils.parseEther("100000"));
      const poolTokenBalance = await contracts.curvePool.balanceOf(deployer.address);

      await contracts.curvePool.connect(deployer).transfer(contracts.strategy.address, poolTokenBalance.toString());
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool("90");
    const contractsDaiBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
    const principalAmount = await contracts.goodGhosting.totalGamePrincipal();
    const totalInterest = await contracts.goodGhosting.totalGameInterest();
    const adminFeeAmount = ethers.BigNumber.from(contractsDaiBalance)
      .sub(ethers.BigNumber.from(principalAmount))
      .mul(ethers.BigNumber.from(1))
      .div(ethers.BigNumber.from(100));
    const expectedValue = ethers.BigNumber.from(contractsDaiBalance)
      .sub(ethers.BigNumber.from(principalAmount))
      .sub(adminFeeAmount);
    assert(ethers.BigNumber.from(totalInterest).eq(expectedValue));
  });

  it("checks the interest is updated correctly when admin fees is 0 %", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    const player1 = accounts[2];
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      false,
      false,
      0,
      strategyType,
      0,
      false,
    );
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await mintTokens(contracts.inboundToken, deployer.address);
    if (strategyType === "aave" || strategyType === "aaveV3") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
      await contracts.lendingPool
        .connect(deployer)
        .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
      const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

      await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
    } else if (strategyType === "curve") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.curvePool.address, ethers.utils.parseEther("100000"));
      const poolTokenBalance = await contracts.curvePool.balanceOf(deployer.address);

      await contracts.curvePool.connect(deployer).transfer(contracts.strategy.address, poolTokenBalance.toString());
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool("90");
    const contractsDaiBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
    const principalAmount = await contracts.goodGhosting.totalGamePrincipal();
    const totalInterest = await contracts.goodGhosting.totalGameInterest();
    const expectedValue = ethers.BigNumber.from(contractsDaiBalance).sub(ethers.BigNumber.from(principalAmount));
    assert(ethers.BigNumber.from(totalInterest).eq(expectedValue));
  });

  it("checks totalIncentiveAmount is set when additional incentives are sent to the contract", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    const player1 = accounts[2];
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await mintTokens(contracts.inboundToken, deployer.address);
    if (strategyType === "aave" || strategyType === "aaveV3") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
      await contracts.lendingPool
        .connect(deployer)
        .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
      const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

      await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
    } else if (strategyType === "curve") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.curvePool.address, ethers.utils.parseEther("100000"));
      const poolTokenBalance = await contracts.curvePool.balanceOf(deployer.address);

      await contracts.curvePool.connect(deployer).transfer(contracts.strategy.address, poolTokenBalance.toString());
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool("90");
    const contractsDaiBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
    const principalAmount = await contracts.goodGhosting.totalGamePrincipal();
    const totalInterest = await contracts.goodGhosting.totalGameInterest();
    const adminFeeAmount = ethers.BigNumber.from(contractsDaiBalance)
      .sub(ethers.BigNumber.from(principalAmount))
      .mul(ethers.BigNumber.from(1))
      .div(ethers.BigNumber.from(100));
    const expectedValue = ethers.BigNumber.from(contractsDaiBalance)
      .sub(ethers.BigNumber.from(principalAmount))
      .sub(adminFeeAmount);
    assert(ethers.BigNumber.from(totalInterest).eq(expectedValue));
  });

  it("checks interest accounting on redeem is calculated correctly", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await redeem(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      segmentPayment,
    );

    const playerInfo = await contracts.goodGhosting.players(player1.address);

    let cummalativePlayer1IndexBeforeWithdraw = ethers.BigNumber.from(0);

    for (let i = 0; i <= playerInfo.mostRecentSegmentPaid; i++) {
      let index1 = await contracts.goodGhosting.playerIndex(player1.address, i);
      cummalativePlayer1IndexBeforeWithdraw = cummalativePlayer1IndexBeforeWithdraw.add(
        ethers.BigNumber.from(index1.toString()),
      );
    }
    const depositCountVal = await contracts.goodGhosting.depositCount();
    const cumulativePlayerIndexSum = await contracts.goodGhosting.cumulativePlayerIndexSum(depositCountVal - 1);
    assert(cumulativePlayerIndexSum.eq(cummalativePlayer1IndexBeforeWithdraw));
  });

  context("when incentive token is defined", async () => {
    const incentiveAmount = ethers.BigNumber.from(ethers.utils.parseEther("100000"));

    beforeEach(async () => {
      contracts = await deployPool(
        depositCount,
        segmentLength,
        segmentPayment,
        1,
        0,
        maxPlayersCount,
        true,
        true,
        true,
        false,
        false,
        false,
        0,
        strategyType,
        0,
        false,
      );
    });

    it("reverts if admin tries to set incentive token again", async () => {
      await expect(contracts.goodGhosting.setIncentiveToken(contracts.inboundToken.address)).to.be.revertedWith(
        "INCENTIVE_TOKEN_ALREADY_SET()",
      );
    });

    it("sets totalIncentiveAmount to amount sent to contract", async () => {
      const accounts = await ethers.getSigners();
      const player1 = accounts[2];
      await redeem(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        depositCount,
        segmentLength,
        segmentPayment,
      );
      const result = ethers.BigNumber.from(await contracts.goodGhosting.totalIncentiveAmount());
      assert(
        result.eq(incentiveAmount),
        `totalIncentiveAmount should be ${incentiveAmount.toString()}; received ${result.toString()}`,
      );
    });
    if (strategyType !== "aave" && strategyType !== "aaveV3" && strategyType !== "no_strategy") {
      it("we are able to redeem if there is impermanent loss", async () => {
        const accounts = await ethers.getSigners();
        const player1 = accounts[2];
        await joinGamePaySegmentsAndComplete(
          contracts.inboundToken,
          player1,
          segmentPayment,
          depositCount,
          segmentLength,
          contracts.goodGhosting,
          segmentPayment,
        );
        // to trigger impermanent loss
        const principalAmount = await contracts.goodGhosting.totalGamePrincipal();
        await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool("900000000000000000");
        const contractDaiBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);

        const calculatedImpermanentLossShare = ethers.BigNumber.from(contractDaiBalance)
          .mul(ethers.BigNumber.from(100))
          .div(ethers.BigNumber.from(principalAmount));
        const impermanentLossShareFromContract = await contracts.goodGhosting.impermanentLossShare();

        assert(impermanentLossShareFromContract.eq(calculatedImpermanentLossShare));
      });
    }
  });
};

export const shouldBehaveLikeGGPoolWithNoWinners = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      false,
      false,
      1,
      strategyType,
      0,
      false,
    );
  });
  it("assign the complete interest to admin", async () => {
    let governanceTokenRewards = 0,
      adminGovernanceTokenFee = 0;
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGamePaySegmentsAndNotComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    const result = await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);
    if (strategyType === "curve") {
      governanceTokenRewards = await contracts.curve.balanceOf(contracts.goodGhosting.address);
      adminGovernanceTokenFee = ethers.BigNumber.from(governanceTokenRewards)
        .mul(ethers.BigNumber.from(1))
        .div(ethers.BigNumber.from(100));
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenRewards = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
      adminGovernanceTokenFee = ethers.BigNumber.from(governanceTokenRewards)
        .mul(ethers.BigNumber.from(1))
        .div(ethers.BigNumber.from(100));
    }
    const adminBalance = await contracts.goodGhosting.adminFeeAmount(0);
    const totalBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
    const principalAmount = await contracts.goodGhosting.totalGamePrincipal();
    const rewardTokenBalance = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);

    const rewardAmounts: any = [];
    rewardAmounts[0] = ethers.BigNumber.from(rewardTokenBalance).toString();
    if (strategyType !== "aave" && strategyType !== "aaveV3" && strategyType !== "no_strategy") {
      rewardAmounts[1] = ethers.BigNumber.from(governanceTokenRewards).toString();
    }

    await expect(result)
      .to.emit(contracts.goodGhosting, "FundsRedeemedFromExternalPool")
      .withArgs(totalBalance, principalAmount, adminBalance, ethers.BigNumber.from(0), rewardAmounts);
  });

  it("user is able to withdraw in case no one wins", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGamePaySegmentsAndNotComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);
    await contracts.goodGhosting.connect(player1).withdraw(0);
  });
};

export const shouldBehaveLikePlayersWithdrawingFromGGPool = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      false,
      false,
      1,
      strategyType,
      0,
      false,
    );
  });

  it("reverts if a player tries to make deposit after admin enables early game completion", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await contracts.goodGhosting.enableEmergencyWithdraw();
    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await expect(
        makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment),
      ).to.be.revertedWith("DEPOSIT_NOT_ALLOWED()");
    }
  });

  it("reverts if a player tries to withdraw funds when admin has not enabled early game completion", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    await expect(contracts.goodGhosting.connect(player1).withdraw(0)).to.be.revertedWith("GAME_NOT_COMPLETED()");
  });

  it("allows players to withdraw early after admin enables early game completion during waiting round", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];
    let governanceTokenPlayer1BalanceAfterWithdraw = 0,
      governanceTokenPlayer2BalanceAfterWithdraw = 0,
      rewardTokenPlayer1BalanceAfterWithdraw = 0,
      rewardTokenPlayer2BalanceAfterWithdraw = 0,
      governanceTokenPlayer1BalanceBeforeWithdraw = 0,
      governanceTokenPlayer2BalanceBeforeWithdraw = 0,
      rewardTokenPlayer1BalanceBeforeWithdraw = 0,
      rewardTokenPlayer2BalanceBeforeWithdraw = 0;

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    }
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString()) / 2]);
    await ethers.provider.send("evm_mine", []);
    await contracts.goodGhosting.enableEmergencyWithdraw();

    if (strategyType === "curve") {
      governanceTokenPlayer1BalanceBeforeWithdraw = await contracts.curve.balanceOf(player1.address);
      governanceTokenPlayer2BalanceBeforeWithdraw = await contracts.curve.balanceOf(player2.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenPlayer1BalanceBeforeWithdraw = await contracts.mobi.balanceOf(player1.address);
      governanceTokenPlayer2BalanceBeforeWithdraw = await contracts.mobi.balanceOf(player2.address);
    }

    const rewardTokenInstance = await getRewardTokenInstance(contracts.strategy, player1);

    rewardTokenPlayer1BalanceBeforeWithdraw = await rewardTokenInstance.balanceOf(player1.address);
    rewardTokenPlayer2BalanceBeforeWithdraw = await rewardTokenInstance.balanceOf(player2.address);

    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);

    await contracts.goodGhosting.connect(player1).withdraw(0);
    await contracts.goodGhosting.connect(player2).withdraw(0);

    if (strategyType === "curve") {
      governanceTokenPlayer1BalanceAfterWithdraw = await contracts.curve.balanceOf(player1.address);
      governanceTokenPlayer2BalanceAfterWithdraw = await contracts.curve.balanceOf(player2.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenPlayer1BalanceAfterWithdraw = await contracts.mobi.balanceOf(player1.address);
      governanceTokenPlayer2BalanceAfterWithdraw = await contracts.mobi.balanceOf(player2.address);
    }
    rewardTokenPlayer1BalanceAfterWithdraw = await rewardTokenInstance.balanceOf(player1.address);
    rewardTokenPlayer2BalanceAfterWithdraw = await rewardTokenInstance.balanceOf(player2.address);

    assert(
      ethers.BigNumber.from(rewardTokenPlayer1BalanceAfterWithdraw).gt(
        ethers.BigNumber.from(rewardTokenPlayer1BalanceBeforeWithdraw),
      ),
    );

    assert(
      ethers.BigNumber.from(rewardTokenPlayer2BalanceAfterWithdraw).gt(
        ethers.BigNumber.from(rewardTokenPlayer2BalanceBeforeWithdraw),
      ),
    );
    if (strategyType === "curve" || strategyType === "mobius") {
      assert(
        ethers.BigNumber.from(governanceTokenPlayer1BalanceAfterWithdraw).gt(
          ethers.BigNumber.from(governanceTokenPlayer1BalanceBeforeWithdraw),
        ),
      );
      assert(
        ethers.BigNumber.from(governanceTokenPlayer2BalanceAfterWithdraw).gt(
          ethers.BigNumber.from(governanceTokenPlayer2BalanceBeforeWithdraw),
        ),
      );
    }
  });

  it("allows players to withdraw early after admin enables early game completion when there are ghosts", async () => {
    const accounts = await ethers.getSigners();
    let governanceTokenPlayer1BalanceAfterWithdraw = 0,
      governanceTokenPlayer2BalanceAfterWithdraw = 0,
      rewardTokenPlayer1BalanceAfterWithdraw = 0,
      rewardTokenPlayer2BalanceAfterWithdraw = 0,
      governanceTokenPlayer1BalanceBeforeWithdraw = 0,
      governanceTokenPlayer2BalanceBeforeWithdraw = 0,
      rewardTokenPlayer1BalanceBeforeWithdraw = 0,
      rewardTokenPlayer2BalanceBeforeWithdraw = 0;

    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    // emergency withdraw in last deposit segment
    await contracts.goodGhosting.enableEmergencyWithdraw();
    if (strategyType === "curve") {
      governanceTokenPlayer1BalanceBeforeWithdraw = await contracts.curve.balanceOf(player1.address);
      governanceTokenPlayer2BalanceBeforeWithdraw = await contracts.curve.balanceOf(player2.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenPlayer1BalanceBeforeWithdraw = await contracts.mobi.balanceOf(player1.address);
      governanceTokenPlayer2BalanceBeforeWithdraw = await contracts.mobi.balanceOf(player2.address);
    }

    const rewardTokenInstance = await getRewardTokenInstance(contracts.strategy, player1);

    rewardTokenPlayer1BalanceBeforeWithdraw = await rewardTokenInstance.balanceOf(player1.address);
    rewardTokenPlayer2BalanceBeforeWithdraw = await rewardTokenInstance.balanceOf(player2.address);

    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);

    await contracts.goodGhosting.connect(player1).withdraw(0);
    await contracts.goodGhosting.connect(player2).withdraw(0);

    if (strategyType === "curve") {
      governanceTokenPlayer1BalanceAfterWithdraw = await contracts.curve.balanceOf(player1.address);
      governanceTokenPlayer2BalanceAfterWithdraw = await contracts.curve.balanceOf(player2.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenPlayer1BalanceAfterWithdraw = await contracts.mobi.balanceOf(player1.address);
      governanceTokenPlayer2BalanceAfterWithdraw = await contracts.mobi.balanceOf(player2.address);
    }
    rewardTokenPlayer1BalanceAfterWithdraw = await rewardTokenInstance.balanceOf(player1.address);
    rewardTokenPlayer2BalanceAfterWithdraw = await rewardTokenInstance.balanceOf(player2.address);

    assert(
      ethers.BigNumber.from(rewardTokenPlayer1BalanceAfterWithdraw).gt(
        ethers.BigNumber.from(rewardTokenPlayer1BalanceBeforeWithdraw),
      ),
    );
    assert(
      ethers.BigNumber.from(rewardTokenPlayer2BalanceAfterWithdraw).eq(
        ethers.BigNumber.from(rewardTokenPlayer2BalanceBeforeWithdraw),
      ),
    );
    if (strategyType === "curve" || strategyType === "mobius") {
      assert(
        ethers.BigNumber.from(governanceTokenPlayer1BalanceAfterWithdraw).gt(
          ethers.BigNumber.from(governanceTokenPlayer1BalanceBeforeWithdraw),
        ),
      );
      assert(
        ethers.BigNumber.from(governanceTokenPlayer2BalanceAfterWithdraw).eq(
          ethers.BigNumber.from(governanceTokenPlayer2BalanceBeforeWithdraw),
        ),
      );
    }
  });

  it("allows players to withdraw early after admin enables early game completion when admin enables the withdraw ", async () => {
    const accounts = await ethers.getSigners();
    let governanceTokenPlayer1BalanceAfterWithdraw = 0,
      governanceTokenPlayer2BalanceAfterWithdraw = 0,
      rewardTokenPlayer1BalanceAfterWithdraw = 0,
      rewardTokenPlayer2BalanceAfterWithdraw = 0,
      governanceTokenPlayer1BalanceBeforeWithdraw = 0,
      governanceTokenPlayer2BalanceBeforeWithdraw = 0,
      rewardTokenPlayer1BalanceBeforeWithdraw = 0,
      rewardTokenPlayer2BalanceBeforeWithdraw = 0;

    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    for (let index = 1; index < depositCount; index++) {
      if (index < depositCount - 1) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      } else {
        await contracts.goodGhosting.enableEmergencyWithdraw();
      }
    }

    if (strategyType === "curve") {
      governanceTokenPlayer1BalanceBeforeWithdraw = await contracts.curve.balanceOf(player1.address);
      governanceTokenPlayer2BalanceBeforeWithdraw = await contracts.curve.balanceOf(player2.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenPlayer1BalanceBeforeWithdraw = await contracts.mobi.balanceOf(player1.address);
      governanceTokenPlayer2BalanceBeforeWithdraw = await contracts.mobi.balanceOf(player2.address);
    }

    const rewardTokenInstance = await getRewardTokenInstance(contracts.strategy, player1);

    rewardTokenPlayer1BalanceBeforeWithdraw = await rewardTokenInstance.balanceOf(player1.address);
    rewardTokenPlayer2BalanceBeforeWithdraw = await rewardTokenInstance.balanceOf(player2.address);

    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);

    await contracts.goodGhosting.connect(player1).withdraw(0);
    await contracts.goodGhosting.connect(player2).withdraw(0);

    if (strategyType === "curve") {
      governanceTokenPlayer1BalanceAfterWithdraw = await contracts.curve.balanceOf(player1.address);
      governanceTokenPlayer2BalanceAfterWithdraw = await contracts.curve.balanceOf(player2.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenPlayer1BalanceAfterWithdraw = await contracts.mobi.balanceOf(player1.address);
      governanceTokenPlayer2BalanceAfterWithdraw = await contracts.mobi.balanceOf(player2.address);
    }
    rewardTokenPlayer1BalanceAfterWithdraw = await rewardTokenInstance.balanceOf(player1.address);
    rewardTokenPlayer2BalanceAfterWithdraw = await rewardTokenInstance.balanceOf(player2.address);

    assert(
      ethers.BigNumber.from(rewardTokenPlayer1BalanceAfterWithdraw).gt(
        ethers.BigNumber.from(rewardTokenPlayer1BalanceBeforeWithdraw),
      ),
    );
    assert(
      ethers.BigNumber.from(rewardTokenPlayer2BalanceAfterWithdraw).gt(
        ethers.BigNumber.from(rewardTokenPlayer2BalanceBeforeWithdraw),
      ),
    );
    if (strategyType === "curve" || strategyType === "mobius") {
      assert(
        ethers.BigNumber.from(governanceTokenPlayer1BalanceAfterWithdraw).gt(
          ethers.BigNumber.from(governanceTokenPlayer1BalanceBeforeWithdraw),
        ),
      );
      assert(
        ethers.BigNumber.from(governanceTokenPlayer2BalanceAfterWithdraw).gt(
          ethers.BigNumber.from(governanceTokenPlayer2BalanceBeforeWithdraw),
        ),
      );
    }
  });

  it("allows players to withdraw early after admin enables early game completion", async () => {
    const accounts = await ethers.getSigners();
    let governanceTokenPlayer1BalanceAfterWithdraw = 0,
      governanceTokenPlayer2BalanceAfterWithdraw = 0,
      rewardTokenPlayer1BalanceAfterWithdraw = 0,
      rewardTokenPlayer2BalanceAfterWithdraw = 0,
      governanceTokenPlayer1BalanceBeforeWithdraw = 0,
      governanceTokenPlayer2BalanceBeforeWithdraw = 0,
      rewardTokenPlayer1BalanceBeforeWithdraw = 0,
      rewardTokenPlayer2BalanceBeforeWithdraw = 0;

    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    await contracts.goodGhosting.enableEmergencyWithdraw();
    if (strategyType === "curve") {
      governanceTokenPlayer1BalanceBeforeWithdraw = await contracts.curve.balanceOf(player1.address);
      governanceTokenPlayer2BalanceBeforeWithdraw = await contracts.curve.balanceOf(player2.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenPlayer1BalanceBeforeWithdraw = await contracts.mobi.balanceOf(player1.address);
      governanceTokenPlayer2BalanceBeforeWithdraw = await contracts.mobi.balanceOf(player2.address);
    }
    const rewardTokenInstance = await getRewardTokenInstance(contracts.strategy, player1);

    rewardTokenPlayer1BalanceBeforeWithdraw = await rewardTokenInstance.balanceOf(player1.address);
    rewardTokenPlayer2BalanceBeforeWithdraw = await rewardTokenInstance.balanceOf(player2.address);

    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);

    await contracts.goodGhosting.connect(player1).withdraw(0);
    await contracts.goodGhosting.connect(player2).withdraw(0);

    if (strategyType === "curve") {
      governanceTokenPlayer1BalanceAfterWithdraw = await contracts.curve.balanceOf(player1.address);
      governanceTokenPlayer2BalanceAfterWithdraw = await contracts.curve.balanceOf(player2.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenPlayer1BalanceAfterWithdraw = await contracts.mobi.balanceOf(player1.address);
      governanceTokenPlayer2BalanceAfterWithdraw = await contracts.mobi.balanceOf(player2.address);
    }
    rewardTokenPlayer1BalanceAfterWithdraw = await rewardTokenInstance.balanceOf(player1.address);
    rewardTokenPlayer2BalanceAfterWithdraw = await rewardTokenInstance.balanceOf(player2.address);

    assert(
      ethers.BigNumber.from(rewardTokenPlayer1BalanceAfterWithdraw).gt(
        ethers.BigNumber.from(rewardTokenPlayer1BalanceBeforeWithdraw),
      ),
    );
    assert(
      ethers.BigNumber.from(rewardTokenPlayer2BalanceAfterWithdraw).gt(
        ethers.BigNumber.from(rewardTokenPlayer2BalanceBeforeWithdraw),
      ),
    );
    if (strategyType === "curve" || strategyType === "mobius") {
      assert(
        ethers.BigNumber.from(governanceTokenPlayer1BalanceAfterWithdraw).gt(
          ethers.BigNumber.from(governanceTokenPlayer1BalanceBeforeWithdraw),
        ),
      );
      assert(
        ethers.BigNumber.from(governanceTokenPlayer2BalanceAfterWithdraw).gt(
          ethers.BigNumber.from(governanceTokenPlayer2BalanceBeforeWithdraw),
        ),
      );
    }
  });

  it("pays a bonus to winners and losers get their principle back", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player2,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );

    // Simulate some interest by giving the contract more aDAI
    await mintTokens(contracts.inboundToken, deployer.address);

    if (strategyType === "aave" || strategyType === "aaveV3") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
      await contracts.lendingPool
        .connect(deployer)
        .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
      const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

      await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
    } else if (strategyType === "curve") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.curvePool.address, ethers.utils.parseEther("100000"));
      const poolTokenBalance = await contracts.curvePool.balanceOf(deployer.address);

      await contracts.curvePool.connect(deployer).transfer(contracts.strategy.address, poolTokenBalance.toString());
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;

      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    // Expect Player1 to get back the deposited amount
    const player1PreWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
    let playerMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player1.address);

    await contracts.goodGhosting.connect(player1).withdraw("90");
    let playerMaticBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player1.address);
    assert(playerMaticBalanceAfterWithdraw.eq(playerMaticBalanceBeforeWithdraw));
    const player1PostWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
    assert(player1PostWithdrawBalance.sub(player1PreWithdrawBalance).eq(segmentPayment));

    // Expect Player2 to get an amount greater than the cumulativePlayerIndexSum of all the deposits
    const player2PreWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);
    playerMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player2.address);

    await contracts.goodGhosting.connect(player2).withdraw(0);
    playerMaticBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player2.address);
    assert(playerMaticBalanceAfterWithdraw.gt(playerMaticBalanceBeforeWithdraw));

    const player2PostWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);
    const totalGameInterest = await contracts.goodGhosting.totalGameInterest.call();
    const adminFeeAmount = ethers.BigNumber.from(1).mul(totalGameInterest).div(ethers.BigNumber.from("100"));
    const withdrawalValue = player2PostWithdrawBalance.sub(player2PreWithdrawBalance);

    const userDeposit = ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from(depositCount));
    // taking in account the pool fees 5%
    assert(withdrawalValue.lte(userDeposit.add(ethers.utils.parseEther("100000")).sub(adminFeeAmount)));
  });

  it("reverts if user tries to withdraw more than once", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await redeem(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      segmentPayment,
    );
    await contracts.goodGhosting.connect(player1).withdraw(0);
    await expect(contracts.goodGhosting.connect(player1).withdraw(0)).to.be.revertedWith("PLAYER_ALREADY_WITHDREW()");
  });

  it("reverts if a non-player tries to withdraw", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];
    await redeem(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      segmentPayment,
    );
    await expect(contracts.goodGhosting.connect(deployer).withdraw(0)).to.be.revertedWith("PLAYER_DOES_NOT_EXIST()");
  });

  it("sets withdrawn flag to true after user withdraws", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await redeem(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      segmentPayment,
    );
    await contracts.goodGhosting.connect(player1).withdraw(0);
    const player1Result = await contracts.goodGhosting.players(player1.address);
    assert(player1Result.withdrawn);
  });

  it("withdraws from external pool on first withdraw if funds weren't redeemed yet", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await contracts.goodGhosting.connect(player1).withdraw(0);
    const redeemed = await contracts.goodGhosting.redeemed();
    assert(redeemed);
  });

  it("makes sure the player that withdraws first before funds are redeemed from external pool gets interest based on their deposit/join timeline (if winner)", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];

    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);

    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);

    await mintTokens(contracts.inboundToken, deployer.address);
    if (strategyType === "aave" || strategyType === "aaveV3") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
      await contracts.lendingPool
        .connect(deployer)
        .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
      const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

      await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
    } else if (strategyType === "curve") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.curvePool.address, ethers.utils.parseEther("100000"));
      const poolTokenBalance = await contracts.curvePool.balanceOf(deployer.address);

      await contracts.curvePool.connect(deployer).transfer(contracts.strategy.address, poolTokenBalance.toString());
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }

    const player1BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
    await contracts.goodGhosting.connect(player1).withdraw("90");
    const player1PostWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
    const player1WithdrawAmount = player1PostWithdrawBalance.sub(player1BeforeWithdrawBalance);

    const player2BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);
    await contracts.goodGhosting.connect(player2).withdraw(0);
    const player2PostWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);
    const player2WithdrawAmount = player2PostWithdrawBalance.sub(player2BeforeWithdrawBalance);

    // both players are winners, but player 2 made deposits before player 1 so it gets slightly higher interest.
    assert(player2WithdrawAmount.gte(player1WithdrawAmount));
  });

  it("emits Withdrawal event when user withdraws", async () => {
    // having test with only 1 player for now
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    let governanceTokenBalance = 0,
      adminGovernanceTokenFee = 0;
    const player1 = accounts[2];
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await mintTokens(contracts.inboundToken, deployer.address);
    if (strategyType === "aave" || strategyType === "aaveV3") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
      await contracts.lendingPool
        .connect(deployer)
        .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
      const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

      await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
    } else if (strategyType === "curve") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.curvePool.address, ethers.utils.parseEther("100000"));
      const poolTokenBalance = await contracts.curvePool.balanceOf(deployer.address);

      await contracts.curvePool.connect(deployer).transfer(contracts.strategy.address, poolTokenBalance.toString());
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool("90");
    const gameInterest = await contracts.goodGhosting.totalGameInterest();
    const playerInfo = await contracts.goodGhosting.players(player1.address);
    const depositCountVal = await contracts.goodGhosting.depositCount();

    const cumulativePlayerIndexSum = await contracts.goodGhosting.cumulativePlayerIndexSum(depositCountVal - 1);

    let cummalativePlayer1IndexBeforeWithdraw = ethers.BigNumber.from(0);

    for (let i = 0; i <= playerInfo.mostRecentSegmentPaid; i++) {
      let index1 = await contracts.goodGhosting.playerIndex(player1.address, i);
      cummalativePlayer1IndexBeforeWithdraw = cummalativePlayer1IndexBeforeWithdraw.add(
        ethers.BigNumber.from(index1.toString()),
      );
    }
    let playerShare = ethers.BigNumber.from(cummalativePlayer1IndexBeforeWithdraw)
      .mul(ethers.BigNumber.from(100))
      .div(ethers.BigNumber.from(cumulativePlayerIndexSum));
    playerShare = ethers.BigNumber.from(gameInterest).mul(playerShare).div(ethers.BigNumber.from(100));
    const userDeposit = ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from(depositCount));
    if (strategyType === "curve") {
      governanceTokenBalance = await contracts.curve.balanceOf(contracts.goodGhosting.address);
      adminGovernanceTokenFee = ethers.BigNumber.from(governanceTokenBalance)
        .mul(ethers.BigNumber.from(1))
        .div(ethers.BigNumber.from(100));
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenBalance = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
      adminGovernanceTokenFee = ethers.BigNumber.from(governanceTokenBalance)
        .mul(ethers.BigNumber.from(1))
        .div(ethers.BigNumber.from(100));
    }
    const rewardTokenBalance = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);
    const adminRewardTokenFee = ethers.BigNumber.from(rewardTokenBalance)
      .mul(ethers.BigNumber.from(1))
      .div(ethers.BigNumber.from(100));
    const playerRewardAmounts: any = [];
    playerRewardAmounts[0] = ethers.BigNumber.from(rewardTokenBalance)
      .sub(ethers.BigNumber.from(adminRewardTokenFee))
      .toString();
    if (strategyType !== "aave" && strategyType !== "aaveV3" && strategyType !== "no_strategy") {
      playerRewardAmounts[1] = ethers.BigNumber.from(governanceTokenBalance)
        .sub(ethers.BigNumber.from(adminGovernanceTokenFee))
        .toString();
    }
    await expect(contracts.goodGhosting.connect(player1).withdraw(0))
      .to.emit(contracts.goodGhosting, "Withdrawal")
      .withArgs(player1.address, userDeposit.add(playerShare), ethers.BigNumber.from(0), playerRewardAmounts);
  });
  if (strategyType === "curve" || strategyType === "mobius") {
    it("player is able to withdraw if there is impermanent loss", async () => {
      // having test with only 1 player for now
      const accounts = await ethers.getSigners();
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);
      await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool("900000000000000000");
      // 6 => qty
      const newPrincipal = 6000000000000000000;

      const impermanentLossShareFromContract = await contracts.goodGhosting.impermanentLossShare();
      const player1BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
      const player1Info = await contracts.goodGhosting.players(player1.address);

      const player2BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);
      const player2Info = await contracts.goodGhosting.players(player2.address);

      await contracts.goodGhosting.connect(player1).withdraw(0);
      await contracts.goodGhosting.connect(player2).withdraw(0);

      const player1AfterWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
      const player2AfterWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);

      const player1Difference = player1AfterWithdrawBalance.sub(player1BeforeWithdrawBalance);
      const actualAmountReceivedByPlayer1 = player1Info.amountPaid
        .mul(impermanentLossShareFromContract)
        .div(ethers.BigNumber.from(100));

      const player2Difference = player2AfterWithdrawBalance.sub(player2BeforeWithdrawBalance);
      const actualAmountReceivedByPlayer2 = player2Info.amountPaid
        .mul(impermanentLossShareFromContract)
        .div(ethers.BigNumber.from(100));

      assert(player1Difference.eq(actualAmountReceivedByPlayer1));
      assert(player2Difference.eq(actualAmountReceivedByPlayer2));

      assert(player1Difference.toString() === (newPrincipal / 2).toString());
      assert(player2Difference.toString() === (newPrincipal / 2).toString());
    });

    it("ghost user is able to withdraw if there is an impermanent loss", async () => {
      const accounts = await ethers.getSigners();
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);

      // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await approveToken(contracts.inboundToken, player1, contracts.goodGhosting.address, segmentPayment);
        await contracts.goodGhosting.connect(player1).makeDeposit(0, segmentPayment);
      }

      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool("900000000000000000");

      const impermanentLossShareFromContract = await contracts.goodGhosting.impermanentLossShare();
      const player1BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
      const player1Info = await contracts.goodGhosting.players(player1.address);

      const player2BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);
      const player2Info = await contracts.goodGhosting.players(player2.address);

      await contracts.goodGhosting.connect(player1).withdraw(0);
      await contracts.goodGhosting.connect(player2).withdraw(0);

      const player1AfterWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
      const player2AfterWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);

      const player1Difference = player1AfterWithdrawBalance.sub(player1BeforeWithdrawBalance);

      const actualAmountReceivedByPlayer1 = player1Info.amountPaid
        .mul(impermanentLossShareFromContract)
        .div(ethers.BigNumber.from(100));

      const player2Difference = player2AfterWithdrawBalance.sub(player2BeforeWithdrawBalance);
      const actualAmountReceivedByPlayer2 = player2Info.amountPaid
        .mul(impermanentLossShareFromContract)
        .div(ethers.BigNumber.from(100));

      assert(player1Difference.eq(actualAmountReceivedByPlayer1));
      assert(player2Difference.eq(actualAmountReceivedByPlayer2));
    });
  }

  it("should return that player is a winner after completing the game successfully", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];

    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    const isWinner = await contracts.goodGhosting.isWinner(player1.address);
    expect(isWinner).to.be.true;
  });

  it("should return that player is a winner if they have deposited and admin enables early game completion", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    await contracts.goodGhosting.enableEmergencyWithdraw();

    const isWinner = await contracts.goodGhosting.isWinner(player1.address);
    expect(isWinner).to.be.true;
  });

  it("should return that player is not a winner if they haven't completed the game successfully", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await advanceToEndOfGame(contracts.goodGhosting, segmentLength, depositCount);

    const isWinnerPlayer1 = await contracts.goodGhosting.isWinner(player1.address);
    expect(isWinnerPlayer1).to.be.false;

    const isWinnerPlayer2 = await contracts.goodGhosting.isWinner(player2.address);
    expect(isWinnerPlayer2).to.be.false;
  });

  it("should return that player is not a winner if they missed a deposited and admin enables early game completion", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await ethers.provider.send("evm_increaseTime", [segmentLength * 2]);
    await ethers.provider.send("evm_mine", []);

    await contracts.goodGhosting.enableEmergencyWithdraw();

    const isWinnerPlayer1 = await contracts.goodGhosting.isWinner(player1.address);
    expect(isWinnerPlayer1).to.be.false;

    const isWinnerPlayer2 = await contracts.goodGhosting.isWinner(player2.address);
    expect(isWinnerPlayer2).to.be.false;
  });

  it("should return that player is a winner if admin enables early game completion on the first round and the player has joined the game", async () => {
    const accounts = await ethers.getSigners();
    const player = accounts[2];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player, segmentPayment, segmentPayment);

    await contracts.goodGhosting.enableEmergencyWithdraw();

    const isWinner = await contracts.goodGhosting.isWinner(player.address);
    expect(isWinner).to.be.true;
  });

  it("should return that player is not winner if player has not joined the game when admin enables early game completion", async () => {
    const accounts = await ethers.getSigners();
    const playerHasNotJoined = accounts[2];

    //need at least one deposit on the pool
    const otherPlayer = accounts[3];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, otherPlayer, segmentPayment, segmentPayment);

    await contracts.goodGhosting.enableEmergencyWithdraw();

    const isWinner = await contracts.goodGhosting.isWinner(playerHasNotJoined.address);
    expect(isWinner).to.be.false;
  });

  context("when incentive token is defined", async () => {
    beforeEach(async () => {
      contracts = await deployPool(
        depositCount,
        segmentLength,
        segmentPayment,
        1,
        1,
        maxPlayersCount,
        true,
        true,
        true,
        false,
        false,
        false,
        0,
        strategyType,
        0,
        false,
      );
    });

    it("pays additional incentive to winners when incentive is sent to contract", async () => {
      const accounts = await ethers.getSigners();
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      const user1IncentiveTokenBalanceBeforeWithdraw = await contracts.incentiveToken.balanceOf(player1.address);
      const user2IncentiveTokenBalanceBeforeWithdraw = await contracts.incentiveToken.balanceOf(player2.address);
      await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);
      await contracts.goodGhosting.connect(player1).withdraw(0);
      await contracts.goodGhosting.connect(player2).withdraw(0);
      const user1IncentiveTokenBalanceAfterWithdraw = await contracts.incentiveToken.balanceOf(player1.address);
      const user2IncentiveTokenBalanceAfterWithdraw = await contracts.incentiveToken.balanceOf(player2.address);

      assert(user2IncentiveTokenBalanceAfterWithdraw.gte(user1IncentiveTokenBalanceAfterWithdraw));

      assert(user2IncentiveTokenBalanceAfterWithdraw.gt(user2IncentiveTokenBalanceBeforeWithdraw));
      assert(user1IncentiveTokenBalanceAfterWithdraw.gt(user1IncentiveTokenBalanceBeforeWithdraw));
    });
  });
};

export const shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentMoreThan0 = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      false,
      false,
      1,
      strategyType,
      0,
      false,
    );
  });

  it("allows admin to withdraw fees early after admin enables early game completion", async () => {
    const accounts = await ethers.getSigners();
    let governanceTokenAdminBalanceAfterWithdraw = 0,
      rewardTokenAdminBalanceAfterWithdraw = 0,
      governanceTokenAdminBalanceBeforeWithdraw = 0,
      rewardTokenAdminBalanceBeforeWithdraw = 0;
    const deployer = accounts[0];
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    for (let index = 1; index < depositCount; index++) {
      if (index < depositCount - 1) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      } else {
        await contracts.goodGhosting.enableEmergencyWithdraw();
      }
    }

    if (strategyType === "curve") {
      governanceTokenAdminBalanceBeforeWithdraw = await contracts.curve.balanceOf(player1.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenAdminBalanceBeforeWithdraw = await contracts.mobi.balanceOf(player2.address);
    }

    const rewardTokenInstance = await getRewardTokenInstance(contracts.strategy, player1);

    rewardTokenAdminBalanceBeforeWithdraw = await rewardTokenInstance.balanceOf(player1.address);

    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);

    await contracts.goodGhosting.connect(player1).withdraw(0);
    await contracts.goodGhosting.connect(player2).withdraw(0);

    await contracts.goodGhosting.connect(deployer).adminFeeWithdraw(0);

    if (strategyType === "curve") {
      governanceTokenAdminBalanceAfterWithdraw = await contracts.curve.balanceOf(player1.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenAdminBalanceAfterWithdraw = await contracts.mobi.balanceOf(player1.address);
    }
    rewardTokenAdminBalanceAfterWithdraw = await rewardTokenInstance.balanceOf(player1.address);

    assert(
      ethers.BigNumber.from(rewardTokenAdminBalanceAfterWithdraw).gt(
        ethers.BigNumber.from(rewardTokenAdminBalanceBeforeWithdraw),
      ),
    );

    if (strategyType === "curve" || strategyType === "mobius") {
      assert(
        ethers.BigNumber.from(governanceTokenAdminBalanceAfterWithdraw).gt(
          ethers.BigNumber.from(governanceTokenAdminBalanceBeforeWithdraw),
        ),
      );
    }
  });

  it("when funds were not redeemed from external pool", async () => {
    const accounts = await ethers.getSigners();

    const player1 = accounts[2];
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );

    await expect(contracts.goodGhosting.adminFeeWithdraw(0)).to.be.revertedWith(
      "FUNDS_NOT_REDEEMED_FROM_EXTERNAL_POOL()",
    );
  });

  it("when admin tries to withdraw fees again", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    //generating mock interest
    await mintTokens(contracts.inboundToken, deployer.address);
    if (strategyType === "aave" || strategyType === "aaveV3") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
      await contracts.lendingPool
        .connect(deployer)
        .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
      const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

      await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
    } else if (strategyType === "curve") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.curvePool.address, ethers.utils.parseEther("100000"));
      const poolTokenBalance = await contracts.curvePool.balanceOf(deployer.address);

      await contracts.curvePool.connect(deployer).transfer(contracts.strategy.address, poolTokenBalance.toString());
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool("90");
    await contracts.goodGhosting.adminFeeWithdraw(0);
    await expect(contracts.goodGhosting.adminFeeWithdraw(0)).to.be.revertedWith("ADMIN_FEE_WITHDRAWN()");
  });

  context("with no winners in the game", async () => {
    it("does not revert when there is no interest generated (neither external interest nor early withdrawal fees)", async () => {
      let governanceTokenBalance = 0;
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player2 = accounts[3];
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await advanceToEndOfGame(contracts.goodGhosting, segmentLength, depositCount);

      await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);
      if (strategyType === "curve") {
        governanceTokenBalance = await contracts.curve.balanceOf(contracts.goodGhosting.address);
      } else if (strategyType === "mobius") {
        contracts.rewardToken = contracts.minter;
        governanceTokenBalance = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
      }
      const rewardTokenBalance = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);

      const fee: any = [];
      const rewardTokens = await contracts.strategy.getRewardTokens();
      for (let i = 0; i <= rewardTokens.length; i++) {
        fee[i] = await contracts.goodGhosting.adminFeeAmount(i);
      }
      await expect(contracts.goodGhosting.adminFeeWithdraw(0))
        .to.emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(deployer.address, ethers.BigNumber.from(0), ethers.BigNumber.from(0), fee);
    });

    it("withdraw fees when there's only early withdrawal fees", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];
      let governanceTokenBalance = 0;

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
      await advanceToEndOfGame(contracts.goodGhosting, segmentLength, depositCount);

      await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);
      if (strategyType === "curve") {
        governanceTokenBalance = await contracts.curve.balanceOf(contracts.goodGhosting.address);
      } else if (strategyType === "mobius") {
        contracts.rewardToken = contracts.minter;
        governanceTokenBalance = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
      }

      const contractBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
      const totalGamePrincipal = await contracts.goodGhosting.totalGamePrincipal();
      const grossInterest = contractBalance.sub(totalGamePrincipal);
      // There's no winner, so admin takes it all
      let adminMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);

      let adminMaticBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
      // no external deposits
      assert(adminMaticBalanceAfterWithdraw.eq(adminMaticBalanceBeforeWithdraw));

      const fee: any = [];
      const rewardTokens = await contracts.strategy.getRewardTokens();
      for (let i = 0; i <= rewardTokens.length; i++) {
        fee[i] = await contracts.goodGhosting.adminFeeAmount(i);
      }
      await expect(contracts.goodGhosting.adminFeeWithdraw(0))
        .emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(deployer.address, grossInterest, ethers.BigNumber.from(0), fee);
    });

    it("withdraw fees when there's only interest generated by external pool", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];
      let governanceTokenBalance = 0;

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await advanceToEndOfGame(contracts.goodGhosting, segmentLength, depositCount);
      // mocks interest generation
      await mintTokens(contracts.inboundToken, deployer.address);

      if (strategyType === "aave" || strategyType === "aaveV3") {
        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
        await contracts.lendingPool
          .connect(deployer)
          .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
        const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

        await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
      } else if (strategyType === "curve") {
        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.curvePool.address, ethers.utils.parseEther("100000"));
        const poolTokenBalance = await contracts.curvePool.balanceOf(deployer.address);

        await contracts.curvePool.connect(deployer).transfer(contracts.strategy.address, poolTokenBalance.toString());
      } else if (strategyType === "mobius") {
        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
        await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

        await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
      }
      await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool("90");
      if (strategyType === "curve") {
        governanceTokenBalance = await contracts.curve.balanceOf(contracts.goodGhosting.address);
      } else if (strategyType === "mobius") {
        contracts.rewardToken = contracts.minter;
        governanceTokenBalance = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
      }

      // There's no winner, so admin takes it all
      let adminMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);

      const fee: any = [];
      const rewardTokens = await contracts.strategy.getRewardTokens();
      for (let i = 0; i <= rewardTokens.length; i++) {
        fee[i] = await contracts.goodGhosting.adminFeeAmount(i);
      }
      const contractBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
      const totalGamePrincipal = await contracts.goodGhosting.totalGamePrincipal();
      const grossInterest = contractBalance.sub(totalGamePrincipal);
      await expect(contracts.goodGhosting.adminFeeWithdraw(0))
        .emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(deployer.address, grossInterest, ethers.BigNumber.from(0), fee);
      let adminMaticBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
      assert(adminMaticBalanceAfterWithdraw.gt(adminMaticBalanceBeforeWithdraw));
    });

    it("withdraw fees when there's both interest generated by external pool and early withdrawal fees", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];
      let governanceTokenBalance = 0;
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
      await advanceToEndOfGame(contracts.goodGhosting, segmentLength, depositCount);
      // mocks interest generation
      await mintTokens(contracts.inboundToken, deployer.address);

      if (strategyType === "aave" || strategyType === "aaveV3") {
        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
        await contracts.lendingPool
          .connect(deployer)
          .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
        const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

        await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
      } else if (strategyType === "curve") {
        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.curvePool.address, ethers.utils.parseEther("100000"));
        const poolTokenBalance = await contracts.curvePool.balanceOf(deployer.address);

        await contracts.curvePool.connect(deployer).transfer(contracts.strategy.address, poolTokenBalance.toString());
      } else if (strategyType === "mobius") {
        contracts.rewardToken = contracts.minter;

        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
        await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

        await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
      }
      await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool("90");
      if (strategyType === "curve") {
        governanceTokenBalance = await contracts.curve.balanceOf(contracts.goodGhosting.address);
      } else if (strategyType === "mobius") {
        governanceTokenBalance = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
      }
      const contractBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
      const totalGamePrincipal = await contracts.goodGhosting.totalGamePrincipal();
      const grossInterest = contractBalance.sub(totalGamePrincipal);
      // There's no winner, so admin takes it all
      let adminMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);

      const fee: any = [];
      const rewardTokens = await contracts.strategy.getRewardTokens();
      for (let i = 0; i <= rewardTokens.length; i++) {
        fee[i] = await contracts.goodGhosting.adminFeeAmount(i);
      }

      await expect(contracts.goodGhosting.adminFeeWithdraw(0))
        .emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(deployer.address, grossInterest, ethers.BigNumber.from(0), fee);
      let adminMaticBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
      assert(adminMaticBalanceAfterWithdraw.gt(adminMaticBalanceBeforeWithdraw));
    });
  });
  context("with winners in the game", async () => {
    it("does not revert when there is no interest generated (neither external interest nor early withdrawal fees)", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];

      await joinGamePaySegmentsAndComplete(
        contracts.inboundToken,
        player1,
        segmentPayment,
        depositCount,
        segmentLength,
        contracts.goodGhosting,
        segmentPayment,
      );

      await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);

      const fee: any = [];
      const rewardTokens = await contracts.strategy.getRewardTokens();
      for (let i = 0; i <= rewardTokens.length; i++) {
        fee[i] = await contracts.goodGhosting.adminFeeAmount(i);
      }

      // reward token balance
      await expect(contracts.goodGhosting.adminFeeWithdraw(0))
        .to.emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(deployer.address, ethers.BigNumber.from(0), ethers.BigNumber.from(0), fee);
    });

    it("withdraw fees when there's only early withdrawal fees", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      await contracts.goodGhosting.connect(player1).earlyWithdraw(0);

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);
      const contractBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
      const totalGamePrincipal = await contracts.goodGhosting.totalGamePrincipal();
      const grossInterest = contractBalance.sub(totalGamePrincipal);
      const regularAdminFee = grossInterest.mul(ethers.BigNumber.from(1)).div(ethers.BigNumber.from(100));
      // There's no winner, so admin takes it all
      if (strategyType === "mobius") {
        contracts.rewardToken = contracts.minter;
      }
      let adminMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);

      let adminMaticBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
      // no external deposits
      assert(adminMaticBalanceAfterWithdraw.eq(adminMaticBalanceBeforeWithdraw));

      const fee: any = [];
      const rewardTokens = await contracts.strategy.getRewardTokens();
      for (let i = 0; i <= rewardTokens.length; i++) {
        fee[i] = await contracts.goodGhosting.adminFeeAmount(i);
      }
      await expect(contracts.goodGhosting.adminFeeWithdraw(0))
        .emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(deployer.address, grossInterest.sub(regularAdminFee), ethers.BigNumber.from(0), fee);
    });

    it("withdraw fees when there's only interest generated by external pool", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);
      // mocks interest generation
      await mintTokens(contracts.inboundToken, deployer.address);

      if (strategyType === "aave" || strategyType === "aaveV3") {
        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
        await contracts.lendingPool
          .connect(deployer)
          .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
        const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

        await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
      } else if (strategyType === "curve") {
        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.curvePool.address, ethers.utils.parseEther("100000"));
        const poolTokenBalance = await contracts.curvePool.balanceOf(deployer.address);

        await contracts.curvePool.connect(deployer).transfer(contracts.strategy.address, poolTokenBalance.toString());
      } else if (strategyType === "mobius") {
        contracts.rewardToken = contracts.minter;

        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
        await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

        await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
      }
      await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool("90");
      const contractBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
      const totalGamePrincipal = await contracts.goodGhosting.totalGamePrincipal();
      const grossInterest = contractBalance.sub(totalGamePrincipal);
      const regularAdminFee = grossInterest.mul(ethers.BigNumber.from(1)).div(ethers.BigNumber.from(100));
      // There's no winner, so admin takes it all
      let adminMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);

      const fee: any = [];
      const rewardTokens = await contracts.strategy.getRewardTokens();
      for (let i = 0; i <= rewardTokens.length; i++) {
        fee[i] = await contracts.goodGhosting.adminFeeAmount(i);
      }
      await expect(contracts.goodGhosting.adminFeeWithdraw(0))
        .emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(deployer.address, grossInterest.sub(regularAdminFee), ethers.BigNumber.from(0), fee);
      let adminMaticBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
      assert(adminMaticBalanceAfterWithdraw.gt(adminMaticBalanceBeforeWithdraw));
    });

    it("withdraw fees when there's both interest generated by external pool and early withdrawal fees", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      await contracts.goodGhosting.connect(player1).earlyWithdraw(0);

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      // mocks interest generation
      await mintTokens(contracts.inboundToken, deployer.address);

      if (strategyType === "aave" || strategyType === "aaveV3") {
        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
        await contracts.lendingPool
          .connect(deployer)
          .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
        const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

        await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
      } else if (strategyType === "curve") {
        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.curvePool.address, ethers.utils.parseEther("100000"));
        const poolTokenBalance = await contracts.curvePool.balanceOf(deployer.address);

        await contracts.curvePool.connect(deployer).transfer(contracts.strategy.address, poolTokenBalance.toString());
      } else if (strategyType === "mobius") {
        contracts.rewardToken = contracts.minter;

        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
        await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

        await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
      }
      await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool("90");
      const contractBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
      const totalGamePrincipal = await contracts.goodGhosting.totalGamePrincipal();
      const grossInterest = contractBalance.sub(totalGamePrincipal);
      const regularAdminFee = grossInterest.mul(ethers.BigNumber.from(1)).div(ethers.BigNumber.from(100));
      // There's no winner, so admin takes it all
      let adminMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);

      const fee: any = [];
      const rewardTokens = await contracts.strategy.getRewardTokens();
      for (let i = 0; i <= rewardTokens.length; i++) {
        fee[i] = await contracts.goodGhosting.adminFeeAmount(i);
      }
      await expect(contracts.goodGhosting.adminFeeWithdraw(0))
        .emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(deployer.address, grossInterest.sub(regularAdminFee), ethers.BigNumber.from(0), fee);
      let adminMaticBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
      assert(adminMaticBalanceAfterWithdraw.gt(adminMaticBalanceBeforeWithdraw));
    });
  });
};

export const shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentis0 = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      maxPlayersCount,
      true,
      true,
      true,
      false,
      false,
      false,
      1,
      strategyType,
      0,
      false,
    );
  });

  it("does not revert when there is no interest generated", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];

    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      depositCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );

    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);
    const incentiveAmount = await contracts.goodGhosting.totalIncentiveAmount();
    const fee: any = [];
    const rewardTokens = await contracts.strategy.getRewardTokens();
    for (let i = 0; i <= rewardTokens.length; i++) {
      fee[i] = await contracts.goodGhosting.adminFeeAmount(i);
    }
    // reward token balance
    await expect(contracts.goodGhosting.adminFeeWithdraw(0))
      .to.emit(contracts.goodGhosting, "AdminWithdrawal")
      .withArgs(deployer.address, ethers.BigNumber.from(0), ethers.BigNumber.from(incentiveAmount), fee);
  });

  it("extra incentives sent to admin in case of no winners", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await advanceToEndOfGame(contracts.goodGhosting, segmentLength, depositCount);
    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);
    const adminIncentiveTokenBalanceBeforeWithdraw = await contracts.incentiveToken.balanceOf(deployer.address);
    await contracts.goodGhosting.adminFeeWithdraw(0);
    const adminIncentiveTokenBalanceAfterWithdraw = await contracts.incentiveToken.balanceOf(deployer.address);
    assert(adminIncentiveTokenBalanceAfterWithdraw.gt(adminIncentiveTokenBalanceBeforeWithdraw));
  });
};

export const shouldBehaveLikeVariableDepositPool = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      maxPlayersCount,
      true,
      false,
      true,
      true,
      false,
      false,
      0,
      strategyType,
      1000,
      false,
    );
  });

  it("allows admin to withdraw fees early after admin enables early game completion", async () => {
    const accounts = await ethers.getSigners();
    let governanceTokenAdminBalanceAfterWithdraw = 0,
      rewardTokenAdminBalanceAfterWithdraw = 0,
      governanceTokenAdminBalanceBeforeWithdraw = 0,
      rewardTokenAdminBalanceBeforeWithdraw = 0;
    const deployer = accounts[0];
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player2,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
    );
    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
    );

    for (let index = 1; index < depositCount; index++) {
      if (index < depositCount - 1) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player2,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
        );
        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player1,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
        );
      } else {
        await contracts.goodGhosting.enableEmergencyWithdraw();
      }
    }

    if (strategyType === "curve") {
      governanceTokenAdminBalanceBeforeWithdraw = await contracts.curve.balanceOf(player1.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenAdminBalanceBeforeWithdraw = await contracts.mobi.balanceOf(player2.address);
    }

    const rewardTokenInstance = await getRewardTokenInstance(contracts.strategy, player1);

    rewardTokenAdminBalanceBeforeWithdraw = await rewardTokenInstance.balanceOf(player1.address);

    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);

    await contracts.goodGhosting.connect(player1).withdraw(0);
    await contracts.goodGhosting.connect(player2).withdraw(0);

    await contracts.goodGhosting.connect(deployer).adminFeeWithdraw(0);

    if (strategyType === "curve") {
      governanceTokenAdminBalanceAfterWithdraw = await contracts.curve.balanceOf(player1.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenAdminBalanceAfterWithdraw = await contracts.mobi.balanceOf(player1.address);
    }
    rewardTokenAdminBalanceAfterWithdraw = await rewardTokenInstance.balanceOf(player1.address);

    assert(
      ethers.BigNumber.from(rewardTokenAdminBalanceAfterWithdraw).gt(
        ethers.BigNumber.from(rewardTokenAdminBalanceBeforeWithdraw),
      ),
    );

    if (strategyType === "curve" || strategyType === "mobius") {
      assert(
        ethers.BigNumber.from(governanceTokenAdminBalanceAfterWithdraw).gt(
          ethers.BigNumber.from(governanceTokenAdminBalanceBeforeWithdraw),
        ),
      );
    }
  });

  it("allows players to withdraw early after admin enables early game completion when admin enables the withdraw ", async () => {
    const accounts = await ethers.getSigners();
    let governanceTokenPlayer1BalanceAfterWithdraw = 0,
      governanceTokenPlayer2BalanceAfterWithdraw = 0,
      rewardTokenPlayer1BalanceAfterWithdraw = 0,
      rewardTokenPlayer2BalanceAfterWithdraw = 0,
      governanceTokenPlayer1BalanceBeforeWithdraw = 0,
      governanceTokenPlayer2BalanceBeforeWithdraw = 0,
      rewardTokenPlayer1BalanceBeforeWithdraw = 0,
      rewardTokenPlayer2BalanceBeforeWithdraw = 0;

    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player2,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
    );
    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
    );

    for (let index = 1; index < depositCount; index++) {
      if (index < depositCount - 1) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player2,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
        );
        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player1,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
        );
      } else {
        await contracts.goodGhosting.enableEmergencyWithdraw();
      }
    }

    if (strategyType === "curve") {
      governanceTokenPlayer1BalanceBeforeWithdraw = await contracts.curve.balanceOf(player1.address);
      governanceTokenPlayer2BalanceBeforeWithdraw = await contracts.curve.balanceOf(player2.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenPlayer1BalanceBeforeWithdraw = await contracts.mobi.balanceOf(player1.address);
      governanceTokenPlayer2BalanceBeforeWithdraw = await contracts.mobi.balanceOf(player2.address);
    }

    rewardTokenPlayer1BalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player1.address);
    rewardTokenPlayer2BalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player2.address);

    await contracts.goodGhosting.connect(player1).withdraw(0);
    await contracts.goodGhosting.connect(player2).withdraw(0);

    if (strategyType === "curve") {
      governanceTokenPlayer1BalanceAfterWithdraw = await contracts.curve.balanceOf(player1.address);
      governanceTokenPlayer2BalanceAfterWithdraw = await contracts.curve.balanceOf(player2.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenPlayer1BalanceAfterWithdraw = await contracts.mobi.balanceOf(player1.address);
      governanceTokenPlayer2BalanceAfterWithdraw = await contracts.mobi.balanceOf(player2.address);
    }
    rewardTokenPlayer1BalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player1.address);
    rewardTokenPlayer2BalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player2.address);

    assert(
      ethers.BigNumber.from(rewardTokenPlayer1BalanceAfterWithdraw).gt(
        ethers.BigNumber.from(rewardTokenPlayer1BalanceBeforeWithdraw),
      ),
    );
    assert(
      ethers.BigNumber.from(rewardTokenPlayer2BalanceAfterWithdraw).gt(
        ethers.BigNumber.from(rewardTokenPlayer2BalanceBeforeWithdraw),
      ),
    );
    if (strategyType === "curve" || strategyType === "mobius") {
      assert(
        ethers.BigNumber.from(governanceTokenPlayer1BalanceAfterWithdraw).gt(
          ethers.BigNumber.from(governanceTokenPlayer1BalanceBeforeWithdraw),
        ),
      );
      assert(
        ethers.BigNumber.from(governanceTokenPlayer2BalanceAfterWithdraw).gt(
          ethers.BigNumber.from(governanceTokenPlayer2BalanceBeforeWithdraw),
        ),
      );
    }
  });

  it("make sure no rewards are claimed if admin enables the reward disable flag", async () => {
    let governanceTokenRewards = 0;
    await contracts.goodGhosting.disableClaimingRewardTokens();

    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player2,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
    );
    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
    );

    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await makeDeposit(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);

    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);

    await contracts.goodGhosting.connect(player1).withdraw("9000");
    await contracts.goodGhosting.connect(player2).withdraw("800000000000000000");

    if (strategyType === "curve") {
      governanceTokenRewards = await contracts.curve.balanceOf(player1.address);
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      governanceTokenRewards = await contracts.mobi.balanceOf(player1.address);
    }
    assert(ethers.BigNumber.from(governanceTokenRewards).eq(ethers.BigNumber.from(0)));
    const rewardTokenBalance = await contracts.rewardToken.balanceOf(player1.address);
    assert(ethers.BigNumber.from(rewardTokenBalance).eq(ethers.BigNumber.from(0)));
  });

  it("reverts if the flexible deposit amount is more than the max. flexible deposit amount set", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await expect(
      contracts.goodGhosting.connect(player1).joinGame(0, ethers.utils.parseEther("20000")),
    ).to.be.revertedWith("INVALID_FLEXIBLE_AMOUNT()");
  });

  it("player join variable pool where there is only incentive amount generated", async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      maxPlayersCount,
      true,
      true,
      true,
      true,
      false,
      false,
      0,
      strategyType,
      1000,
      false,
    );

    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player2,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
    );
    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
    );

    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await makeDeposit(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);

    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);

    const player1BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
    const player1Info = await contracts.goodGhosting.players(player1.address);

    const player2BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);
    const player2Info = await contracts.goodGhosting.players(player2.address);

    const player1BeforeWithdrawIncentiveTokenBalance = await contracts.incentiveToken.balanceOf(player1.address);
    const player2BeforeWithdrawIncentiveTokenBalance = await contracts.incentiveToken.balanceOf(player2.address);

    await contracts.goodGhosting.connect(player1).withdraw("0");
    await contracts.goodGhosting.connect(player2).withdraw("0");
    const player1AfterWithdrawIncentiveTokenBalance = await contracts.incentiveToken.balanceOf(player1.address);
    const player2AfterWithdrawIncentiveTokenBalance = await contracts.incentiveToken.balanceOf(player2.address);
    const player1AfterWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
    const player2AfterWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);

    const player1Difference = player1AfterWithdrawBalance.sub(player1BeforeWithdrawBalance);
    const player2Difference = player2AfterWithdrawBalance.sub(player2BeforeWithdrawBalance);

    const player1IncentiveTokenDifference = player1AfterWithdrawIncentiveTokenBalance.sub(
      player1BeforeWithdrawIncentiveTokenBalance,
    );
    const player2IncentiveTokenDifference = player2AfterWithdrawIncentiveTokenBalance.sub(
      player2BeforeWithdrawIncentiveTokenBalance,
    );

    assert(player2IncentiveTokenDifference.gt(player1IncentiveTokenDifference));
    assert(player1Difference.eq(player1Info.amountPaid));
    assert(player2Difference.eq(player2Info.amountPaid));
    assert(player2Difference.gt(player1Difference));
  });

  if (strategyType === "curve") {
    beforeEach(async () => {
      contracts = await deployPool(
        depositCount,
        segmentLength,
        segmentPayment,
        1,
        0,
        maxPlayersCount,
        true,
        false,
        true,
        true,
        false,
        false,
        1,
        strategyType,
        1000,
        false,
      );
    });

    it("players are able to withdraw in case there is a impermanent loss in a curve strategy atricrypto pool", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player2,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
        );
        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player1,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
        );
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      const player1BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
      const player1Info = await contracts.goodGhosting.players(player1.address);

      const player2BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);
      const player2Info = await contracts.goodGhosting.players(player2.address);

      await contracts.curveGauge.connect(deployer).drain(ethers.utils.parseEther("5"));
      await contracts.curvePool.connect(deployer).drain(ethers.utils.parseEther("5"));

      await contracts.goodGhosting.connect(player1).withdraw("9000");
      await contracts.goodGhosting.connect(player2).withdraw("9000");
      const player1AfterWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
      const player2AfterWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);

      const player1Difference = player1AfterWithdrawBalance.sub(player1BeforeWithdrawBalance);
      const player2Difference = player2AfterWithdrawBalance.sub(player2BeforeWithdrawBalance);

      assert(player1Difference.lt(player1Info.amountPaid));
      assert(player2Difference.lt(player2Info.amountPaid));
      assert(player2Difference.gt(player1Difference));
    });

    it("reverts if flexible deposit amounts are enabled and the player deposit different amount in different segments in a curve strategy atricrypto pool", async () => {
      const accounts = await ethers.getSigners();
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        if (index == 1) {
          await approveToken(contracts.inboundToken, player1, contracts.goodGhosting.address, segmentPayment);
          await expect(contracts.goodGhosting.connect(player1).makeDeposit(0, segmentPayment)).to.be.revertedWith(
            "INVALID_FLEXIBLE_AMOUNT()",
          );

          await approveToken(contracts.inboundToken, player2, contracts.goodGhosting.address, segmentPayment);
          await expect(contracts.goodGhosting.connect(player2).makeDeposit(0, segmentPayment)).to.be.revertedWith(
            "INVALID_FLEXIBLE_AMOUNT()",
          );
        }
      }
    });

    it("2 players join the game with different amounts and deposit those amounts throughout and get interest accordingly on withdraw in a curve strategy atricrypto pool", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);

        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player2,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
        );
        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player1,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
        );
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      // mocks interest generation
      await mintTokens(contracts.inboundToken, deployer.address);

      await mintTokens(contracts.inboundToken, deployer.address);
      const tokenBalance = await contracts.inboundToken.balanceOf(deployer.address);
      await contracts.inboundToken.connect(deployer).approve(contracts.curvePool.address, tokenBalance);

      await contracts.curvePool.connect(deployer).send_liquidity(ethers.utils.parseEther("20"));
      await contracts.curvePool.connect(deployer).approve(contracts.curveGauge.address, tokenBalance);
      await contracts.curveGauge.connect(deployer).deposit(ethers.utils.parseEther("20"));

      await contracts.curveGauge.connect(deployer).transfer(contracts.strategy.address, ethers.utils.parseEther("10"));

      const player1Info = await contracts.goodGhosting.players(player1.address);
      const player2Info = await contracts.goodGhosting.players(player2.address);

      let cummalativePlayer1IndexBeforeWithdraw = ethers.BigNumber.from(0),
        cummalativePlayer2IndexBeforeWithdraw = ethers.BigNumber.from(0);
      for (let i = 0; i <= player1Info.mostRecentSegmentPaid; i++) {
        let index1 = await contracts.goodGhosting.playerIndex(player1.address, i);
        cummalativePlayer1IndexBeforeWithdraw = cummalativePlayer1IndexBeforeWithdraw.add(
          ethers.BigNumber.from(index1.toString()),
        );
      }

      for (let i = 0; i <= player2Info.mostRecentSegmentPaid; i++) {
        let index2 = await contracts.goodGhosting.playerIndex(player2.address, i);
        cummalativePlayer2IndexBeforeWithdraw = cummalativePlayer2IndexBeforeWithdraw.add(
          ethers.BigNumber.from(index2.toString()),
        );
      }
      // since player1 deposited high amount the player index is more
      assert(cummalativePlayer1IndexBeforeWithdraw.lt(cummalativePlayer2IndexBeforeWithdraw));

      const player1BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player1.address);
      await contracts.goodGhosting.connect(player1).withdraw(0);
      const player1BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player1.address);
      const player2BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player2.address);
      await contracts.goodGhosting.connect(player2).withdraw("800000000000000000");
      const player2BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player2.address);

      // since player1 deposited high amount it get's more interest
      assert(
        player1BalanceAfterWithdraw
          .sub(player1BalanceBeforeWithdraw)
          .lt(player2BalanceAfterWithdraw.sub(player2BalanceBeforeWithdraw)),
      );
    });

    it("2 players join the game with different amounts and deposit different amounts at different times throughout and get interest accordingly on withdraw in a curve strategy atricrypto pool", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);

        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player2,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
        );
        if (index == 2) {
          await ethers.provider.send("evm_increaseTime", [segmentLength / 2]);
          await ethers.provider.send("evm_mine", []);
        }
        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player1,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
        );
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      // mocks interest generation
      await mintTokens(contracts.inboundToken, deployer.address);

      await mintTokens(contracts.inboundToken, deployer.address);
      const tokenBalance = await contracts.inboundToken.balanceOf(deployer.address);
      await contracts.inboundToken.connect(deployer).approve(contracts.curvePool.address, tokenBalance);

      await contracts.curvePool.connect(deployer).send_liquidity(ethers.utils.parseEther("100"));
      await contracts.curvePool.connect(deployer).approve(contracts.curveGauge.address, tokenBalance);
      await contracts.curveGauge.connect(deployer).deposit(ethers.utils.parseEther("100"));

      await contracts.curveGauge.connect(deployer).transfer(contracts.strategy.address, ethers.utils.parseEther("50"));

      const player1Info = await contracts.goodGhosting.players(player1.address);
      const player2Info = await contracts.goodGhosting.players(player2.address);
      let cummalativePlayer1IndexBeforeWithdraw = ethers.BigNumber.from(0),
        cummalativePlayer2IndexBeforeWithdraw = ethers.BigNumber.from(0);
      for (let i = 0; i <= player1Info.mostRecentSegmentPaid; i++) {
        let index1 = await contracts.goodGhosting.playerIndex(player1.address, i);
        cummalativePlayer1IndexBeforeWithdraw = cummalativePlayer1IndexBeforeWithdraw.add(
          ethers.BigNumber.from(index1.toString()),
        );
      }

      for (let i = 0; i <= player2Info.mostRecentSegmentPaid; i++) {
        let index2 = await contracts.goodGhosting.playerIndex(player2.address, i);
        cummalativePlayer2IndexBeforeWithdraw = cummalativePlayer2IndexBeforeWithdraw.add(
          ethers.BigNumber.from(index2.toString()),
        );
      }

      const player1BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player1.address);
      const player1RewardBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player1.address);
      let player1GovernanceTokenBalanceBeforeWithdraw = ethers.BigNumber.from(0);
      if (strategyType === "curve") {
        player1GovernanceTokenBalanceBeforeWithdraw = await contracts.curve.balanceOf(player1.address);
      } else if (strategyType === "mobius") {
        player1GovernanceTokenBalanceBeforeWithdraw = await contracts.mobi.balanceOf(player1.address);
      }

      let result = await contracts.goodGhosting.connect(player1).withdraw(0);

      const player1RewardBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player1.address);
      const player1BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player1.address);
      let player1GovernanceTokenBalanceAfterWithdraw = ethers.BigNumber.from(0);
      if (strategyType === "curve") {
        player1GovernanceTokenBalanceAfterWithdraw = await contracts.curve.balanceOf(player1.address);
      } else if (strategyType === "mobius") {
        player1GovernanceTokenBalanceAfterWithdraw = await contracts.mobi.balanceOf(player1.address);
      }

      const rewardDifferenceForPlayer1 = player1RewardBalanceAfterWithdraw.sub(player1RewardBalanceBeforeWithdraw);
      const governanceTokenBalanceDifferenceForPlayer1 = player1GovernanceTokenBalanceAfterWithdraw.sub(
        player1GovernanceTokenBalanceBeforeWithdraw,
      );

      const differenceForPlayer1 = player1BalanceAfterWithdraw.sub(player1BalanceBeforeWithdraw);
      const interestEarnedByPlayer1 = differenceForPlayer1.sub(ethers.BigNumber.from(player1Info.amountPaid));

      const player1Deposit = ethers.BigNumber.from(player1Info.amountPaid);

      const playerRewardAmounts: any = [];
      playerRewardAmounts[0] = rewardDifferenceForPlayer1.toString();
      playerRewardAmounts[1] = governanceTokenBalanceDifferenceForPlayer1.toString();
      await expect(result)
        .to.emit(contracts.goodGhosting, "Withdrawal")
        .withArgs(
          player1.address,
          player1Deposit.add(interestEarnedByPlayer1),
          ethers.BigNumber.from(0),
          playerRewardAmounts,
        );

      const player2Deposit = ethers.BigNumber.from(player2Info.amountPaid);

      const player2BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player2.address);
      const player2RewardBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player2.address);
      let player2GovernanceTokenBalanceBeforeWithdraw = ethers.BigNumber.from(0);
      player2GovernanceTokenBalanceBeforeWithdraw = await contracts.curve.balanceOf(player2.address);

      result = await contracts.goodGhosting.connect(player2).withdraw("800000000000000000");

      const player2RewardBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player2.address);
      const player2BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player2.address);
      let player2GovernanceTokenBalanceAfterWithdraw = ethers.BigNumber.from(0);
      player2GovernanceTokenBalanceAfterWithdraw = await contracts.curve.balanceOf(player2.address);

      const governanceTokenBalanceDifferenceForPlayer2 = player2GovernanceTokenBalanceAfterWithdraw.sub(
        player2GovernanceTokenBalanceBeforeWithdraw,
      );

      const rewardDifferenceForPlayer2 = player2RewardBalanceAfterWithdraw.sub(player2RewardBalanceBeforeWithdraw);
      const differenceForPlayer2 = player2BalanceAfterWithdraw.sub(player2BalanceBeforeWithdraw);
      const interestEarnedByPlayer2 = differenceForPlayer2.sub(ethers.BigNumber.from(player2Info.amountPaid));
      assert(interestEarnedByPlayer2.gt(interestEarnedByPlayer1));
      assert(rewardDifferenceForPlayer2.gt(rewardDifferenceForPlayer1));

      const rewardAmounts: any = [];
      rewardAmounts[0] = rewardDifferenceForPlayer2.toString();
      rewardAmounts[1] = governanceTokenBalanceDifferenceForPlayer2.toString();
      await expect(result)
        .to.emit(contracts.goodGhosting, "Withdrawal")
        .withArgs(
          player2.address,
          player2Deposit.add(interestEarnedByPlayer2),
          ethers.BigNumber.from(0),
          rewardAmounts,
        );
    });

    it("2 players join the game with different amounts and deposit those amounts throughout and get interest accordingly on withdraw with admin fees in a curve strategy atricrypto pool", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      contracts = await deployPool(
        depositCount,
        segmentLength,
        segmentPayment,
        1,
        1,
        maxPlayersCount,
        true,
        false,
        true,
        true,
        false,
        false,
        1,
        strategyType,
        1000,
        false,
      );

      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);

        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player2,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
        );
        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player1,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
        );
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      // mocks interest generation
      await mintTokens(contracts.inboundToken, deployer.address);

      await mintTokens(contracts.inboundToken, deployer.address);
      const tokenBalance = await contracts.inboundToken.balanceOf(deployer.address);
      await contracts.inboundToken.connect(deployer).approve(contracts.curvePool.address, tokenBalance);

      await contracts.curvePool.connect(deployer).send_liquidity(ethers.utils.parseEther("20"));
      await contracts.curvePool.connect(deployer).approve(contracts.curveGauge.address, tokenBalance);
      await contracts.curveGauge.connect(deployer).deposit(ethers.utils.parseEther("20"));

      await contracts.curveGauge.connect(deployer).transfer(contracts.strategy.address, ethers.utils.parseEther("10"));

      const player1Info = await contracts.goodGhosting.players(player1.address);
      const player2Info = await contracts.goodGhosting.players(player2.address);

      let cummalativePlayer1IndexBeforeWithdraw = ethers.BigNumber.from(0),
        cummalativePlayer2IndexBeforeWithdraw = ethers.BigNumber.from(0);
      for (let i = 0; i <= player1Info.mostRecentSegmentPaid; i++) {
        let index1 = await contracts.goodGhosting.playerIndex(player1.address, i);
        cummalativePlayer1IndexBeforeWithdraw = cummalativePlayer1IndexBeforeWithdraw.add(
          ethers.BigNumber.from(index1.toString()),
        );
      }

      for (let i = 0; i <= player2Info.mostRecentSegmentPaid; i++) {
        let index2 = await contracts.goodGhosting.playerIndex(player2.address, i);
        cummalativePlayer2IndexBeforeWithdraw = cummalativePlayer2IndexBeforeWithdraw.add(
          ethers.BigNumber.from(index2.toString()),
        );
      }
      // since player1 deposited high amount the player index is more
      assert(cummalativePlayer1IndexBeforeWithdraw.lt(cummalativePlayer2IndexBeforeWithdraw));

      const player1BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player1.address);
      await contracts.goodGhosting.connect(player1).withdraw(0);
      const player1BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player1.address);
      const player2BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player2.address);
      await contracts.goodGhosting.connect(player2).withdraw("800000000000000000");
      const player2BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player2.address);
      const adminCalculatedFee = await contracts.goodGhosting.adminFeeAmount(0);
      const adminBalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(deployer.address);
      await contracts.goodGhosting.connect(deployer).adminFeeWithdraw(0);
      const adminBalanceAfterWithdraw = await contracts.inboundToken.balanceOf(deployer.address);
      assert(adminBalanceAfterWithdraw.gte(adminBalanceBeforeWithdraw));
      const adminBalanceDiff = adminBalanceAfterWithdraw.sub(adminBalanceBeforeWithdraw).toString();
      assert(ethers.BigNumber.from(adminBalanceDiff).lte(adminCalculatedFee));
      // since player1 deposited high amount it get's more interest
      assert(
        player1BalanceAfterWithdraw
          .sub(player1BalanceBeforeWithdraw)
          .lt(player2BalanceAfterWithdraw.sub(player2BalanceBeforeWithdraw)),
      );
    });

    it("admin is able to withdraw interest when there are no winners in a curve strategy atricrypto pool", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      contracts = await deployPool(
        depositCount,
        segmentLength,
        segmentPayment,
        1,
        1,
        maxPlayersCount,
        true,
        false,
        true,
        true,
        false,
        false,
        1,
        strategyType,
        1000,
        false,
      );

      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      // mocks interest generation
      await mintTokens(contracts.inboundToken, deployer.address);

      await mintTokens(contracts.inboundToken, deployer.address);
      const tokenBalance = await contracts.inboundToken.balanceOf(deployer.address);
      await contracts.inboundToken.connect(deployer).approve(contracts.curvePool.address, tokenBalance);

      await contracts.curvePool.connect(deployer).send_liquidity(ethers.utils.parseEther("20"));
      await contracts.curvePool.connect(deployer).approve(contracts.curveGauge.address, tokenBalance);
      await contracts.curveGauge.connect(deployer).deposit(ethers.utils.parseEther("20"));

      await contracts.curveGauge.connect(deployer).transfer(contracts.strategy.address, ethers.utils.parseEther("10"));

      const adminBalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(deployer.address);
      const adminRewardBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
      let adminGovernanceTokenBalanceBeforeWithdraw = ethers.BigNumber.from(0);
      adminGovernanceTokenBalanceBeforeWithdraw = await contracts.curve.balanceOf(deployer.address);
      await contracts.goodGhosting.connect(player1).withdraw(0);
      await contracts.goodGhosting.connect(deployer).adminFeeWithdraw(0);
      const adminRewardBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
      let adminGovernanceTokenBalanceAfterWithdraw = ethers.BigNumber.from(0);
      adminGovernanceTokenBalanceAfterWithdraw = await contracts.curve.balanceOf(deployer.address);

      assert(adminGovernanceTokenBalanceAfterWithdraw.gt(adminGovernanceTokenBalanceBeforeWithdraw));

      const adminBalanceAfterWithdraw = await contracts.inboundToken.balanceOf(deployer.address);
      const adminBalanceDiff = adminBalanceAfterWithdraw.sub(adminBalanceBeforeWithdraw).toString();
      const adminCalculatedFee = await contracts.goodGhosting.adminFeeAmount(0);
      assert(ethers.BigNumber.from(adminBalanceDiff).eq(adminCalculatedFee));
      assert(adminBalanceAfterWithdraw.gt(adminBalanceBeforeWithdraw));
      assert(adminRewardBalanceAfterWithdraw.gt(adminRewardBalanceBeforeWithdraw));
    });
  }

  it("2 players join the game with different amounts and deposit those amounts throughout and get interest accordingly on withdraw", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player2,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
    );
    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
    );

    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      await makeDeposit(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await makeDeposit(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);

    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);

    // mocks interest generation
    await mintTokens(contracts.inboundToken, deployer.address);

    if (strategyType === "aave" || strategyType === "aaveV3") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
      await contracts.lendingPool
        .connect(deployer)
        .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
      const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

      await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
    } else if (strategyType === "curve") {
      await mintTokens(contracts.inboundToken, deployer.address);
      const tokenBalance = await contracts.inboundToken.balanceOf(deployer.address);
      await contracts.inboundToken.connect(deployer).approve(contracts.curvePool.address, tokenBalance);

      await contracts.curvePool.connect(deployer).send_liquidity(ethers.utils.parseEther("20"));
      await contracts.curvePool.connect(deployer).approve(contracts.curveGauge.address, tokenBalance);
      await contracts.curveGauge.connect(deployer).deposit(ethers.utils.parseEther("20"));

      await contracts.curveGauge.connect(deployer).transfer(contracts.strategy.address, ethers.utils.parseEther("10"));
    } else if (strategyType === "mobius") {
      await mintTokens(contracts.inboundToken, deployer.address);
      const tokenBalance = await contracts.inboundToken.balanceOf(deployer.address);

      await contracts.inboundToken.connect(deployer).approve(contracts.mobiPool.address, tokenBalance);

      await contracts.mobiPool.connect(deployer).send_liquidity(ethers.utils.parseEther("20"));

      await contracts.mobiPool.connect(deployer).approve(contracts.mobiGauge.address, tokenBalance);
      await contracts.mobiGauge.connect(deployer).deposit(ethers.utils.parseEther("20"));

      await contracts.mobiGauge.connect(deployer).transfer(contracts.strategy.address, ethers.utils.parseEther("10"));
    }

    const player1Info = await contracts.goodGhosting.players(player1.address);
    const player2Info = await contracts.goodGhosting.players(player2.address);

    let cummalativePlayer1IndexBeforeWithdraw = ethers.BigNumber.from(0),
      cummalativePlayer2IndexBeforeWithdraw = ethers.BigNumber.from(0);
    for (let i = 0; i <= player1Info.mostRecentSegmentPaid; i++) {
      let index1 = await contracts.goodGhosting.playerIndex(player1.address, i);
      cummalativePlayer1IndexBeforeWithdraw = cummalativePlayer1IndexBeforeWithdraw.add(
        ethers.BigNumber.from(index1.toString()),
      );
    }

    for (let i = 0; i <= player2Info.mostRecentSegmentPaid; i++) {
      let index2 = await contracts.goodGhosting.playerIndex(player2.address, i);
      cummalativePlayer2IndexBeforeWithdraw = cummalativePlayer2IndexBeforeWithdraw.add(
        ethers.BigNumber.from(index2.toString()),
      );
    }
    // since player1 deposited high amount the player index is more
    assert(cummalativePlayer1IndexBeforeWithdraw.lt(cummalativePlayer2IndexBeforeWithdraw));

    const player1BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player1.address);
    await contracts.goodGhosting.connect(player1).withdraw(0);
    const player1BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player1.address);
    const player2BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player2.address);
    await contracts.goodGhosting.connect(player2).withdraw("800000000000000000");
    const player2BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player2.address);

    // since player1 deposited high amount it get's more interest
    assert(
      player1BalanceAfterWithdraw
        .sub(player1BalanceBeforeWithdraw)
        .lt(player2BalanceAfterWithdraw.sub(player2BalanceBeforeWithdraw)),
    );
  });

  it("2 players join the game with different amounts and deposit different amounts at different times throughout and get interest accordingly on withdraw", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player2,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
    );
    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
    );

    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      await makeDeposit(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      if (index == 2) {
        await ethers.provider.send("evm_increaseTime", [segmentLength / 2]);
        await ethers.provider.send("evm_mine", []);
      }
      await makeDeposit(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);

    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);

    // mocks interest generation
    await mintTokens(contracts.inboundToken, deployer.address);

    if (strategyType === "aave" || strategyType === "aaveV3") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
      await contracts.lendingPool
        .connect(deployer)
        .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
      const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

      await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
    } else if (strategyType === "curve") {
      await mintTokens(contracts.inboundToken, deployer.address);
      const tokenBalance = await contracts.inboundToken.balanceOf(deployer.address);
      await contracts.inboundToken.connect(deployer).approve(contracts.curvePool.address, tokenBalance);

      await contracts.curvePool.connect(deployer).send_liquidity(ethers.utils.parseEther("100"));
      await contracts.curvePool.connect(deployer).approve(contracts.curveGauge.address, tokenBalance);
      await contracts.curveGauge.connect(deployer).deposit(ethers.utils.parseEther("100"));

      await contracts.curveGauge.connect(deployer).transfer(contracts.strategy.address, ethers.utils.parseEther("50"));
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      await mintTokens(contracts.inboundToken, deployer.address);
      const tokenBalance = await contracts.inboundToken.balanceOf(deployer.address);

      await contracts.inboundToken.connect(deployer).approve(contracts.mobiPool.address, tokenBalance);

      await contracts.mobiPool.connect(deployer).send_liquidity(ethers.utils.parseEther("100"));

      await contracts.mobiPool.connect(deployer).approve(contracts.mobiGauge.address, tokenBalance);
      await contracts.mobiGauge.connect(deployer).deposit(ethers.utils.parseEther("100"));

      await contracts.mobiGauge.connect(deployer).transfer(contracts.strategy.address, ethers.utils.parseEther("50"));
    }

    const player1Info = await contracts.goodGhosting.players(player1.address);
    const player2Info = await contracts.goodGhosting.players(player2.address);
    let cummalativePlayer1IndexBeforeWithdraw = ethers.BigNumber.from(0),
      cummalativePlayer2IndexBeforeWithdraw = ethers.BigNumber.from(0);
    for (let i = 0; i <= player1Info.mostRecentSegmentPaid; i++) {
      let index1 = await contracts.goodGhosting.playerIndex(player1.address, i);
      cummalativePlayer1IndexBeforeWithdraw = cummalativePlayer1IndexBeforeWithdraw.add(
        ethers.BigNumber.from(index1.toString()),
      );
    }

    for (let i = 0; i <= player2Info.mostRecentSegmentPaid; i++) {
      let index2 = await contracts.goodGhosting.playerIndex(player2.address, i);
      cummalativePlayer2IndexBeforeWithdraw = cummalativePlayer2IndexBeforeWithdraw.add(
        ethers.BigNumber.from(index2.toString()),
      );
    }

    const player1BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player1.address);
    const player1RewardBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player1.address);
    let player1GovernanceTokenBalanceBeforeWithdraw = ethers.BigNumber.from(0);
    if (strategyType === "curve") {
      player1GovernanceTokenBalanceBeforeWithdraw = await contracts.curve.balanceOf(player1.address);
    } else if (strategyType === "mobius") {
      player1GovernanceTokenBalanceBeforeWithdraw = await contracts.mobi.balanceOf(player1.address);
    }

    let result = await contracts.goodGhosting.connect(player1).withdraw(0);

    const player1RewardBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player1.address);
    const player1BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player1.address);
    let player1GovernanceTokenBalanceAfterWithdraw = ethers.BigNumber.from(0);
    if (strategyType === "curve") {
      player1GovernanceTokenBalanceAfterWithdraw = await contracts.curve.balanceOf(player1.address);
    } else if (strategyType === "mobius") {
      player1GovernanceTokenBalanceAfterWithdraw = await contracts.mobi.balanceOf(player1.address);
    }

    const rewardDifferenceForPlayer1 = player1RewardBalanceAfterWithdraw.sub(player1RewardBalanceBeforeWithdraw);
    const governanceTokenBalanceDifferenceForPlayer1 = player1GovernanceTokenBalanceAfterWithdraw.sub(
      player1GovernanceTokenBalanceBeforeWithdraw,
    );

    const differenceForPlayer1 = player1BalanceAfterWithdraw.sub(player1BalanceBeforeWithdraw);
    const interestEarnedByPlayer1 = differenceForPlayer1.sub(ethers.BigNumber.from(player1Info.amountPaid));

    const player1Deposit = ethers.BigNumber.from(player1Info.amountPaid);
    const rewardAmounts: any = [];
    rewardAmounts[0] = rewardDifferenceForPlayer1.toString();
    if (strategyType !== "aave" && strategyType !== "aaveV3" && strategyType !== "no_strategy") {
      rewardAmounts[1] = governanceTokenBalanceDifferenceForPlayer1.toString();
    }

    await expect(result)
      .to.emit(contracts.goodGhosting, "Withdrawal")
      .withArgs(player1.address, player1Deposit.add(interestEarnedByPlayer1), ethers.BigNumber.from(0), rewardAmounts);

    const player2Deposit = ethers.BigNumber.from(player2Info.amountPaid);

    const player2BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player2.address);
    const player2RewardBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player2.address);
    let player2GovernanceTokenBalanceBeforeWithdraw = ethers.BigNumber.from(0);
    if (strategyType === "curve") {
      player2GovernanceTokenBalanceBeforeWithdraw = await contracts.curve.balanceOf(player2.address);
    } else if (strategyType === "mobius") {
      player2GovernanceTokenBalanceBeforeWithdraw = await contracts.mobi.balanceOf(player2.address);
    }
    result = await contracts.goodGhosting.connect(player2).withdraw("800000000000000000");

    const player2RewardBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player2.address);
    const player2BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player2.address);
    let player2GovernanceTokenBalanceAfterWithdraw = ethers.BigNumber.from(0);
    if (strategyType === "curve") {
      player2GovernanceTokenBalanceAfterWithdraw = await contracts.curve.balanceOf(player2.address);
    } else if (strategyType === "mobius") {
      player2GovernanceTokenBalanceAfterWithdraw = await contracts.mobi.balanceOf(player2.address);
    }
    const governanceTokenBalanceDifferenceForPlayer2 = player2GovernanceTokenBalanceAfterWithdraw.sub(
      player2GovernanceTokenBalanceBeforeWithdraw,
    );

    const rewardDifferenceForPlayer2 = player2RewardBalanceAfterWithdraw.sub(player2RewardBalanceBeforeWithdraw);
    const differenceForPlayer2 = player2BalanceAfterWithdraw.sub(player2BalanceBeforeWithdraw);
    const interestEarnedByPlayer2 = differenceForPlayer2.sub(ethers.BigNumber.from(player2Info.amountPaid));
    if (strategyType !== "no_strategy") {
      assert(interestEarnedByPlayer2.gt(interestEarnedByPlayer1));
    } else {
      assert(interestEarnedByPlayer2.eq(interestEarnedByPlayer1));
    }
    assert(rewardDifferenceForPlayer2.gt(rewardDifferenceForPlayer1));

    const playerRewardAmounts: any = [];
    playerRewardAmounts[0] = rewardDifferenceForPlayer2.toString();
    if (strategyType !== "aave" && strategyType !== "aaveV3" && strategyType !== "no_strategy") {
      playerRewardAmounts[1] = governanceTokenBalanceDifferenceForPlayer2.toString();
    }
    await expect(result)
      .to.emit(contracts.goodGhosting, "Withdrawal")
      .withArgs(
        player2.address,
        player2Deposit.add(interestEarnedByPlayer2),
        ethers.BigNumber.from(0),
        playerRewardAmounts,
      );
  });

  it("2 players join the game with different amounts and deposit those amounts throughout and get interest accordingly on withdraw with admin fees", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];
    const player2 = accounts[3];

    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      true,
      false,
      false,
      0,
      strategyType,
      1000,
      false,
    );

    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player2,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
    );
    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
    );

    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      await makeDeposit(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await makeDeposit(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);

    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);

    // mocks interest generation
    await mintTokens(contracts.inboundToken, deployer.address);

    if (strategyType === "aave" || strategyType === "aaveV3") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
      await contracts.lendingPool
        .connect(deployer)
        .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
      const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

      await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
    } else if (strategyType === "curve") {
      await mintTokens(contracts.inboundToken, deployer.address);
      const tokenBalance = await contracts.inboundToken.balanceOf(deployer.address);
      await contracts.inboundToken.connect(deployer).approve(contracts.curvePool.address, tokenBalance);

      await contracts.curvePool.connect(deployer).send_liquidity(ethers.utils.parseEther("20"));
      await contracts.curvePool.connect(deployer).approve(contracts.curveGauge.address, tokenBalance);
      await contracts.curveGauge.connect(deployer).deposit(ethers.utils.parseEther("20"));

      await contracts.curveGauge.connect(deployer).transfer(contracts.strategy.address, ethers.utils.parseEther("10"));
    } else if (strategyType === "mobius") {
      await mintTokens(contracts.inboundToken, deployer.address);
      const tokenBalance = await contracts.inboundToken.balanceOf(deployer.address);

      await contracts.inboundToken.connect(deployer).approve(contracts.mobiPool.address, tokenBalance);

      await contracts.mobiPool.connect(deployer).send_liquidity(ethers.utils.parseEther("20"));

      await contracts.mobiPool.connect(deployer).approve(contracts.mobiGauge.address, tokenBalance);
      await contracts.mobiGauge.connect(deployer).deposit(ethers.utils.parseEther("20"));

      await contracts.mobiGauge.connect(deployer).transfer(contracts.strategy.address, ethers.utils.parseEther("10"));
    }

    const player1Info = await contracts.goodGhosting.players(player1.address);
    const player2Info = await contracts.goodGhosting.players(player2.address);

    let cummalativePlayer1IndexBeforeWithdraw = ethers.BigNumber.from(0),
      cummalativePlayer2IndexBeforeWithdraw = ethers.BigNumber.from(0);
    for (let i = 0; i <= player1Info.mostRecentSegmentPaid; i++) {
      let index1 = await contracts.goodGhosting.playerIndex(player1.address, i);
      cummalativePlayer1IndexBeforeWithdraw = cummalativePlayer1IndexBeforeWithdraw.add(
        ethers.BigNumber.from(index1.toString()),
      );
    }

    for (let i = 0; i <= player2Info.mostRecentSegmentPaid; i++) {
      let index2 = await contracts.goodGhosting.playerIndex(player2.address, i);
      cummalativePlayer2IndexBeforeWithdraw = cummalativePlayer2IndexBeforeWithdraw.add(
        ethers.BigNumber.from(index2.toString()),
      );
    }
    // since player1 deposited high amount the player index is more
    assert(cummalativePlayer1IndexBeforeWithdraw.lt(cummalativePlayer2IndexBeforeWithdraw));

    const player1BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player1.address);
    await contracts.goodGhosting.connect(player1).withdraw(0);
    const player1BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player1.address);
    const player2BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player2.address);
    await contracts.goodGhosting.connect(player2).withdraw("800000000000000000");
    const player2BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player2.address);
    const adminCalculatedFee = await contracts.goodGhosting.adminFeeAmount(0);
    const adminBalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(deployer.address);
    await contracts.goodGhosting.connect(deployer).adminFeeWithdraw(0);
    const adminBalanceAfterWithdraw = await contracts.inboundToken.balanceOf(deployer.address);
    assert(adminBalanceAfterWithdraw.gte(adminBalanceBeforeWithdraw));
    const adminBalanceDiff = adminBalanceAfterWithdraw.sub(adminBalanceBeforeWithdraw).toString();
    assert(ethers.BigNumber.from(adminBalanceDiff).lte(adminCalculatedFee));
    // since player1 deposited high amount it get's more interest
    assert(
      player1BalanceAfterWithdraw
        .sub(player1BalanceBeforeWithdraw)
        .lt(player2BalanceAfterWithdraw.sub(player2BalanceBeforeWithdraw)),
    );
  });

  it("admin is able to withdraw interest when there are no winners", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];
    const player2 = accounts[3];

    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      true,
      false,
      false,
      0,
      strategyType,
      1000,
      false,
    );

    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player2,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
    );
    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
    );

    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);

    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);

    // mocks interest generation
    await mintTokens(contracts.inboundToken, deployer.address);

    if (strategyType === "aave" || strategyType === "aaveV3") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.lendingPool.address, ethers.utils.parseEther("100000"));
      await contracts.lendingPool
        .connect(deployer)
        .deposit(contracts.inboundToken.address, ethers.utils.parseEther("100000"), contracts.lendingPool.address, 0);
      const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

      await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("100000"));
    } else if (strategyType === "curve") {
      await mintTokens(contracts.inboundToken, deployer.address);
      const tokenBalance = await contracts.inboundToken.balanceOf(deployer.address);
      await contracts.inboundToken.connect(deployer).approve(contracts.curvePool.address, tokenBalance);

      await contracts.curvePool.connect(deployer).send_liquidity(ethers.utils.parseEther("20"));
      await contracts.curvePool.connect(deployer).approve(contracts.curveGauge.address, tokenBalance);
      await contracts.curveGauge.connect(deployer).deposit(ethers.utils.parseEther("20"));

      await contracts.curveGauge.connect(deployer).transfer(contracts.strategy.address, ethers.utils.parseEther("10"));
    } else if (strategyType === "mobius") {
      contracts.rewardToken = contracts.minter;
      await mintTokens(contracts.inboundToken, deployer.address);
      const tokenBalance = await contracts.inboundToken.balanceOf(deployer.address);

      await contracts.inboundToken.connect(deployer).approve(contracts.mobiPool.address, tokenBalance);

      await contracts.mobiPool.connect(deployer).send_liquidity(ethers.utils.parseEther("20"));

      await contracts.mobiPool.connect(deployer).approve(contracts.mobiGauge.address, tokenBalance);
      await contracts.mobiGauge.connect(deployer).deposit(ethers.utils.parseEther("20"));

      await contracts.mobiGauge.connect(deployer).transfer(contracts.strategy.address, ethers.utils.parseEther("10"));
    }
    const adminBalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(deployer.address);
    const adminRewardBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
    let adminGovernanceTokenBalanceBeforeWithdraw = ethers.BigNumber.from(0);
    if (strategyType === "curve") {
      adminGovernanceTokenBalanceBeforeWithdraw = await contracts.curve.balanceOf(deployer.address);
    } else if (strategyType === "mobius") {
      adminGovernanceTokenBalanceBeforeWithdraw = await contracts.mobi.balanceOf(deployer.address);
    }
    await contracts.goodGhosting.connect(player1).withdraw(0);
    await contracts.goodGhosting.connect(deployer).adminFeeWithdraw(0);
    const adminRewardBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
    let adminGovernanceTokenBalanceAfterWithdraw = ethers.BigNumber.from(0);
    if (strategyType === "curve") {
      adminGovernanceTokenBalanceAfterWithdraw = await contracts.curve.balanceOf(deployer.address);
    } else if (strategyType === "mobius") {
      adminGovernanceTokenBalanceAfterWithdraw = await contracts.mobi.balanceOf(deployer.address);
    }

    if (strategyType === "curve" || strategyType === "mobius") {
      assert(adminGovernanceTokenBalanceAfterWithdraw.gt(adminGovernanceTokenBalanceBeforeWithdraw));
    }
    const adminBalanceAfterWithdraw = await contracts.inboundToken.balanceOf(deployer.address);
    const adminBalanceDiff = adminBalanceAfterWithdraw.sub(adminBalanceBeforeWithdraw).toString();
    const adminCalculatedFee = await contracts.goodGhosting.adminFeeAmount(0);
    assert(ethers.BigNumber.from(adminBalanceDiff).eq(adminCalculatedFee));
    if (strategyType !== "no_strategy") {
      assert(adminBalanceAfterWithdraw.gt(adminBalanceBeforeWithdraw));
    } else {
      assert(adminBalanceAfterWithdraw.eq(adminBalanceBeforeWithdraw));
    }
    assert(adminRewardBalanceAfterWithdraw.gt(adminRewardBalanceBeforeWithdraw));
  });

  if (strategyType === "aave" || strategyType === "aaveV3" || strategyType === "no_strategy") {
    it("2 players join a game with transactional token and deposit different amounts at different times throughout and get interest accordingly on withdraw", async () => {
      contracts = await deployPool(
        depositCount,
        segmentLength,
        segmentPayment,
        1,
        1,
        maxPlayersCount,
        false,
        false,
        true,
        true,
        true,
        false,
        0,
        strategyType,
        1000,
        false,
      );
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);

        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player2,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
        );

        await ethers.provider.send("evm_increaseTime", [segmentLength / 3]);
        await ethers.provider.send("evm_mine", []);

        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player1,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
        );
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      if (strategyType !== "no_strategy") {
        // mocks interest generation
        await contracts.lendingPool
          .connect(deployer)
          .depositETH(contracts.lendingPool.address, contracts.lendingPool.address, 0, {
            value: ethers.utils.parseEther("30"),
          });
        const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

        await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("30"));
      }

      const player1Info = await contracts.goodGhosting.players(player1.address);
      const player2Info = await contracts.goodGhosting.players(player2.address);
      let cummalativePlayer1IndexBeforeWithdraw = ethers.BigNumber.from(0),
        cummalativePlayer2IndexBeforeWithdraw = ethers.BigNumber.from(0);
      for (let i = 0; i <= player1Info.mostRecentSegmentPaid; i++) {
        let index1 = await contracts.goodGhosting.playerIndex(player1.address, i);
        cummalativePlayer1IndexBeforeWithdraw = cummalativePlayer1IndexBeforeWithdraw.add(
          ethers.BigNumber.from(index1.toString()),
        );
      }

      for (let i = 0; i <= player2Info.mostRecentSegmentPaid; i++) {
        let index2 = await contracts.goodGhosting.playerIndex(player2.address, i);
        cummalativePlayer2IndexBeforeWithdraw = cummalativePlayer2IndexBeforeWithdraw.add(
          ethers.BigNumber.from(index2.toString()),
        );
      }

      // since player1 deposited high amount the player index is more
      assert(cummalativePlayer1IndexBeforeWithdraw.lt(cummalativePlayer2IndexBeforeWithdraw));

      const player1BalanceBeforeWithdraw = await ethers.provider.getBalance(player1.address);
      const player1RewardBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player1.address);

      let result = await contracts.goodGhosting.connect(player1).withdraw(0);

      const player1RewardBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player1.address);
      const player1BalanceAfterWithdraw = await ethers.provider.getBalance(player1.address);

      const rewardDifferenceForPlayer1 = player1RewardBalanceAfterWithdraw.sub(player1RewardBalanceBeforeWithdraw);

      const differenceForPlayer1 = player1BalanceAfterWithdraw.sub(player1BalanceBeforeWithdraw);
      const interestEarnedByPlayer1 = differenceForPlayer1.sub(ethers.BigNumber.from(player1Info.amountPaid));

      const playerRewardAmounts: any = [];
      playerRewardAmounts[0] = rewardDifferenceForPlayer1.toString();
      // the player1Deposit.add(interestEarnedByPlayer1) is very slightly less than the actual value in event hence just checking for the event emitted
      await expect(result).to.emit(contracts.goodGhosting, "Withdrawal");

      const player2BalanceBeforeWithdraw = await ethers.provider.getBalance(player2.address);
      const player2RewardBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player2.address);

      result = await contracts.goodGhosting.connect(player2).withdraw(0);

      const player2RewardBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player2.address);
      const player2BalanceAfterWithdraw = await ethers.provider.getBalance(player2.address);

      const rewardDifferenceForPlayer2 = player2RewardBalanceAfterWithdraw.sub(player2RewardBalanceBeforeWithdraw);
      const differenceForPlayer2 = player2BalanceAfterWithdraw.sub(player2BalanceBeforeWithdraw);
      const interestEarnedByPlayer2 = differenceForPlayer2.sub(ethers.BigNumber.from(player2Info.amountPaid));
      assert(interestEarnedByPlayer2.gt(interestEarnedByPlayer1));
      assert(rewardDifferenceForPlayer2.gt(rewardDifferenceForPlayer1));

      const rewardAmounts: any = [];
      rewardAmounts[0] = rewardDifferenceForPlayer2.toString();

      // the player2Deposit.add(interestEarnedByPlayer1) is very slightly less than the actual value in event hence just checking for the event emitted
      await expect(result).to.emit(contracts.goodGhosting, "Withdrawal");
    });

    it("2 players join a game with transactional token with different amounts and get interest accordingly on withdraw", async () => {
      contracts = await deployPool(
        depositCount,
        segmentLength,
        segmentPayment,
        1,
        1,
        maxPlayersCount,
        false,
        false,
        true,
        true,
        true,
        false,
        0,
        strategyType,
        1000,
        false,
      );
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);

        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player2,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
        );

        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player1,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
        );
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      if (strategyType !== "no_strategy") {
        // mocks interest generation
        await contracts.lendingPool
          .connect(deployer)
          .depositETH(contracts.lendingPool.address, contracts.lendingPool.address, 0, {
            value: ethers.utils.parseEther("30"),
          });
        const aToken = new ERC20__factory(deployer).attach(await contracts.lendingPool.getLendingPool());

        await aToken.transfer(contracts.strategy.address, ethers.utils.parseEther("30"));
      }

      const player1Info = await contracts.goodGhosting.players(player1.address);
      const player2Info = await contracts.goodGhosting.players(player2.address);
      let cummalativePlayer1IndexBeforeWithdraw = ethers.BigNumber.from(0),
        cummalativePlayer2IndexBeforeWithdraw = ethers.BigNumber.from(0);
      for (let i = 0; i <= player1Info.mostRecentSegmentPaid; i++) {
        let index1 = await contracts.goodGhosting.playerIndex(player1.address, i);
        cummalativePlayer1IndexBeforeWithdraw = cummalativePlayer1IndexBeforeWithdraw.add(
          ethers.BigNumber.from(index1.toString()),
        );
      }

      for (let i = 0; i <= player2Info.mostRecentSegmentPaid; i++) {
        let index2 = await contracts.goodGhosting.playerIndex(player2.address, i);
        cummalativePlayer2IndexBeforeWithdraw = cummalativePlayer2IndexBeforeWithdraw.add(
          ethers.BigNumber.from(index2.toString()),
        );
      }

      const player1BalanceBeforeWithdraw = await await ethers.provider.getBalance(player1.address);
      const player1RewardBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player1.address);

      let result = await contracts.goodGhosting.connect(player1).withdraw(0);

      const player1RewardBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player1.address);
      const player1BalanceAfterWithdraw = await ethers.provider.getBalance(player1.address);

      const rewardDifferenceForPlayer1 = player1RewardBalanceAfterWithdraw.sub(player1RewardBalanceBeforeWithdraw);

      const differenceForPlayer1 = player1BalanceAfterWithdraw.sub(player1BalanceBeforeWithdraw);
      const interestEarnedByPlayer1 = differenceForPlayer1.sub(ethers.BigNumber.from(player1Info.amountPaid));

      const rewardAmounts: any = [];
      rewardAmounts[0] = rewardDifferenceForPlayer1.toString();

      // the player1Deposit.add(interestEarnedByPlayer1) is very slightly less than the actual value in event hence just checking for the event emitted
      await expect(result).to.emit(contracts.goodGhosting, "Withdrawal");

      const player2BalanceBeforeWithdraw = await ethers.provider.getBalance(player2.address);
      const player2RewardBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player2.address);

      result = await contracts.goodGhosting.connect(player2).withdraw(0);

      const player2RewardBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player2.address);
      const player2BalanceAfterWithdraw = await ethers.provider.getBalance(player2.address);

      const rewardDifferenceForPlayer2 = player2RewardBalanceAfterWithdraw.sub(player2RewardBalanceBeforeWithdraw);
      const differenceForPlayer2 = player2BalanceAfterWithdraw.sub(player2BalanceBeforeWithdraw);
      const interestEarnedByPlayer2 = differenceForPlayer2.sub(ethers.BigNumber.from(player2Info.amountPaid));
      assert(interestEarnedByPlayer2.gt(interestEarnedByPlayer1));
      assert(rewardDifferenceForPlayer2.gt(rewardDifferenceForPlayer1));

      const playerRewardAmounts: any = [];
      playerRewardAmounts[0] = rewardDifferenceForPlayer1.toString();

      // the player2Deposit.add(interestEarnedByPlayer1) is very slightly less than the actual value in event hence just checking for the event emitted
      await expect(result).to.emit(contracts.goodGhosting, "Withdrawal");
    });

    it("players are able to participate in a pool where reward token is same as deposit token", async () => {
      contracts = await deployPool(
        depositCount,
        segmentLength,
        segmentPayment,
        1,
        1,
        maxPlayersCount,
        true,
        false,
        true,
        true,
        false,
        true,
        0,
        strategyType,
        1000,
        false,
      );
      const accounts = await ethers.getSigners();
      const player1 = accounts[2];
      const player2 = accounts[3];
      await contracts.rewardToken.connect(player1).deposit({ value: ethers.utils.parseEther("100") });
      await contracts.rewardToken.connect(player2).deposit({ value: ethers.utils.parseEther("100") });

      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player2,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
        );
        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player1,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
        );
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      const rewardTokenPlayer1BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player1.address);

      await contracts.goodGhosting.connect(player1).withdraw(0);

      const rewardTokenAmount = await contracts.goodGhosting.rewardTokenAmounts(0);
      assert(rewardTokenAmount.eq(ethers.BigNumber.from("0")));
      const rewardTokenPlayer2BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player2.address);

      await contracts.goodGhosting.connect(player2).withdraw(0);

      const rewardTokenPlayer1BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player1.address);
      const rewardTokenPlayer2BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player2.address);
      assert(rewardTokenPlayer2BalanceAfterWithdraw.gt(rewardTokenPlayer2BalanceBeforeWithdraw));
      assert(rewardTokenPlayer1BalanceAfterWithdraw.gt(rewardTokenPlayer1BalanceBeforeWithdraw));
    });
  }

  if (strategyType === "curve" || strategyType === "mobius") {
    it("players are able to withdraw in case there is a impermanent loss", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player2,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
        );
        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player1,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
        );
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      const player1BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
      const player1Info = await contracts.goodGhosting.players(player1.address);

      const player2BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);
      const player2Info = await contracts.goodGhosting.players(player2.address);

      if (strategyType === "curve") {
        await contracts.curveGauge.connect(deployer).drain(ethers.utils.parseEther("5"));
        await contracts.curvePool.connect(deployer).drain(ethers.utils.parseEther("5"));
      } else if (strategyType === "mobius") {
        await contracts.mobiGauge.connect(deployer).drain(ethers.utils.parseEther("5"));
        await contracts.mobiPool.connect(deployer).drain(ethers.utils.parseEther("5"));
      }

      await contracts.goodGhosting.connect(player1).withdraw("9000");
      await contracts.goodGhosting.connect(player2).withdraw("9000");
      const player1AfterWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
      const player2AfterWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);

      const player1Difference = player1AfterWithdrawBalance.sub(player1BeforeWithdrawBalance);
      const player2Difference = player2AfterWithdrawBalance.sub(player2BeforeWithdrawBalance);

      assert(player1Difference.lt(player1Info.amountPaid));
      assert(player2Difference.lt(player2Info.amountPaid));
      assert(player2Difference.gt(player1Difference));
    });

    it("ghost user is able to withdraw in case there is a impermanent loss", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await joinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(
          contracts.goodGhosting,
          contracts.inboundToken,
          player1,
          segmentPayment,
          ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
        );
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      const player1BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
      const player1Info = await contracts.goodGhosting.players(player1.address);

      const player2BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);
      const player2Info = await contracts.goodGhosting.players(player2.address);

      if (strategyType === "curve") {
        await contracts.curveGauge.connect(deployer).drain(ethers.utils.parseEther("5"));
        await contracts.curvePool.connect(deployer).drain(ethers.utils.parseEther("5"));
      } else if (strategyType === "mobius") {
        await contracts.mobiGauge.connect(deployer).drain(ethers.utils.parseEther("5"));
        await contracts.mobiPool.connect(deployer).drain(ethers.utils.parseEther("5"));
      }

      await contracts.goodGhosting.connect(player1).withdraw("9000");
      await contracts.goodGhosting.connect(player2).withdraw("9000");
      const player1AfterWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
      const player2AfterWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);

      const player1Difference = player1AfterWithdrawBalance.sub(player1BeforeWithdrawBalance);
      const player2Difference = player2AfterWithdrawBalance.sub(player2BeforeWithdrawBalance);

      assert(player1Difference.lt(player1Info.amountPaid));
      assert(player2Difference.lt(player2Info.amountPaid));
      assert(player2Difference.gt(player1Difference));
    });
  }

  it("reverts if flexible deposit amounts are enabled and the player deposit different amount in different segments", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player2,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
    );
    await joinGame(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
    );

    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      if (index == 1) {
        await approveToken(contracts.inboundToken, player1, contracts.goodGhosting.address, segmentPayment);
        await expect(contracts.goodGhosting.connect(player1).makeDeposit(0, segmentPayment)).to.be.revertedWith(
          "INVALID_FLEXIBLE_AMOUNT()",
        );

        await approveToken(contracts.inboundToken, player2, contracts.goodGhosting.address, segmentPayment);
        await expect(contracts.goodGhosting.connect(player2).makeDeposit(0, segmentPayment)).to.be.revertedWith(
          "INVALID_FLEXIBLE_AMOUNT()",
        );
      }
    }
  });
};

export const shouldBehaveLikeGGPoolWithTransactionalToken = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      false,
      false,
      true,
      false,
      true,
      false,
      0,
      strategyType,
      0,
      false,
    );
  });

  it("reverts if a player tries joining a pool with insufficient amount", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await expect(
      contracts.goodGhosting
        .connect(player1)
        .joinGame(0, segmentPayment, { value: (parseInt(segmentPayment) / 2).toString() }),
    ).to.be.revertedWith("INVALID_TRANSACTIONAL_TOKEN_AMOUNT()");
  });

  it("reverts if player tries depositing with insufficient amount", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    await expect(
      contracts.goodGhosting
        .connect(player1)
        .makeDeposit(0, segmentPayment, { value: (parseInt(segmentPayment) / 2).toString() }),
    ).to.be.revertedWith("INVALID_TRANSACTIONAL_TOKEN_AMOUNT()");
  });

  it("players join the game and are able to redeem back the funds", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);
    const transactionalTokenBalanceBeforeWithdraw = await ethers.provider.getBalance(contracts.goodGhosting.address);
    const rewardTokenBalanceBeforeRedeem = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);

    const result = await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);
    const transactionalTokenBalanceAfterWithdraw = await ethers.provider.getBalance(contracts.goodGhosting.address);
    const totalPrincipal = ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from(depositCount * 2));
    const adminFeeAmount = ethers.BigNumber.from(transactionalTokenBalanceAfterWithdraw)
      .sub(totalPrincipal)
      .mul(ethers.BigNumber.from(1))
      .div(ethers.BigNumber.from(100));
    const expectedInterestValue = ethers.BigNumber.from(transactionalTokenBalanceAfterWithdraw)
      .sub(totalPrincipal)
      .sub(adminFeeAmount);
    const rewardTokenBalanceAfterRedeem = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);
    const adminRewardTokenFee = ethers.BigNumber.from(rewardTokenBalanceAfterRedeem)
      .mul(ethers.BigNumber.from(1))
      .div(ethers.BigNumber.from(100));
    assert(transactionalTokenBalanceAfterWithdraw.gt(transactionalTokenBalanceBeforeWithdraw));
    assert(rewardTokenBalanceAfterRedeem.gt(rewardTokenBalanceBeforeRedeem));

    const rewardAmounts: any = [];
    rewardAmounts[0] = ethers.BigNumber.from(rewardTokenBalanceAfterRedeem)
      .sub(ethers.BigNumber.from(adminRewardTokenFee))
      .toString();
    if (strategyType !== "aave" && strategyType !== "aaveV3" && strategyType !== "no_strategy") {
      rewardAmounts[1] = ethers.BigNumber.from("0").toString();
    }

    expect(result)
      .to.emit(contracts.goodGhosting, "FundsRedeemedFromExternalPool")
      .withArgs(
        ethers.BigNumber.from(transactionalTokenBalanceAfterWithdraw),
        totalPrincipal,
        expectedInterestValue,
        ethers.BigNumber.from(0),
        rewardAmounts,
      );
  });

  it("players join the game and are able to withdraw their principal and rewards", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);

    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);
    const transactionalTokenBalanceBeforeWithdraw = await ethers.provider.getBalance(player1.address);
    const rewardTokenBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player1.address);
    const transactionalTokenPlayer2BalanceBeforeWithdraw = await ethers.provider.getBalance(player2.address);
    const rewardTokenPlayer2BalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player2.address);
    await contracts.goodGhosting.connect(player1).withdraw(0);
    await contracts.goodGhosting.connect(player2).withdraw(0);
    const transactionalTokenPlayer2BalanceAfterWithdraw = await ethers.provider.getBalance(player2.address);
    const rewardTokenPlayer2BalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player2.address);
    const rewardTokenBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player1.address);
    const transactionalTokenBalanceAfterWithdraw = await ethers.provider.getBalance(player1.address);
    assert(transactionalTokenBalanceAfterWithdraw.gt(transactionalTokenBalanceBeforeWithdraw));
    assert(rewardTokenBalanceAfterWithdraw.gt(rewardTokenBalanceBeforeWithdraw));
    assert(transactionalTokenPlayer2BalanceAfterWithdraw.gt(transactionalTokenPlayer2BalanceBeforeWithdraw));
    assert(rewardTokenPlayer2BalanceAfterWithdraw.gt(rewardTokenPlayer2BalanceBeforeWithdraw));
  });

  it("player joins the game and is able to early withdraw", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    const result = await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
    const feeAmount = ethers.BigNumber.from(segmentPayment)
      .mul(ethers.BigNumber.from(1))
      .div(ethers.BigNumber.from(100)); // fee is set as an integer, so needs to be converted to a percentage
    const playerInfo = await contracts.goodGhosting.players(player1.address);
    await expect(result)
      .to.emit(contracts.goodGhosting, "EarlyWithdrawal")
      .withArgs(
        player1.address,
        playerInfo.amountPaid.sub(feeAmount),
        ethers.BigNumber.from(0),
        ethers.BigNumber.from(0),
      );
  });

  it("admin is able to withdraw rewards, when there are no winners in the pool", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];
    const player2 = accounts[3];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    for (let index = 1; index < depositCount - 1; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength * 2]);
    await ethers.provider.send("evm_mine", []);
    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);
    // generating mock interest
    await deployer.sendTransaction({
      from: deployer.address,
      to: contracts.goodGhosting.address,
      value: ethers.utils.parseEther("25"),
    });
    await contracts.goodGhosting.connect(player1).redeemFromExternalPoolForFixedDepositPool(0);
    const rewardTokenBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
    const transactionalTokenBalanceBeforeWithdraw = await ethers.provider.getBalance(deployer.address);
    await contracts.goodGhosting.adminFeeWithdraw(0);

    const transactionalTokenBalanceAfterWithdraw = await ethers.provider.getBalance(deployer.address);
    const rewardTokenBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(deployer.address);

    assert(rewardTokenBalanceAfterWithdraw.gt(rewardTokenBalanceBeforeWithdraw));
    assert(transactionalTokenBalanceAfterWithdraw.gt(transactionalTokenBalanceBeforeWithdraw));
  });
};

export const shouldBehaveLikeGGPoolWithSameTokenAddresses = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      false,
      true,
      0,
      strategyType,
      0,
      false,
    );
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];
    await contracts.rewardToken.connect(player1).deposit({ value: ethers.utils.parseEther("100") });
    await contracts.rewardToken.connect(player2).deposit({ value: ethers.utils.parseEther("100") });
  });

  it("players join a pool and are able to redeem and withdraw when the deposit token and reward token are same", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);

    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);
    const rewardTokenAmount = await contracts.goodGhosting.rewardTokenAmounts(0);
    assert(rewardTokenAmount.eq(ethers.BigNumber.from("0")));
    const rewardTokenPlayer1BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player1.address);
    const rewardTokenPlayer2BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player2.address);
    await contracts.goodGhosting.connect(player1).withdraw(0);
    await contracts.goodGhosting.connect(player2).withdraw(0);
    const rewardTokenPlayer1BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player1.address);
    const rewardTokenPlayer2BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player2.address);
    assert(rewardTokenPlayer2BalanceAfterWithdraw.gt(rewardTokenPlayer2BalanceBeforeWithdraw));
    assert(rewardTokenPlayer1BalanceAfterWithdraw.gt(rewardTokenPlayer1BalanceBeforeWithdraw));
  });

  it("player is able to do an Early Withdraw", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    const result = await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
    const feeAmount = ethers.BigNumber.from(segmentPayment)
      .mul(ethers.BigNumber.from(1))
      .div(ethers.BigNumber.from(100)); // fee is set as an integer, so needs to be converted to a percentage
    const playerInfo = await contracts.goodGhosting.players(player1.address);
    await expect(result)
      .to.emit(contracts.goodGhosting, "EarlyWithdrawal")
      .withArgs(
        player1.address,
        playerInfo.amountPaid.sub(feeAmount),
        ethers.BigNumber.from(0),
        ethers.BigNumber.from(0),
      );
  });

  it("admin is able to withdraw rewards, when there are no winners in the pool", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];
    const player2 = accounts[3];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    for (let index = 1; index < depositCount - 1; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength * 2]);
    await ethers.provider.send("evm_mine", []);
    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);

    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);
    const rewardTokenBalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(deployer.address);
    await contracts.goodGhosting.adminFeeWithdraw(0);
    const rewardTokenBalanceAfterWithdraw = await contracts.inboundToken.balanceOf(deployer.address);
    assert(rewardTokenBalanceAfterWithdraw.gt(rewardTokenBalanceBeforeWithdraw));
  });
};

export const shouldBehaveLikeGGPoolGeneratingYieldFromAtricryptoPool = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      depositCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      false,
      false,
      1,
      strategyType,
      0,
      false,
    );
  });
  it("players are able to join, redeem and withdraw funds", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    for (let index = 1; index < depositCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength * 2]);
    await ethers.provider.send("evm_mine", []);
    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);

    await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);
  });

  it("player is able to early withdraw", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
  });
};
