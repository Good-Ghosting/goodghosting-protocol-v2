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
} from "./pool.utils";

chai.use(solidity);

const { expect } = chai;
const segmentCount = 3;
const segmentLength = 600;
const segmentPayment = "10000000000000000000";
const maxPlayersCount = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
let contracts: any;

export const shouldBehaveLikeGGPool = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      strategyType,
    );
  });

  it("check if inbound and interest token have distinct addresses", async () => {
    const inBoundTokenAddress = contracts.inboundToken.address;
    let interestTokenAddress;
    if (strategyType === "aave") {
      interestTokenAddress = contracts.lendingPool.address;
    } else if (strategyType === "curve") {
      interestTokenAddress = contracts.curvePool.address;
    } else if (strategyType === "mobius") {
      interestTokenAddress = contracts.mobiPool.address;
    }
    assert(
      inBoundTokenAddress !== interestTokenAddress,
      `Inbound Token ${inBoundTokenAddress} and Interest Token ${interestTokenAddress} shouldn't be the same address`,
    );
  });

  it("checks that the strategy contract has no token balance before the pool is deployed", async () => {
    const inBoundBalance = await contracts.inboundToken.balanceOf(contracts.strategy.address);
    let interestBalance;
    if (strategyType === "aave") {
      interestBalance = await contracts.lendingPool.balanceOf(contracts.strategy.address);
    } else if (strategyType === "curve") {
      interestBalance = await contracts.curvePool.balanceOf(contracts.strategy.address);
    } else if (strategyType === "mobius") {
      interestBalance = await contracts.mobiPool.balanceOf(contracts.strategy.address);
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

  it("reverts if the contract is deployed with 0% early withdraw fee", async () => {
    await expect(
      deployPool(
        segmentCount,
        segmentLength,
        segmentPayment,
        0,
        0,
        maxPlayersCount,
        true,
        false,
        true,
        false,
        strategyType,
      ),
    ).to.be.revertedWith("_earlyWithdrawalFee must be greater than zero");
  });

  it("reverts if the contract is deployed with invalid inbound token address", async () => {
    await expect(
      deployPool(
        segmentCount,
        segmentLength,
        segmentPayment,
        1,
        0,
        maxPlayersCount,
        false,
        false,
        true,
        false,
        strategyType,
      ),
    ).to.be.revertedWith("invalid _inboundCurrency address");
  });

  it("reverts if the contract is deployed with invalid strategy address", async () => {
    await expect(
      deployPool(
        segmentCount,
        segmentLength,
        segmentPayment,
        1,
        0,
        maxPlayersCount,
        true,
        false,
        false,
        false,
        strategyType,
      ),
    ).to.be.revertedWith("invalid _strategy address");
  });

  it("reverts if the contract is deployed with segment count as 0", async () => {
    await expect(
      deployPool(0, segmentLength, segmentPayment, 1, 0, maxPlayersCount, true, false, true, false, strategyType),
    ).to.be.revertedWith("segmentCount must be greater than zero");
  });

  it("reverts if the contract is deployed with segment length as 0", async () => {
    await expect(
      deployPool(segmentCount, 0, segmentPayment, 1, 0, maxPlayersCount, true, false, true, false, strategyType),
    ).to.be.revertedWith("_segmentLength must be greater than zero");
  });

  it("reverts if the contract is deployed with segment payment as 0", async () => {
    await expect(
      deployPool(segmentCount, segmentLength, 0, 1, 0, maxPlayersCount, true, false, true, false, strategyType),
    ).to.be.revertedWith("_segmentPayment must be greater than zero");
  });

  it("reverts if the contract is deployed with early withdraw fee more than 10%", async () => {
    await expect(
      deployPool(
        segmentCount,
        segmentLength,
        segmentPayment,
        20,
        0,
        maxPlayersCount,
        true,
        false,
        true,
        false,
        strategyType,
      ),
    ).to.be.revertedWith("_earlyWithdrawalFee must be less than or equal to 10%");
  });

  it("reverts if the contract is deployed with admin fee more than 20%", async () => {
    await expect(
      deployPool(
        segmentCount,
        segmentLength,
        segmentPayment,
        1,
        25,
        maxPlayersCount,
        true,
        false,
        true,
        false,
        strategyType,
      ),
    ).to.be.revertedWith("_customFee must be less than or equal to 20%");
  });

  it("reverts if the contract is deployed with max player count equal to zero", async () => {
    await expect(
      deployPool(segmentCount, segmentLength, segmentPayment, 1, 0, "0", true, false, true, false, strategyType),
    ).to.be.revertedWith("_maxPlayersCount must be greater than zero");
  });

  it("accepts setting type(uint256).max as the max number of players", async () => {
    const contracts = await deployPool(
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      strategyType,
    );
    const expectedValue = ethers.BigNumber.from(2).pow(ethers.BigNumber.from(256)).sub(ethers.BigNumber.from(1));

    const result = ethers.BigNumber.from(await contracts.goodGhosting.maxPlayersCount());
    assert(expectedValue.eq(result), "expected max number of players to equal type(uint256).max");
  });

  it("checks if the contract's variables were properly initialized", async () => {
    const inboundCurrencyResult = await contracts.goodGhosting.inboundToken();
    const lastSegmentResult = await contracts.goodGhosting.lastSegment();
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
      ethers.BigNumber.from(lastSegmentResult).eq(ethers.BigNumber.from(segmentCount)),
      `LastSegment info doesn't match. expected ${segmentCount}; got ${lastSegmentResult}`,
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
    for (let expectedSegment = 0; expectedSegment <= segmentCount; expectedSegment++) {
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

    for (let i = 0; i <= segmentCount; i++) {
      await checksCompletion(false, `game completed prior than expected; current segment: ${currentSegment}`);
      if (i == segmentCount) {
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
    await expect(contracts.goodGhosting.renounceOwnership()).to.be.revertedWith("Not allowed");
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
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      strategyType,
    );
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
    await expect(contracts.goodGhosting.connect(player1).joinGame(0, segmentPayment)).to.be.revertedWith(
      "You need to have allowance to do transfer Inbound Token on the smart contract",
    );
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
      "Cannot join the game more than once",
    );
  });

  it("reverts if more players than maxPlayersCount try to join", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];
    const player2 = accounts[3];

    const contracts = await deployPool(
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      2,
      true,
      false,
      true,
      false,
      strategyType,
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
      "Reached max quantity of players allowed",
    );
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
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      2,
      true,
      false,
      true,
      false,
      strategyType,
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
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      2,
      true,
      false,
      true,
      false,
      strategyType,
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
      "Reached max quantity of players allowed",
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
    if (strategyType === "aave") {
      contractsDaiBalance = await contracts.lendingPool.balanceOf(contracts.strategy.address);
    } else if (strategyType === "curve") {
      contractsDaiBalance = await contracts.curveGauge.balanceOf(contracts.strategy.address);
    } else if (strategyType === "mobius") {
      contractsDaiBalance = await contracts.mobiGauge.balanceOf(contracts.strategy.address);
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
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      strategyType,
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
      "Cannot join the game more than once",
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
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      strategyType,
    );
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
      "Sender is not a player",
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
      "Deposit available only between segment 1 and segment n-1 (penultimate)",
    );
  });

  it("reverts if user is making a deposit during segment n (last segment)", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    // Advances to last segment
    await ethers.provider.send("evm_increaseTime", [segmentLength * segmentCount]);
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
      "Deposit available only between segment 1 and segment n-1 (penultimate)",
    );
  });

  it("reverts if user tries to deposit after the game ends", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentCount,
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
      "Deposit available only between segment 1 and segment n-1 (penultimate)",
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
      "Player already paid current segment",
    );
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
      .withArgs(player1.address, currentSegment, ethers.BigNumber.from(segmentPayment));
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
    if (strategyType === "aave") {
      contractsDaiBalance = await contracts.lendingPool.balanceOf(contracts.strategy.address);
    } else if (strategyType === "curve") {
      contractsDaiBalance = await contracts.curveGauge.balanceOf(contracts.strategy.address);
    } else if (strategyType === "mobius") {
      contractsDaiBalance = await contracts.mobiGauge.balanceOf(contracts.strategy.address);
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
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      strategyType,
    );
  });
  it("reverts if the contract is paused", async () => {
    await contracts.goodGhosting.pause();
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await expect(contracts.goodGhosting.connect(player1).earlyWithdraw(0)).to.be.revertedWith("Pausable: paused");
  });

  it("reverts if the game is completed", async () => {
    await advanceToEndOfGame(contracts.goodGhosting, segmentLength, segmentCount);
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await expect(contracts.goodGhosting.connect(player1).earlyWithdraw(0)).to.be.revertedWith(
      "Game is already completed",
    );
  });

  it("reverts if a non-player tries to withdraw", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await expect(contracts.goodGhosting.connect(player2).earlyWithdraw(0)).to.be.revertedWith("Player does not exist");
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
      "Player has already withdrawn",
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
    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
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
    await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
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
      .withArgs(player1.address, playerInfo.amountPaid.sub(feeAmount), ethers.BigNumber.from(0));
  });

  it("user is able to withdraw in the last segment", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    // fee is set as an integer, so needs to be converted to a percentage

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

    // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
    for (let index = 1; index < segmentCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      if (index === segmentCount - 1) {
        const playerInfo = await contracts.goodGhosting.players(player1.address);

        const feeAmount = ethers.BigNumber.from(playerInfo.amountPaid)
          .mul(ethers.BigNumber.from(1))
          .div(ethers.BigNumber.from(100));
        await expect(contracts.goodGhosting.connect(player1).earlyWithdraw(0))
          .to.emit(contracts.goodGhosting, "EarlyWithdrawal")
          .withArgs(player1.address, playerInfo.amountPaid.sub(feeAmount), ethers.BigNumber.from(0));
      } else {
        // protocol deposit of the prev. deposit
        await approveToken(contracts.inboundToken, player1, contracts.goodGhosting.address, segmentPayment);
        await contracts.goodGhosting.connect(player1).makeDeposit(0, segmentPayment);
      }
    }
  });

  it("user is able to withdraw in the last segment when 2 players join the game and one of them early withdraws when the segment amount is less than withdraw amount", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);

    // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
    for (let index = 1; index < segmentCount; index++) {
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
      .withArgs(player1.address, player1Info.amountPaid.sub(feeAmount), player2Info.amountPaid);
  });

  it("reduces winner count when there are 2 player in the pool and one of them withdrew early in the last segment", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const player2 = accounts[3];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);

    // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
    for (let index = 1; index < segmentCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
    // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
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
    for (let index = 1; index < segmentCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
    // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    const cumalativePlayerIndexBeforeWithdraw = await contracts.goodGhosting.sum();
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
    const cumalativePlayerIndexAfterWithdraw = await contracts.goodGhosting.sum();
    assert(cumalativePlayerIndexAfterWithdraw.eq(cummalativePlayer2IndexBeforeWithdraw));
  });
};

