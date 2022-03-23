import * as chai from "chai";
import { solidity } from "ethereum-waffle";
import { deployPool } from "./pool.utils";
const { ethers } = require("hardhat");

chai.use(solidity);

describe("Whitelisted Pool Tests", () => {
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
  const whitelistedPlayerConfig: any = [
    {
      "0x7B239486bB165D44825eA1dB7f05871C34dd7ae6": {
        index: 0,
        proof: ["0xbf487a663a520b8ab6ce29046bb423036e0e8e52f10206c864bbb2fff251d14e"],
      },
    },
    {
      "0x9a7f07D42c659192D5453cE7B084D58714F8D749": {
        index: 1,
        proof: ["0xb548f0cbfa6a7c5d853b7ce9c00498a4af94beb68de50ff87fb1f34c6b5262cf"],
      },
    },
    // invalid user
    {
      "0x293db08a10CA1be2Fb4faE4603469Ca1CD2f886E": {
        index: 3,
        proof: ["0x45533c7da4a9f550fb2a9e5efe3b6db62261670807ed02ce75cb871415d708cc"],
      },
    },
  ];

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
      "curve",
      0,
      true,
    );
  });

  describe("should behave like a whitelisted pool", async () => {
    it("reverts if a non whitelisted player tries to join", async () => {
      const accounts = await ethers.getSigners();
      const player3 = accounts[4];
      await expect(
        contracts.goodGhosting
          .connect(player3)
          .joinWhitelistedGame(
            whitelistedPlayerConfig[2][player3.address].index,
            whitelistedPlayerConfig[2][player3.address].proof,
            0,
            0,
          ),
      ).to.be.revertedWith("INVALID_PROOF()");
    });

    it("reverts when players call joinGame instead of joinWhitelistedGame", async () => {
      const accounts = await ethers.getSigners();

      const player1 = accounts[2];
      await expect(contracts.goodGhosting.connect(player1).joinGame(0, 0)).to.be.revertedWith(
        "Whitelisting enabled - use joinWhitelistedGame(uint256, bytes32[]) instead",
      );
    });

    it("players are able to join a whitelisted pool and are able to withdraw their funds", async () => {
      let governanceTokenPlayer1BalanceAfterWithdraw = 0,
        governanceTokenPlayer2BalanceAfterWithdraw = 0,
        rewardTokenPlayer1BalanceAfterWithdraw = 0,
        rewardTokenPlayer2BalanceAfterWithdraw = 0,
        governanceTokenPlayer1BalanceBeforeWithdraw = 0,
        governanceTokenPlayer2BalanceBeforeWithdraw = 0,
        rewardTokenPlayer1BalanceBeforeWithdraw = 0,
        rewardTokenPlayer2BalanceBeforeWithdraw = 0;
      const accounts = await ethers.getSigners();

      const player1 = accounts[2];
      const player2 = accounts[3];
      await contracts.inboundToken
        .connect(player1)
        .approve(
          contracts.goodGhosting.address,
          ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("1000")).toString(),
        );

      await contracts.inboundToken
        .connect(player2)
        .approve(
          contracts.goodGhosting.address,
          ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("1000")).toString(),
        );
      await contracts.goodGhosting
        .connect(player1)
        .joinWhitelistedGame(
          whitelistedPlayerConfig[0][player1.address].index,
          whitelistedPlayerConfig[0][player1.address].proof,
          0,
          0,
        );
      await contracts.goodGhosting
        .connect(player2)
        .joinWhitelistedGame(
          whitelistedPlayerConfig[1][player2.address].index,
          whitelistedPlayerConfig[1][player2.address].proof,
          0,
          0,
        );

      for (let index = 1; index < depositCount; index++) {
        await ethers.provider.send("evm_increaseTime", [segmentLength]);
        await ethers.provider.send("evm_mine", []);
        await contracts.goodGhosting.connect(player1).makeDeposit(0, 0);
        await contracts.goodGhosting.connect(player2).makeDeposit(0, 0);
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);

      const waitingRoundLength = await contracts.goodGhosting.waitingRoundSegmentLength();
      await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
      await ethers.provider.send("evm_mine", []);

      governanceTokenPlayer1BalanceBeforeWithdraw = await contracts.curve.balanceOf(player1.address);
      governanceTokenPlayer2BalanceBeforeWithdraw = await contracts.curve.balanceOf(player2.address);

      rewardTokenPlayer1BalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player1.address);
      rewardTokenPlayer2BalanceBeforeWithdraw = await contracts.rewardToken.balanceOf(player2.address);

      await contracts.goodGhosting.redeemFromExternalPoolForFixedDepositPool(0);

      await contracts.goodGhosting.connect(player1).withdraw(0);
      await contracts.goodGhosting.connect(player2).withdraw(0);

      governanceTokenPlayer1BalanceAfterWithdraw = await contracts.curve.balanceOf(player1.address);
      governanceTokenPlayer2BalanceAfterWithdraw = await contracts.curve.balanceOf(player2.address);
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
    });
  });
});
