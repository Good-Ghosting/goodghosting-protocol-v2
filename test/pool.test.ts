import { ethers } from "hardhat";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { approveToken, deployPool, unableToJoinGame, joinGame, shouldNotBeAbleToDeposit } from "./pool.utils";

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
} from "./pool.behavior";

chai.use(solidity);
const { expect } = chai;

describe("Pool using Aave strategy", () => {
  let contracts: any;
  const segmentCount = 3;
  const segmentLength = 600;
  const segmentPayment = "10000000000000000000";
  const maxPlayersCount = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

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
        "Game has already started",
      );
    });
  });

  describe("when a player tries to rejoin", async () => {
    await shouldBehaveLikeReJoiningGGPool("aave");

    // non-common tests in terms of open pool config in the contracts in the future
    it("reverts if user tries to rejoin the game after segment 0", async () => {
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
        "Game has already started",
      );
    });
  });

  describe("when an user tries to make a deposit", async () => {
    await shouldBehaveLikeDepositingGGPool("aave");

    it("reverts if user forgot to deposit for previous segment", async () => {
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
        "Player didn't pay the previous segment - game over!",
      );
    });
  });

  describe("when a user withdraws before the end of the game", async () => {
    await shouldBehaveLikeEarlyWithdrawingGGPool("aave");

    it("reverts if user tries to pay next segment after early withdraw", async () => {
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
        "Player already withdraw from game",
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
});
