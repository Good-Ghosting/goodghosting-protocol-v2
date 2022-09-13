import * as chai from "chai";
import { solidity } from "ethereum-waffle";
import { deployPool } from "../pool.utils";

import {
  shouldBehaveLikeJoiningGGPool,
  shouldBehaveLikeDepositingGGPool,
  shouldBehaveLikeEarlyWithdrawingGGPool,
  shouldBehaveLikeGGPoolWithNoWinners,
  shouldBehaveLikePlayersWithdrawingFromGGPool,
  shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentMoreThan0,
  shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentis0,
  shouldBehaveLikeVariableDepositPool,
  shouldBehaveLikeGGPoolWithTransactionalToken,
  shouldBehaveLikeGGPoolWithSameTokenAddresses,
} from "../pool.behavior";

chai.use(solidity);

describe("Pool using No External Strategy", () => {
  if (
    process.env.NETWORK === "local-celo" ||
    process.env.NETWORK === "local-variable-celo" ||
    process.env.NETWORK === "local-polygon" ||
    process.env.NETWORK === "local-variable-polygon"
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
  const maxPlayersCount = "18446744073709551615";

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
      "no_strategy",
      0,
      false,
    );
  });

  describe("when an user tries to join a game", async () => {
    await shouldBehaveLikeJoiningGGPool("no_strategy");
  });

  describe("when an user tries to make a deposit", async () => {
    await shouldBehaveLikeDepositingGGPool("no_strategy");
  });

  describe("when a user withdraws before the end of the game", async () => {
    await shouldBehaveLikeEarlyWithdrawingGGPool("no_strategy");
  });

  describe("when no one wins the game", async () => {
    await shouldBehaveLikeGGPoolWithNoWinners("no_strategy");
  });

  describe("when an user tries to withdraw", async () => {
    await shouldBehaveLikePlayersWithdrawingFromGGPool("no_strategy");
  });

  describe("When a admin tries to withdraw fees when custom fee percentage is more than 0", async () => {
    await shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentMoreThan0("no_strategy");
  });

  describe("admin tries to withdraw fees with admin percentage fee equal to 0 and no winners", async () => {
    await shouldBehaveLikeAdminWithdrawingFeesFromGGPoolWithFeePercentis0("no_strategy");
  });

  describe("players participate in a variable amount deposit pool", async () => {
    await shouldBehaveLikeVariableDepositPool("no_strategy");
  });

  describe("player participate in a pool with a transactional token as a deposit asset", async () => {
    await shouldBehaveLikeGGPoolWithTransactionalToken("no_strategy");
  });

  describe("pool where deposit tokens is same as reward/governance token or both", async () => {
    await shouldBehaveLikeGGPoolWithSameTokenAddresses("no_strategy");
  });
});
