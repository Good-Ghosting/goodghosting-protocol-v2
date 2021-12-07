import * as chai from "chai";
import { solidity } from "ethereum-waffle";
import { deployPool } from "../pool.utils";

import {
  shouldBehaveLikeJoiningGGPool,
  shouldBehaveLikeDepositingGGPool,
  shouldBehaveLikeEarlyWithdrawingGGPool,
  shouldBehaveLikeRedeemingFromGGPool,
  shouldBehaveLikeGGPoolWithNoWinners,
  shouldBehaveLikePlayersWithdrawingFromGGPool,
  shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentMoreThan0,
  shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentis0,
} from "../pool.behavior";

chai.use(solidity);

describe("Pool using Mobius Strategy", () => {
  if (process.env.NETWORK === "local-celo-mobius") {
    return;
  }

  if (process.env.FORKING == "true") {
    return;
  }
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
      "mobius",
    );
  });

  describe("when an user tries to join a game", async () => {
    await shouldBehaveLikeJoiningGGPool("curve");
  });

  describe("when an user tries to make a deposit", async () => {
    await shouldBehaveLikeDepositingGGPool("curve");
  });

  describe("when a user withdraws before the end of the game", async () => {
    await shouldBehaveLikeEarlyWithdrawingGGPool("curve");
  });

  describe("when an user tries to redeem from the external pool", async () => {
    await shouldBehaveLikeRedeemingFromGGPool("curve");
  });

  describe("when no one wins the game", async () => {
    await shouldBehaveLikeGGPoolWithNoWinners("curve");
  });

  describe("when an user tries to withdraw", async () => {
    await shouldBehaveLikePlayersWithdrawingFromGGPool("curve");
  });

  describe("When a admin tries to withdraw fees when custom fee percentage is more than 0", async () => {
    await shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentMoreThan0("curve");
  });

  describe("admin tries to withdraw fees with admin percentage fee equal to 0 and no winners", async () => {
    await shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentis0("curve");
  });
});