export const shouldBehaveLikeRedeemingFromGGPool = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      strategyType,
    );
  });
  it("reverts if game is not completed", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await expect(contracts.goodGhosting.connect(player1).redeemFromExternalPool(0)).to.be.revertedWith(
      "Game is not completed",
    );
  });

  it("reverts if funds were already redeemed", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await redeem(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentCount,
      segmentLength,
      segmentPayment,
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
      segmentCount,
      segmentLength,
      segmentPayment,
    );
  });

  it("transfer funds to contract then redeems from external pool", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    const expectedBalance = ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from(segmentCount));
    await redeem(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentCount,
      segmentLength,
      segmentPayment,
    );
    const contractsDaiBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
    // No interest is generated during tests so far, so contract balance must equals the amount deposited.
    assert(expectedBalance.eq(contractsDaiBalance));
  });

  it("emits event FundsRedeemedFromExternalPool when redeem is successful", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    let governanceTokenRewards = 0;
    const player1 = accounts[2];
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await mintTokens(contracts.inboundToken, deployer.address);

    if (strategyType === "aave") {
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
      await contracts.curvePool.connect(deployer).add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true);

      await contracts.curvePool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }

    const result = await contracts.goodGhosting.redeemFromExternalPool(0);
    if (strategyType === "curve") {
      governanceTokenRewards = await contracts.curve.balanceOf(contracts.goodGhosting.address);
    } else if (strategyType === "mobius") {
      governanceTokenRewards = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
    }
    const totalPrincipal = ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from(segmentCount));
    const contractsDaiBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
    const adminFeeAmount = ethers.BigNumber.from(contractsDaiBalance)
      .sub(totalPrincipal)
      .mul(ethers.BigNumber.from(1))
      .div(ethers.BigNumber.from(100));
    const expectedInterestValue = ethers.BigNumber.from(contractsDaiBalance).sub(totalPrincipal).sub(adminFeeAmount);

    const rewardTokenBalance = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);
    await expect(result)
      .to.emit(contracts.goodGhosting, "FundsRedeemedFromExternalPool")
      .withArgs(
        ethers.BigNumber.from(contractsDaiBalance),
        totalPrincipal,
        expectedInterestValue,
        ethers.BigNumber.from(0),
        ethers.BigNumber.from(rewardTokenBalance.toString()),
        ethers.BigNumber.from(governanceTokenRewards.toString()),
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
      segmentCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await mintTokens(contracts.inboundToken, deployer.address);

    if (strategyType === "aave") {
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
      await contracts.curvePool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true);
      await contracts.curvePool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    await contracts.goodGhosting.redeemFromExternalPool(0);
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
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      strategyType,
    );
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await mintTokens(contracts.inboundToken, deployer.address);
    if (strategyType === "aave") {
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
      await contracts.curvePool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true);
      await contracts.curvePool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    await contracts.goodGhosting.redeemFromExternalPool(0);
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
      segmentCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await mintTokens(contracts.inboundToken, deployer.address);
    if (strategyType === "aave") {
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
      await contracts.curvePool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true);
      await contracts.curvePool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    await contracts.goodGhosting.redeemFromExternalPool(0);
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
      segmentCount,
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
    const sum = await contracts.goodGhosting.sum();
    assert(sum.eq(cummalativePlayer1IndexBeforeWithdraw));
  });

  context("when incentive token is defined", async () => {
    const incentiveAmount = ethers.BigNumber.from(ethers.utils.parseEther("100000"));

    beforeEach(async () => {
      contracts = await deployPool(
        segmentCount,
        segmentLength,
        segmentPayment,
        1,
        0,
        maxPlayersCount,
        true,
        true,
        true,
        false,
        strategyType,
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
        segmentCount,
        segmentLength,
        segmentPayment,
      );
      const result = ethers.BigNumber.from(await contracts.goodGhosting.totalIncentiveAmount());
      assert(
        result.eq(incentiveAmount),
        `totalIncentiveAmount should be ${incentiveAmount.toString()}; received ${result.toString()}`,
      );
    });

    it("we are able to redeem if there is impermanent loss", async () => {
      const accounts = await ethers.getSigners();
      const player1 = accounts[2];
      await joinGamePaySegmentsAndComplete(
        contracts.inboundToken,
        player1,
        segmentPayment,
        segmentCount,
        segmentLength,
        contracts.goodGhosting,
        segmentPayment,
      );
      // to trigger impermanent loss
      const principalAmount = await contracts.goodGhosting.totalGamePrincipal();
      await contracts.goodGhosting.redeemFromExternalPool("900000000000000000");
      const contractDaiBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);

      const calculatedImpermanentLossShare = ethers.BigNumber.from(contractDaiBalance)
        .mul(ethers.BigNumber.from(100))
        .div(ethers.BigNumber.from(principalAmount));
      const impermanentLossShareFromContract = await contracts.goodGhosting.impermanentLossShare();

      assert(impermanentLossShareFromContract.eq(calculatedImpermanentLossShare));
    });
  });
};

