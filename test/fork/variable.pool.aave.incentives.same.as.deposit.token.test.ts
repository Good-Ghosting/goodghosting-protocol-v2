import * as chai from "chai";
import { solidity } from "ethereum-waffle";
const { network, ethers } = require("hardhat");
const { deployConfigs } = require("../../deploy.config");
const { providers } = require("../../providers.config");
import * as lendingProvider from "../../artifacts/contracts/aave/ILendingPoolAddressesProvider.sol/ILendingPoolAddressesProvider.json";
import * as incentiveController from "../../artifacts/contracts/aave/IncentiveController.sol/IncentiveController.json";
import * as wmatic from "../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json";
import * as dataProvider from "../../artifacts/contracts/mock/LendingPoolAddressesProviderMock.sol/LendingPoolAddressesProviderMock.json";
import { isGreaterThanZero } from "../pool.utils";

chai.use(solidity);
const { expect } = chai;

let impersonatedSigner: any;
let daiInstance: any, wmaticInstance: any;
let accounts: any[];
let pool: any, strategy: any;
const { depositCount, segmentLength, segmentPayment: segmentPaymentInt, earlyWithdrawFee } = deployConfigs;

const daiDecimals = ethers.BigNumber.from("1000000000000000000");
const segmentPayment = daiDecimals.mul(ethers.BigNumber.from(segmentPaymentInt)); // equivalent to 10 Inbound Token
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("Aave Variable Deposit Pool Fork Tests with incentives sent same as deposit token", () => {
  if (
    process.env.NETWORK === "local-celo" ||
    process.env.NETWORK === "local-variable-celo" ||
    process.env.NETWORK === "local-polygon" ||
    process.env.NETWORK === "local-variable-polygon"
  ) {
    return;
  }

  if (process.env.FORKING == "false") {
    return;
  }

  before(async function () {
    accounts = await ethers.getSigners();
    let lendingPoolAddressProviderInstance: any, dataProviderInstance: any, incentiveControllerInstance: any;

    const impersonateAddress = process.env.WHALE_ADDRESS_FORKED_NETWORK;
    // Impersonate as another address
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [impersonateAddress],
    });

    impersonatedSigner = await ethers.getSigner(impersonateAddress);

    lendingPoolAddressProviderInstance = new ethers.Contract(
      providers["polygon"].strategies["aaveV2"].lendingPoolAddressProvider,
      lendingProvider.abi,
      impersonatedSigner,
    );
    dataProviderInstance = new ethers.Contract(
      providers["polygon"].strategies["aaveV2"].dataProvider,
      dataProvider.abi,
      impersonatedSigner,
    );
    incentiveControllerInstance = new ethers.Contract(
      providers["polygon"].strategies["aaveV2"].incentiveController,
      incentiveController.abi,
      impersonatedSigner,
    );

    wmaticInstance = new ethers.Contract(providers["polygon"].tokens["wmatic"].address, wmatic.abi, impersonatedSigner);
    daiInstance = new ethers.Contract(providers["polygon"].tokens["dai"].address, wmatic.abi, impersonatedSigner);

    strategy = await ethers.getContractFactory("AaveStrategy", accounts[0]);
    strategy = await strategy.deploy(
      lendingPoolAddressProviderInstance.address,
      providers["polygon"].strategies["aaveV2"].wethGateway,
      dataProviderInstance.address,
      incentiveControllerInstance.address,
      wmaticInstance.address,
      daiInstance.address,
    );

    pool = await ethers.getContractFactory("Pool", accounts[0]);
    pool = await pool.deploy(
      daiInstance.address,
      ethers.utils.parseEther((1000).toString()),
      deployConfigs.depositCount.toString(),
      deployConfigs.segmentLength.toString(),
      deployConfigs.waitingRoundSegmentLength.toString(),
      segmentPayment.toString(),
      deployConfigs.earlyWithdrawFee.toString(),
      deployConfigs.adminFee.toString(),
      deployConfigs.maxPlayersCount.toString(),
      true,
      strategy.address,
      false,
    );

    await strategy.connect(accounts[0]).transferOwnership(pool.address);
    await pool.initialize(ZERO_ADDRESS);

    const impersonateAccountBalance = await daiInstance.balanceOf(impersonatedSigner.address);
    console.log(`Impersonate Account  Balance`, impersonateAccountBalance.toString());

    // send out tokens to the players
    for (let i = 0; i < 5; i++) {
      await daiInstance.connect(impersonatedSigner).transfer(accounts[i].address, ethers.utils.parseEther("100"));
    }

    // sending in extra incentives to the pool contract
    await daiInstance.connect(impersonatedSigner).transfer(pool.address, ethers.utils.parseEther("100"));
  });

  it("players are able to approve inbound token and join the pool", async () => {
    for (let i = 0; i < 5; i++) {
      await daiInstance.connect(accounts[i]).approve(pool.address, ethers.utils.parseEther("200"));
      if (i == 1) {
        await pool.connect(accounts[i]).joinGame(0, ethers.utils.parseEther("25"));
      } else {
        await pool.connect(accounts[i]).joinGame(0, ethers.utils.parseEther("5"));
      }
      if (i == 0) {
        await pool.connect(accounts[i]).earlyWithdraw(0);
        await expect(pool.connect(accounts[i]).joinGame(0, ethers.utils.parseEther("5")))
          .to.emit(pool, "JoinedGame")
          .withArgs(
            accounts[i].address,
            ethers.utils.parseEther("5"),
            ethers.utils.parseEther("5"),
            isGreaterThanZero,
            isGreaterThanZero,
            isGreaterThanZero,
          );
      }
    }
  });

  it("players are able to make deposits and 1 player early withdraws", async () => {
    for (let i = 1; i < depositCount; i++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      if (i == 1) {
        await pool.connect(accounts[0]).makeDeposit(0, ethers.utils.parseEther("5"));
        const playerInfo = await pool.players(accounts[0].address);
        let totalPrincipal = await pool.totalGamePrincipal();
        totalPrincipal = totalPrincipal.sub(playerInfo.amountPaid);
        let totaNetlPrincipal = await pool.netTotalGamePrincipal();
        totaNetlPrincipal = totaNetlPrincipal.sub(playerInfo.netAmountPaid);
        const feeAmount = ethers.BigNumber.from(playerInfo.amountPaid)
          .mul(ethers.BigNumber.from(earlyWithdrawFee))
          .div(ethers.BigNumber.from(100)); // fee is set as an integer, so needs to be converted to a percentage
        await expect(pool.connect(accounts[0]).earlyWithdraw(0))
          .to.emit(pool, "EarlyWithdrawal")
          .withArgs(
            accounts[0].address,
            playerInfo.amountPaid.sub(feeAmount),
            totalPrincipal,
            totaNetlPrincipal,
            playerInfo.amountPaid,
            playerInfo.netAmountPaid,
            isGreaterThanZero,
            isGreaterThanZero,
          );
      }
      const currentSegment = await pool.getCurrentSegment();
      for (let j = 1; j < 5; j++) {
        if (j == 1) {
          await expect(pool.connect(accounts[j]).makeDeposit(0, ethers.utils.parseEther("25")))
            .to.emit(pool, "Deposit")
            .withArgs(
              accounts[j].address,
              currentSegment,
              ethers.utils.parseEther("25"),
              ethers.utils.parseEther("25"),
              isGreaterThanZero,
              isGreaterThanZero,
              isGreaterThanZero,
            );
        } else {
          await expect(pool.connect(accounts[j]).makeDeposit(0, ethers.utils.parseEther("5")))
            .to.emit(pool, "Deposit")
            .withArgs(
              accounts[j].address,
              currentSegment,
              ethers.utils.parseEther("5"),
              ethers.utils.parseEther("5"),
              isGreaterThanZero,
              isGreaterThanZero,
              isGreaterThanZero,
            );
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
    const largeDepositUserInboundTokenBalanceBeforeWithdraw = await daiInstance.balanceOf(accounts[1].address);
    const largeDepositUserRewardTokenBalanceBeforeWithdraw = await wmaticInstance.balanceOf(accounts[1].address);
    const smallDepositUserInboundTokenBalanceBeforeWithdraw = await daiInstance.balanceOf(accounts[2].address);
    const smallDepositUserRewardTokenBalanceBeforeWithdraw = await wmaticInstance.balanceOf(accounts[2].address);
    for (let j = 1; j < 5; j++) {
      const inboundTokenBalanceBeforeWithdraw = await daiInstance.balanceOf(accounts[j].address);
      const rewardTokenBalanceBeforeWithdraw = await wmaticInstance.balanceOf(accounts[j].address);
      await pool.connect(accounts[j]).withdraw(0);
      const rewardTokenBalanceAfterWithdraw = await wmaticInstance.balanceOf(accounts[j].address);
      const inboundTokenBalanceAfterWithdraw = await daiInstance.balanceOf(accounts[j].address);
      assert(inboundTokenBalanceAfterWithdraw.gt(inboundTokenBalanceBeforeWithdraw));
      assert(rewardTokenBalanceAfterWithdraw.gte(rewardTokenBalanceBeforeWithdraw));
    }
    const largeDepositUserInboundTokenBalanceAfterWithdraw = await daiInstance.balanceOf(accounts[1].address);
    const largeDepositUserRewardTokenBalanceAftertWithdraw = await wmaticInstance.balanceOf(accounts[1].address);
    const smallDepositUserInboundTokenBalanceAftetWithdraw = await daiInstance.balanceOf(accounts[2].address);
    const smallDepositUserRewardTokenBalanceAfterWithdraw = await wmaticInstance.balanceOf(accounts[2].address);
    const inboundtokenDiffForPlayer1 = largeDepositUserInboundTokenBalanceAfterWithdraw.sub(
      largeDepositUserInboundTokenBalanceBeforeWithdraw,
    );
    const rewardtokenDiffPlayer1 = largeDepositUserRewardTokenBalanceAftertWithdraw.sub(
      largeDepositUserRewardTokenBalanceBeforeWithdraw,
    );
    const inboundtokenDiffForPlayer2 = smallDepositUserInboundTokenBalanceAftetWithdraw.sub(
      smallDepositUserInboundTokenBalanceBeforeWithdraw,
    );
    const rewardtokenDiffForPlayer2 = smallDepositUserRewardTokenBalanceAfterWithdraw.sub(
      smallDepositUserRewardTokenBalanceBeforeWithdraw,
    );
    assert(inboundtokenDiffForPlayer2.lt(inboundtokenDiffForPlayer1));
    assert(rewardtokenDiffForPlayer2.lte(rewardtokenDiffPlayer1));
  });

  it("admin is able to withdraw from the pool", async () => {
    const inboundTokenBalanceBeforeWithdraw = await daiInstance.balanceOf(accounts[0].address);
    await pool.connect(accounts[0]).adminFeeWithdraw(0);
    const poolBalanceAfterAllWithdraws = await daiInstance.balanceOf(pool.address);
    assert(poolBalanceAfterAllWithdraws.eq(ethers.BigNumber.from(0)));
    const inboundTokenBalanceAfterWithdraw = await daiInstance.balanceOf(accounts[0].address);
    assert(inboundTokenBalanceAfterWithdraw.gt(inboundTokenBalanceBeforeWithdraw));

    const poolBalance = await daiInstance.balanceOf(pool.address);
    assert(poolBalance.eq(ethers.BigNumber.from(0)));
  });
});
