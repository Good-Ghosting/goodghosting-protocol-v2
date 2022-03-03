const { ethers } = require("hardhat");
import * as chai from "chai";
import { solidity } from "ethereum-waffle";
import { approveToken, deployPool, unableToJoinGame, joinGame, shouldNotBeAbleToDeposit } from "../pool.utils";

import {
  shouldBehaveLikeGGPool,
  shouldBehaveLikeVariableDepositPool,
  shouldBehaveLikeJoiningGGPool,
  shouldBehaveLikeReJoiningGGPool,
  shouldBehaveLikeDepositingGGPool,
  shouldBehaveLikeEarlyWithdrawingGGPool,
  shouldBehaveLikeRedeemingFromGGPool,
  shouldBehaveLikeGGPoolWithNoWinners,
  shouldBehaveLikePlayersWithdrawingFromGGPool,
  shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentMoreThan0,
  shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentis0,
  shouldBehaveLikeGGPoolWithTransactionalToken,
  shouldBehaveLikeGGPoolWithSameTokenAddresses,
} from "../pool.behavior";

chai.use(solidity);
const { expect } = chai;

describe("Pool using Aave strategy", () => {
  if (
    process.env.NETWORK === "local-celo-mobius" ||
    process.env.NETWORK === "local-celo-moola" ||
    process.env.NETWORK === "local-variable-celo-moola" ||
    process.env.NETWORK === "local-variable-celo-mobius" ||
    process.env.NETWORK === "local-polygon-curve" ||
    process.env.NETWORK === "local-variable-polygon-curve"
  ) {
    return;
  }
  if (process.env.FORKING == "true") {
    return;
  }
  let contracts: any;
  const depositCount = 3;
  const segmentLength = 600;
  const segmentPayment = "10000000000000000000";
  const maxPlayersCount = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

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
      "aave",
      0,
    );
  });

  describe("should behave like GG Pool", async () => {
    await shouldBehaveLikeGGPool("aave");
  });

  describe("when an user tries to join a game", async () => {
    await shouldBehaveLikeJoiningGGPool("aave");

    // non-common tests in terms of open pool contracts in the future
    it("reverts if the user tries to join after the first segment", async () => {
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
        "aave",
        0,
      );
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      const accounts = await ethers.getSigners();
      const player1 = accounts[2];
      await unableToJoinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        segmentPayment,
        "GAME_ALREADY_STARTED()",
      );
    });
  });

  describe("when a player tries to rejoin", async () => {
    await shouldBehaveLikeReJoiningGGPool("aave");

    // non-common tests in terms of open pool config in the contracts in the future
    it("reverts if user tries to rejoin the game after segment 0", async () => {
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
        "aave",
        0,
      );
      const accounts = await ethers.getSigners();
      const player1 = accounts[2];
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await contracts.goodGhosting.connect(player1).earlyWithdraw(0);
      await unableToJoinGame(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        segmentPayment,
        "GAME_ALREADY_STARTED()",
      );
    });
  });

  describe("when an user tries to make a deposit", async () => {
    await shouldBehaveLikeDepositingGGPool("aave");

    it("reverts if user forgot to deposit for previous segment", async () => {
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
        "aave",
        0,
      );
      const accounts = await ethers.getSigners();
      const player1 = accounts[2];
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);
      await ethers.provider.send("evm_increaseTime", [segmentLength * 2]);
      await ethers.provider.send("evm_mine", []);
      await shouldNotBeAbleToDeposit(
        contracts.goodGhosting,
        contracts.inboundToken,
        player1,
        segmentPayment,
        segmentPayment,
        "PLAYER_DID_NOT_PAID_PREVIOUS_SEGMENT()",
      );
    });
  });

  describe("when a user withdraws before the end of the game", async () => {
    await shouldBehaveLikeEarlyWithdrawingGGPool("aave");

    it("reverts if user tries to pay next segment after early withdraw", async () => {
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
        "aave",
        0,
      );
      const accounts = await ethers.getSigners();
      const player1 = accounts[2];
      await joinGame(contracts.goodGhosting, contracts.inboundToken, player1, segmentPayment, segmentPayment);

      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await contracts.goodGhosting.connect(player1).earlyWithdraw(0);

      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      await approveToken(contracts.inboundToken, player1, contracts.goodGhosting.address, segmentPayment);
      await expect(contracts.goodGhosting.connect(player1).makeDeposit(0, segmentPayment)).to.be.revertedWith(
        "PLAYER_ALREADY_WITHDREW_EARLY()",
      );
    });
  });

  describe("when an user tries to redeem from the external pool", async () => {
    await shouldBehaveLikeRedeemingFromGGPool("aave");
  });

  describe("when no one wins the game", async () => {
    await shouldBehaveLikeGGPoolWithNoWinners("aave");
  });

  describe("when an user tries to withdraw", async () => {
    await shouldBehaveLikePlayersWithdrawingFromGGPool("aave");
  });

  describe("When a admin tries to withdraw fees when custom fee percentage is more than 0", async () => {
    await shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentMoreThan0("aave");
  });

  describe("admin tries to withdraw fees with admin percentage fee equal to 0 and no winners", async () => {
    await shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentis0("aave");
  });

  describe("players participate in a variable amount deposit pool", async () => {
    await shouldBehaveLikeVariableDepositPool("aave");
  });

  describe("player participate in a pool with a transactional token as a deposit asset", async () => {
    await shouldBehaveLikeGGPoolWithTransactionalToken("aave");
  });

  describe("pool where deposit tokens is same as reward/governance token or both", async () => {
    await shouldBehaveLikeGGPoolWithSameTokenAddresses("aave");
  });
});