export const shouldBehaveLikeGGPoolWithNoWinners = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      strategyType,
    );
  });
  it("assign the complete interest to admin", async () => {
    let governanceTokenRewards = 0;
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGamePaySegmentsAndNotComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    const result = await contracts.goodGhosting.redeemFromExternalPool(0);
    if (strategyType === "curve") {
      governanceTokenRewards = await contracts.curve.balanceOf(contracts.goodGhosting.address);
    } else if (strategyType === "mobius") {
      governanceTokenRewards = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
    }
    const adminBalance = await contracts.goodGhosting.adminFeeAmount();
    const totalBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
    const principalAmount = await contracts.goodGhosting.totalGamePrincipal();
    const rewardTokenBalance = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);

    await expect(result)
      .to.emit(contracts.goodGhosting, "FundsRedeemedFromExternalPool")
      .withArgs(
        totalBalance,
        principalAmount,
        adminBalance,
        ethers.BigNumber.from(0),
        ethers.BigNumber.from(rewardTokenBalance.toString()),
        ethers.BigNumber.from(governanceTokenRewards.toString()),
      );
  });

  it("user is able to withdraw in case no one wins", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await joinGamePaySegmentsAndNotComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await contracts.goodGhosting.redeemFromExternalPool(0);
    await contracts.goodGhosting.connect(player1).withdraw(0);
  });
};

