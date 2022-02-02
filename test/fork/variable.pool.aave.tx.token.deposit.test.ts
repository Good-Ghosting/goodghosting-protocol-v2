import * as chai from "chai";
import { solidity } from "ethereum-waffle";
const { network, ethers } = require("hardhat");
const { providers, deployConfigs } = require("../../deploy.config");
const lendingProvider = require("../../artifacts/contracts/aave/ILendingPoolAddressesProvider.sol/ILendingPoolAddressesProvider.json");
import * as incentiveController from "../../artifacts/contracts/aave/IncentiveController.sol/IncentiveController.json";
const wmatic = require("../../abi-external/wmatic.abi.json");

import * as dataProvider from "../../artifacts/contracts/mock/LendingPoolAddressesProviderMock.sol/LendingPoolAddressesProviderMock.json";

chai.use(solidity);
const { expect } = chai;

// dai holder
let impersonatedSigner: any;
let wmaticInstance: any;

let accounts: any[];
let pool: any, strategy: any;
const { depositCount, segmentLength, segmentPayment: segmentPaymentInt, earlyWithdrawFee } = deployConfigs;

const daiDecimals = ethers.BigNumber.from("1000000000000000000");
const segmentPayment = daiDecimals.mul(ethers.BigNumber.from(segmentPaymentInt)); // equivalent to 10 Inbound Token
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("Aave Variable Deposit Pool Fork Tests with the deposit token as transsactional token", () => {
  if (
    process.env.NETWORK === "local-celo-mobius" ||
    process.env.NETWORK === "local-moola" ||
    process.env.NETWORK === "local-variable-moola" ||
    process.env.NETWORK === "local-variable-celo-mobius" ||
    process.env.NETWORK === "local-polygon-curve" ||
    process.env.NETWORK === "local-variable-polygon-curve"
  ) {
    return;
  }

  if (process.env.FORKING == "false") {
    return;
  }

  before(async function () {
    accounts = await ethers.getSigners();
    let lendingPoolAddressProviderInstance: any, dataProviderInstance: any, incentiveControllerInstance: any;

    lendingPoolAddressProviderInstance = new ethers.Contract(
      providers["aave"]["polygon"].lendingPoolAddressProvider,
      lendingProvider.abi,
      impersonatedSigner,
    );
    dataProviderInstance = new ethers.Contract(
      providers["aave"]["polygon"].dataProvider,
      dataProvider.abi,
      impersonatedSigner,
    );
    incentiveControllerInstance = new ethers.Contract(
      providers["aave"]["polygon"].incentiveController,
      incentiveController.abi,
      impersonatedSigner,
    );

    wmaticInstance = new ethers.Contract(providers["aave"]["polygon"].wmatic, wmatic, accounts[0]);

    strategy = await ethers.getContractFactory("AaveStrategy", accounts[0]);
    strategy = await strategy.deploy(
      lendingPoolAddressProviderInstance.address,
      providers["aave"]["polygon"].wethGateway,
      dataProviderInstance.address,
      incentiveControllerInstance.address,
      wmaticInstance.address,
    );

    pool = await ethers.getContractFactory("Pool", accounts[0]);
    pool = await pool.deploy(
      ZERO_ADDRESS,
      deployConfigs.depositCount.toString(),
      deployConfigs.segmentLength.toString(),
      deployConfigs.waitingRoundSegmentLength.toString(),
      segmentPayment.toString(),
      deployConfigs.earlyWithdrawFee.toString(),
      deployConfigs.adminFee.toString(),
      deployConfigs.maxPlayersCount.toString(),
      true,
      providers["aave"]["polygon"].incentiveToken,
      strategy.address,
      true,
    );

    await strategy.connect(accounts[0]).transferOwnership(pool.address);
  });

  it("players are able to approve inbound token and join the pool", async () => {
    for (let i = 0; i < 5; i++) {
      if (i == 1) {
        await pool
          .connect(accounts[i])
          .joinGame(0, ethers.utils.parseEther("20"), { value: ethers.utils.parseEther("20") });
      } else {
        await pool
          .connect(accounts[i])
          .joinGame(0, ethers.utils.parseEther("5"), { value: ethers.utils.parseEther("5") });
      }
      if (i == 0) {
        await pool.connect(accounts[i]).earlyWithdraw(0);
        await expect(
          pool.connect(accounts[i]).joinGame(0, ethers.utils.parseEther("5"), { value: ethers.utils.parseEther("5") }),
        )
          .to.emit(pool, "JoinedGame")
          .withArgs(accounts[i].address, ethers.utils.parseEther("5"));
      }
    }
  });

  it("players are able to make deposits and 1 player early withdraws", async () => {
    for (let i = 1; i < depositCount; i++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      if (i == 1) {
        await pool
          .connect(accounts[0])
          .makeDeposit(0, ethers.utils.parseEther("5"), { value: ethers.utils.parseEther("5") });
        const playerInfo = await pool.players(accounts[0].address);
        let totalPrincipal = await pool.totalGamePrincipal();
        totalPrincipal = totalPrincipal.sub(playerInfo.amountPaid);
        const feeAmount = ethers.BigNumber.from(playerInfo.amountPaid)
          .mul(ethers.BigNumber.from(earlyWithdrawFee))
          .div(ethers.BigNumber.from(100)); // fee is set as an integer, so needs to be converted to a percentage
        await expect(pool.connect(accounts[0]).earlyWithdraw(0))
          .to.emit(pool, "EarlyWithdrawal")
          .withArgs(accounts[0].address, playerInfo.amountPaid.sub(feeAmount), totalPrincipal);
      }
      const currentSegment = await pool.getCurrentSegment();

      for (let j = 1; j < 5; j++) {
        if (j == 1) {
          await expect(
            pool
              .connect(accounts[j])
              .makeDeposit(0, ethers.utils.parseEther("20"), { value: ethers.utils.parseEther("20") }),
          )
            .to.emit(pool, "Deposit")
            .withArgs(accounts[j].address, currentSegment, ethers.utils.parseEther("20"));
        } else {
          await expect(
            pool
              .connect(accounts[j])
              .makeDeposit(0, ethers.utils.parseEther("5"), { value: ethers.utils.parseEther("5") }),
          )
            .to.emit(pool, "Deposit")
            .withArgs(accounts[j].address, currentSegment, ethers.utils.parseEther("5"));
        }
      }
    }
    // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
    // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    const waitingRoundLength = await pool.waitingRoundSegmentLength();
    await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
    await ethers.provider.send("evm_mine", []);
    const gameStatus = await pool.isGameCompleted();
    chai.assert(gameStatus);
  });

  it("players are able to withdraw from the pool", async () => {
    const largeDepositUserInboundTokenBalanceBeforeWithdraw = await ethers.provider.getBalance(accounts[1].address);
    const largeDepositUserRewardTokenBalanceBeforeWithdraw = await wmaticInstance.balanceOf(accounts[1].address);
    const smallDepositUserInboundTokenBalanceBeforeWithdraw = await ethers.provider.getBalance(accounts[2].address);
    const smallDepositUserRewardTokenBalanceBeforeWithdraw = await wmaticInstance.balanceOf(accounts[2].address);
    for (let j = 1; j < 5; j++) {
      const inboundTokenBalanceBeforeWithdraw = await ethers.provider.getBalance(accounts[j].address);
      const rewardTokenBalanceBeforeWithdraw = await wmaticInstance.balanceOf(accounts[j].address);
      await pool.connect(accounts[j]).withdraw(0);
      const rewardTokenBalanceAfterWithdraw = await wmaticInstance.balanceOf(accounts[j].address);
      const inboundTokenBalanceAfterWithdraw = await ethers.provider.getBalance(accounts[j].address);
      assert(inboundTokenBalanceAfterWithdraw.gt(inboundTokenBalanceBeforeWithdraw));
      assert(rewardTokenBalanceAfterWithdraw.gte(rewardTokenBalanceBeforeWithdraw));
    }
    const largeDepositUserInboundTokenBalanceAfterWithdraw = await ethers.provider.getBalance(accounts[1].address);
    const largeDepositUserRewardTokenBalanceAftertWithdraw = await wmaticInstance.balanceOf(accounts[1].address);
    const smallDepositUserInboundTokenBalanceWithdrawWithdraw = await ethers.provider.getBalance(accounts[2].address);
    const smallDepositUserRewardTokenBalanceWithdrawWithdraw = await wmaticInstance.balanceOf(accounts[2].address);
    const inboundtokenDiffForPlayer1 = largeDepositUserInboundTokenBalanceAfterWithdraw.sub(
      largeDepositUserInboundTokenBalanceBeforeWithdraw,
    );
    const rewardtokenDiffPlayer1 = largeDepositUserRewardTokenBalanceAftertWithdraw.sub(
      largeDepositUserRewardTokenBalanceBeforeWithdraw,
    );
    const inboundtokenDiffForPlayer2 = smallDepositUserInboundTokenBalanceBeforeWithdraw.sub(
      smallDepositUserInboundTokenBalanceWithdrawWithdraw,
    );
    const rewardtokenDiffForPlayer2 = smallDepositUserRewardTokenBalanceBeforeWithdraw.sub(
      smallDepositUserRewardTokenBalanceWithdrawWithdraw,
    );
    assert(inboundtokenDiffForPlayer2.lt(inboundtokenDiffForPlayer1));
    assert(rewardtokenDiffForPlayer2.lte(rewardtokenDiffPlayer1));
  });

  it("admin is able to withdraw from the pool", async () => {
    const inboundTokenBalanceBeforeWithdraw = await ethers.provider.getBalance(accounts[0].address);
    await pool.connect(accounts[0]).adminFeeWithdraw();
    const inboundTokenBalanceAfterWithdraw = await ethers.provider.getBalance(accounts[0].address);
    assert(inboundTokenBalanceAfterWithdraw.gt(inboundTokenBalanceBeforeWithdraw));
  });
});