export const shouldBehaveLikePlayersWithdrawingFromGGPool = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      strategyType,
    );
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
      segmentCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );

    // Simulate some interest by giving the contract more aDAI
    await mintTokens(contracts.inboundToken, deployer.address);

    if (strategyType === "aave") {
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
      await contracts.curvePool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true);
      await contracts.curvePool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    // Expect Player1 to get back the deposited amount
    const player1PreWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
    let playerMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player1.address);

    await contracts.goodGhosting.connect(player1).withdraw(0);
    let playerMaticBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player1.address);
    assert(playerMaticBalanceAfterWithdraw.eq(playerMaticBalanceBeforeWithdraw));
    const player1PostWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
    assert(player1PostWithdrawBalance.sub(player1PreWithdrawBalance).eq(segmentPayment));

    // Expect Player2 to get an amount greater than the sum of all the deposits
    const player2PreWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);
    playerMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player2.address);

    await contracts.goodGhosting.connect(player2).withdraw(0);
    playerMaticBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(player2.address);
    assert(playerMaticBalanceAfterWithdraw.gt(playerMaticBalanceBeforeWithdraw));

    const player2PostWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);
    const totalGameInterest = await contracts.goodGhosting.totalGameInterest.call();
    const adminFeeAmount = ethers.BigNumber.from(1).mul(totalGameInterest).div(ethers.BigNumber.from("100"));
    const withdrawalValue = player2PostWithdrawBalance.sub(player2PreWithdrawBalance);

    const userDeposit = ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from(segmentCount));
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
      segmentCount,
      segmentLength,
      segmentPayment,
    );
    await contracts.goodGhosting.connect(player1).withdraw(0);
    await expect(contracts.goodGhosting.connect(player1).withdraw(0)).to.be.revertedWith(
      "Player has already withdrawn",
    );
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
      segmentCount,
      segmentLength,
      segmentPayment,
    );
    await expect(contracts.goodGhosting.connect(deployer).withdraw(0)).to.be.revertedWith("Player does not exist");
  });

  it("sets withdrawn flag to true after user withdraws", async () => {
    const accounts = await ethers.getSigners();
    const player1 = accounts[2];
    await redeem(
      contracts.goodGhosting,
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentCount,
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
      segmentCount,
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

    for (let index = 1; index < segmentCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
    // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);

    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);

    await mintTokens(contracts.inboundToken, deployer.address);
    if (strategyType === "aave") {
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
      await contracts.curvePool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true);
      await contracts.curvePool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }

    const player1BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
    await contracts.goodGhosting.connect(player1).withdraw(0);
    const player1PostWithdrawBalance = await contracts.inboundToken.balanceOf(player1.address);
    const player1WithdrawAmount = player1PostWithdrawBalance.sub(player1BeforeWithdrawBalance);

    const player2BeforeWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);
    await contracts.goodGhosting.connect(player2).withdraw(0);
    const player2PostWithdrawBalance = await contracts.inboundToken.balanceOf(player2.address);
    const player2WithdrawAmount = player2PostWithdrawBalance.sub(player2BeforeWithdrawBalance);

    // both players are winners, but player 2 made deposits before player 1 so it gets slightly higher interest.
    assert(player2WithdrawAmount.gt(player1WithdrawAmount));
  });

  it("emits Withdrawal event when user withdraws", async () => {
    // having test with only 1 player for now
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    let governanceTokenBalance = 0;
    const player1 = accounts[2];
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    await mintTokens(contracts.inboundToken, deployer.address);
    if (strategyType === "aave") {
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
      await contracts.curvePool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true);
      await contracts.curvePool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    await contracts.goodGhosting.redeemFromExternalPool(0);
    const gameInterest = await contracts.goodGhosting.totalGameInterest();
    const playerInfo = await contracts.goodGhosting.players(player1.address);
    const sum = await contracts.goodGhosting.sum();

    let cummalativePlayer1IndexBeforeWithdraw = ethers.BigNumber.from(0);

    for (let i = 0; i <= playerInfo.mostRecentSegmentPaid; i++) {
      let index1 = await contracts.goodGhosting.playerIndex(player1.address, i);
      cummalativePlayer1IndexBeforeWithdraw = cummalativePlayer1IndexBeforeWithdraw.add(
        ethers.BigNumber.from(index1.toString()),
      );
    }
    let playerShare = ethers.BigNumber.from(cummalativePlayer1IndexBeforeWithdraw)
      .mul(ethers.BigNumber.from(100))
      .div(ethers.BigNumber.from(sum));
    playerShare = ethers.BigNumber.from(gameInterest).mul(playerShare).div(ethers.BigNumber.from(100));
    const userDeposit = ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from(segmentCount));
    const rewardTokenBalance = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);
    if (strategyType === "curve") {
      governanceTokenBalance = await contracts.curve.balanceOf(contracts.goodGhosting.address);
    } else if (strategyType === "mobius") {
      governanceTokenBalance = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
    }
    await expect(contracts.goodGhosting.connect(player1).withdraw(0))
      .to.emit(contracts.goodGhosting, "Withdrawal")
      .withArgs(
        player1.address,
        userDeposit.add(playerShare),
        ethers.BigNumber.from(0),
        rewardTokenBalance,
        governanceTokenBalance,
      );
  });
  if (strategyType === "curve" || strategyType === "mobius") {
    it("player is able to withdraw if there is impermanent loss", async () => {
      // having test with only 1 player for now
      const accounts = await ethers.getSigners();
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

      for (let index = 1; index < segmentCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      }
      // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
      // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);
      await contracts.goodGhosting.redeemFromExternalPool("900000000000000000");
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
  }

  context("when incentive token is defined", async () => {
    beforeEach(async () => {
      contracts = await deployPool(
        segmentCount,
        segmentLength,
        segmentPayment,
        1,
        1,
        maxPlayersCount,
        true,
        true,
        true,
        false,
        strategyType,
      );
    });

    it("pays additional incentive to winners when incentive is sent to contract", async () => {
      const accounts = await ethers.getSigners();
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

      for (let index = 1; index < segmentCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      }
      // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
      // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      const user1IncentiveTokenBalanceBeforeWithdraw = await contracts.incentiveToken.balanceOf(player1.address);
      const user2IncentiveTokenBalanceBeforeWithdraw = await contracts.incentiveToken.balanceOf(player2.address);
      await contracts.goodGhosting.redeemFromExternalPool(0);
      await contracts.goodGhosting.connect(player1).withdraw(0);
      await contracts.goodGhosting.connect(player2).withdraw(0);
      const user1IncentiveTokenBalanceAfterWithdraw = await contracts.incentiveToken.balanceOf(player1.address);
      const user2IncentiveTokenBalanceAfterWithdraw = await contracts.incentiveToken.balanceOf(player2.address);
      assert(user2IncentiveTokenBalanceAfterWithdraw.eq(user1IncentiveTokenBalanceAfterWithdraw));

      assert(user2IncentiveTokenBalanceAfterWithdraw.gt(user2IncentiveTokenBalanceBeforeWithdraw));
      assert(user1IncentiveTokenBalanceAfterWithdraw.gt(user1IncentiveTokenBalanceBeforeWithdraw));
    });
  });
};

export const shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentMoreThan0 = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      1,
      maxPlayersCount,
      true,
      false,
      true,
      false,
      strategyType,
    );
  });

  it("when funds were not redeemed from external pool", async () => {
    const accounts = await ethers.getSigners();

    const player1 = accounts[2];
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );

    await expect(contracts.goodGhosting.adminFeeWithdraw()).to.be.revertedWith("Funds not redeemed from external pool");
  });

  it("when admin tries to withdraw fees again", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];
    await joinGamePaySegmentsAndComplete(
      contracts.inboundToken,
      player1,
      segmentPayment,
      segmentCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );
    //generating mock interest
    await mintTokens(contracts.inboundToken, deployer.address);
    if (strategyType === "aave") {
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
      await contracts.curvePool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true);
      await contracts.curvePool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    await contracts.goodGhosting.redeemFromExternalPool(0);
    await contracts.goodGhosting.adminFeeWithdraw();
    await expect(contracts.goodGhosting.adminFeeWithdraw()).to.be.revertedWith("Admin has already withdrawn");
  });

  context("with no winners in the game", async () => {
    it("does not revert when there is no interest generated (neither external interest nor early withdrawal fees)", async () => {
      let governanceTokenBalance = 0;
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player2 = accounts[3];
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await advanceToEndOfGame(contracts.goodGhosting, segmentLength, segmentCount);

      await contracts.goodGhosting.redeemFromExternalPool(0);
      const rewardTokenBalance = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);
      if (strategyType === "curve") {
        governanceTokenBalance = await contracts.curve.balanceOf(contracts.goodGhosting.address);
      } else if (strategyType === "mobius") {
        governanceTokenBalance = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
      }
      await expect(contracts.goodGhosting.adminFeeWithdraw())
        .to.emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(
          deployer.address,
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(rewardTokenBalance),
          ethers.BigNumber.from(governanceTokenBalance),
        );
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
      await advanceToEndOfGame(contracts.goodGhosting, segmentLength, segmentCount);

      await contracts.goodGhosting.redeemFromExternalPool(0);
      const rewardTokenBalance = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);
      if (strategyType === "curve") {
        governanceTokenBalance = await contracts.curve.balanceOf(contracts.goodGhosting.address);
      } else if (strategyType === "mobius") {
        governanceTokenBalance = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
      }
      const contractBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
      const totalGamePrincipal = await contracts.goodGhosting.totalGamePrincipal();
      const grossInterest = contractBalance.sub(totalGamePrincipal);
      const regularAdminFee = grossInterest.mul(ethers.BigNumber.from(1)).div(ethers.BigNumber.from(100));
      const gameInterest = await contracts.goodGhosting.totalGameInterest();
      // There's no winner, so admin takes it all
      const expectedAdminFee = regularAdminFee.add(gameInterest);
      let adminMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);

      let adminMaticBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
      // no external deposits
      assert(adminMaticBalanceAfterWithdraw.eq(adminMaticBalanceBeforeWithdraw));
      await expect(contracts.goodGhosting.adminFeeWithdraw())
        .emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(
          deployer.address,
          grossInterest.sub(regularAdminFee),
          expectedAdminFee,
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(rewardTokenBalance),
          ethers.BigNumber.from(governanceTokenBalance),
        );
    });

    it("withdraw fees when there's only interest generated by external pool", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];
      let governanceTokenBalance = 0;

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await advanceToEndOfGame(contracts.goodGhosting, segmentLength, segmentCount);
      // mocks interest generation
      await mintTokens(contracts.inboundToken, deployer.address);

      if (strategyType === "aave") {
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
        await contracts.curvePool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true);
        await contracts.curvePool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
      } else if (strategyType === "mobius") {
        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
        await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

        await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
      }
      await contracts.goodGhosting.redeemFromExternalPool(0);
      const rewardTokenBalance = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);
      if (strategyType === "curve") {
        governanceTokenBalance = await contracts.curve.balanceOf(contracts.goodGhosting.address);
      } else if (strategyType === "mobius") {
        governanceTokenBalance = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
      }
      const contractBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
      const totalGamePrincipal = await contracts.goodGhosting.totalGamePrincipal();
      const grossInterest = contractBalance.sub(totalGamePrincipal);
      const regularAdminFee = grossInterest.mul(ethers.BigNumber.from(1)).div(ethers.BigNumber.from(100));
      const gameInterest = await contracts.goodGhosting.totalGameInterest.call();
      // There's no winner, so admin takes it all
      const expectedAdminFee = regularAdminFee.add(gameInterest);
      let adminMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);

      await expect(contracts.goodGhosting.adminFeeWithdraw())
        .emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(
          deployer.address,
          grossInterest.sub(regularAdminFee),
          expectedAdminFee,
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(rewardTokenBalance),
          ethers.BigNumber.from(governanceTokenBalance),
        );
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
      await advanceToEndOfGame(contracts.goodGhosting, segmentLength, segmentCount);
      // mocks interest generation
      await mintTokens(contracts.inboundToken, deployer.address);

      if (strategyType === "aave") {
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
        await contracts.curvePool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true);
        await contracts.curvePool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
      } else if (strategyType === "mobius") {
        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
        await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

        await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
      }
      await contracts.goodGhosting.redeemFromExternalPool(0);
      const rewardTokenBalance = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);
      if (strategyType === "curve") {
        governanceTokenBalance = await contracts.curve.balanceOf(contracts.goodGhosting.address);
      } else if (strategyType === "mobius") {
        governanceTokenBalance = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
      }
      const contractBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
      const totalGamePrincipal = await contracts.goodGhosting.totalGamePrincipal();
      const grossInterest = contractBalance.sub(totalGamePrincipal);
      const regularAdminFee = grossInterest.mul(ethers.BigNumber.from(1)).div(ethers.BigNumber.from(100));
      const gameInterest = await contracts.goodGhosting.totalGameInterest.call();
      // There's no winner, so admin takes it all
      const expectedAdminFee = regularAdminFee.add(gameInterest);
      let adminMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);

      await expect(contracts.goodGhosting.adminFeeWithdraw())
        .emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(
          deployer.address,
          grossInterest.sub(regularAdminFee),
          expectedAdminFee,
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(rewardTokenBalance),
          ethers.BigNumber.from(governanceTokenBalance),
        );
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
        segmentCount,
        segmentLength,
        contracts.goodGhosting,
        segmentPayment,
      );

      await contracts.goodGhosting.redeemFromExternalPool(0);
      // reward token balance
      await expect(contracts.goodGhosting.adminFeeWithdraw())
        .to.emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(
          deployer.address,
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(0),
        );
    });

    it("withdraw fees when there's only early withdrawal fees", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      await contracts.goodGhosting.connect(player1).earlyWithdraw(0);

      for (let index = 1; index < segmentCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      }
      // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
      // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      await contracts.goodGhosting.redeemFromExternalPool(0);
      const contractBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
      const totalGamePrincipal = await contracts.goodGhosting.totalGamePrincipal();
      const grossInterest = contractBalance.sub(totalGamePrincipal);
      const regularAdminFee = grossInterest.mul(ethers.BigNumber.from(1)).div(ethers.BigNumber.from(100));
      // There's no winner, so admin takes it all
      let adminMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);

      let adminMaticBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
      // no external deposits
      assert(adminMaticBalanceAfterWithdraw.eq(adminMaticBalanceBeforeWithdraw));
      await expect(contracts.goodGhosting.adminFeeWithdraw())
        .emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(
          deployer.address,
          grossInterest.sub(regularAdminFee),
          regularAdminFee,
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(0),
        );
    });

    it("withdraw fees when there's only interest generated by external pool", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

      for (let index = 1; index < segmentCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      }
      // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
      // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);
      // mocks interest generation
      await mintTokens(contracts.inboundToken, deployer.address);

      if (strategyType === "aave") {
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
        await contracts.curvePool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true);
        await contracts.curvePool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
      } else if (strategyType === "mobius") {
        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
        await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

        await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
      }
      await contracts.goodGhosting.redeemFromExternalPool(0);
      const contractBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
      const totalGamePrincipal = await contracts.goodGhosting.totalGamePrincipal();
      const grossInterest = contractBalance.sub(totalGamePrincipal);
      const regularAdminFee = grossInterest.mul(ethers.BigNumber.from(1)).div(ethers.BigNumber.from(100));
      // There's no winner, so admin takes it all
      let adminMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);

      await expect(contracts.goodGhosting.adminFeeWithdraw())
        .emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(
          deployer.address,
          grossInterest.sub(regularAdminFee),
          regularAdminFee,
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(0),
        );
      let adminMaticBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
      assert(adminMaticBalanceAfterWithdraw.eq(adminMaticBalanceBeforeWithdraw));
    });

    it("withdraw fees when there's both interest generated by external pool and early withdrawal fees", async () => {
      const accounts = await ethers.getSigners();
      const deployer = accounts[0];
      const player1 = accounts[2];
      const player2 = accounts[3];

      await joinGame(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      await contracts.goodGhosting.connect(player1).earlyWithdraw(0);

      for (let index = 1; index < segmentCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player2, segmentPayment, segmentPayment);
      }
      // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
      // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      // mocks interest generation
      await mintTokens(contracts.inboundToken, deployer.address);

      if (strategyType === "aave") {
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
        await contracts.curvePool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true);
        await contracts.curvePool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
      } else if (strategyType === "mobius") {
        await contracts.inboundToken
          .connect(deployer)
          .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
        await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

        await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
      }
      await contracts.goodGhosting.redeemFromExternalPool(0);
      const contractBalance = await contracts.inboundToken.balanceOf(contracts.goodGhosting.address);
      const totalGamePrincipal = await contracts.goodGhosting.totalGamePrincipal();
      const grossInterest = contractBalance.sub(totalGamePrincipal);
      const regularAdminFee = grossInterest.mul(ethers.BigNumber.from(1)).div(ethers.BigNumber.from(100));
      // There's no winner, so admin takes it all
      let adminMaticBalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(deployer.address);

      await expect(contracts.goodGhosting.adminFeeWithdraw())
        .emit(contracts.goodGhosting, "AdminWithdrawal")
        .withArgs(
          deployer.address,
          grossInterest.sub(regularAdminFee),
          regularAdminFee,
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(0),
          ethers.BigNumber.from(0),
        );
      let adminMaticBalanceAfterWithdraw = await contracts.rewardToken.balanceOf(deployer.address);
      assert(adminMaticBalanceAfterWithdraw.eq(adminMaticBalanceBeforeWithdraw));
    });
  });
};

export const shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentis0 = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      maxPlayersCount,
      true,
      true,
      true,
      false,
      strategyType,
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
      segmentCount,
      segmentLength,
      contracts.goodGhosting,
      segmentPayment,
    );

    await contracts.goodGhosting.redeemFromExternalPool(0);

    // reward token balance
    await expect(contracts.goodGhosting.adminFeeWithdraw())
      .to.emit(contracts.goodGhosting, "AdminWithdrawal")
      .withArgs(
        deployer.address,
        ethers.BigNumber.from(0),
        ethers.BigNumber.from(0),
        ethers.BigNumber.from(0),
        ethers.BigNumber.from(0),
        ethers.BigNumber.from(0),
      );
  });

  it("extra incentives sent to admin in case of no winners", async () => {
    const accounts = await ethers.getSigners();
    const deployer = accounts[0];
    const player1 = accounts[2];

    await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    await advanceToEndOfGame(contracts.goodGhosting, segmentLength, segmentCount);
    await contracts.goodGhosting.redeemFromExternalPool(0);
    const adminIncentiveTokenBalanceBeforeWithdraw = await contracts.incentiveToken.balanceOf(deployer.address);
    await contracts.goodGhosting.adminFeeWithdraw();
    const adminIncentiveTokenBalanceAfterWithdraw = await contracts.incentiveToken.balanceOf(deployer.address);
    assert(adminIncentiveTokenBalanceAfterWithdraw.gt(adminIncentiveTokenBalanceBeforeWithdraw));
  });
};

export const shouldBehaveLikeVariableDepositPool = async (strategyType: string) => {
  beforeEach(async () => {
    contracts = await deployPool(
      segmentCount,
      segmentLength,
      segmentPayment,
      1,
      0,
      maxPlayersCount,
      true,
      false,
      true,
      true,
      strategyType,
    );
  });

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

    for (let index = 1; index < segmentCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      await makeDeposit(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).div(ethers.BigNumber.from("2")).toString(),
      );
      await makeDeposit(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
    }
    // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
    // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);

    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);

    // mocks interest generation
    await mintTokens(contracts.inboundToken, deployer.address);

    if (strategyType === "aave") {
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
      await contracts.curvePool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true);
      await contracts.curvePool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    await contracts.goodGhosting.redeemFromExternalPool(0);

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
    assert(cummalativePlayer1IndexBeforeWithdraw.gt(cummalativePlayer2IndexBeforeWithdraw));
    const player1BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player1.address);
    const player2BalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player2.address);

    await contracts.goodGhosting.connect(player1).withdraw(0);
    await contracts.goodGhosting.connect(player2).withdraw(0);
    const player1BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player1.address);
    const player2BalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player2.address);
    // since player1 deposited high amount it get's more interest
    assert(
      player1BalanceAfterWithdraw
        .sub(player1BalanceBeforeWithdraw)
        .gt(player2BalanceAfterWithdraw.sub(player2BalanceBeforeWithdraw)),
    );
  });

  it("2 players join the game with different amounts and deposit different amounts throughout and get interest accordingly on withdraw", async () => {
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

    for (let index = 1; index < segmentCount; index++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      await makeDeposit(
        contracts.goodGhosting,
        contracts.inboundToken,
        player2,
        segmentPayment,
        ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString(),
      );
      await makeDeposit(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
    }
    // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
    // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);

    const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);

    // mocks interest generation
    await mintTokens(contracts.inboundToken, deployer.address);

    if (strategyType === "aave") {
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
      await contracts.curvePool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true);
      await contracts.curvePool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    } else if (strategyType === "mobius") {
      await contracts.inboundToken
        .connect(deployer)
        .approve(contracts.mobiPool.address, ethers.utils.parseEther("100000"));
      await contracts.mobiPool.connect(deployer).addLiquidity([ethers.utils.parseEther("1000"), "0"], 0, 1000);

      await contracts.mobiPool.transfer(contracts.strategy.address, ethers.utils.parseEther("1000"));
    }
    await contracts.goodGhosting.redeemFromExternalPool(0);

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

    let governanceTokenBalance = 0;
    const sum = await contracts.goodGhosting.sum();
    const gameInterest = await contracts.goodGhosting.totalGameInterest();

    let player1Share = ethers.BigNumber.from(cummalativePlayer1IndexBeforeWithdraw)
      .mul(ethers.BigNumber.from(100))
      .div(ethers.BigNumber.from(sum));
    player1Share = ethers.BigNumber.from(gameInterest).mul(player1Share).div(ethers.BigNumber.from(100));

    const player1Deposit = ethers.BigNumber.from(player1Info.amountPaid);
    const rewardTokenBalance = await contracts.rewardToken.balanceOf(contracts.goodGhosting.address);
    if (strategyType === "curve") {
      governanceTokenBalance = await contracts.curve.balanceOf(contracts.goodGhosting.address);
    } else if (strategyType === "mobius") {
      governanceTokenBalance = await contracts.mobi.balanceOf(contracts.goodGhosting.address);
    }

    await expect(contracts.goodGhosting.connect(player1).withdraw(0))
      .to.emit(contracts.goodGhosting, "Withdrawal")
      .withArgs(
        player1.address,
        player1Deposit.add(player1Share),
        ethers.BigNumber.from(0),
        rewardTokenBalance.div(ethers.BigNumber.from(2)),
        governanceTokenBalance,
      );

    let player2Share = ethers.BigNumber.from(cummalativePlayer2IndexBeforeWithdraw)
      .mul(ethers.BigNumber.from(100))
      .div(ethers.BigNumber.from(sum));
    player2Share = ethers.BigNumber.from(gameInterest).mul(player2Share).div(ethers.BigNumber.from(100));

    const player2Deposit = ethers.BigNumber.from(player2Info.amountPaid);
    await expect(contracts.goodGhosting.connect(player2).withdraw(0))
      .to.emit(contracts.goodGhosting, "Withdrawal")
      .withArgs(
        player2.address,
        player2Deposit.add(player2Share),
        ethers.BigNumber.from(0),
        rewardTokenBalance.div(ethers.BigNumber.from(2)),
        governanceTokenBalance,
      );
  });
};
