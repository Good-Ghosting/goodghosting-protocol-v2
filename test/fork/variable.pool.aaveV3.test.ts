import * as chai from "chai";
import { solidity } from "ethereum-waffle";
const { network, ethers } = require("hardhat");
const { providers, deployConfigs } = require("../../deploy.config");
import * as lendingProvider from "../../artifacts/contracts/aaveV3/IPoolAddressesProvider.sol/IPoolAddressesProvider.json";
import * as incentiveController from "../../artifacts/contracts/aaveV3/IRewardsController.sol/IRewardsController.json";
import * as wmatic from "../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json";
import * as dataProvider from "../../artifacts/contracts/mock/LendingPoolAddressesProviderMock.sol/LendingPoolAddressesProviderMock.json";

chai.use(solidity);
const { expect } = chai;

let impersonatedSigner: any;
let daiInstance: any, wmaticInstance: any, adaiInstance: any;
let accounts: any[];
let pool: any, strategy: any;
const { depositCount, segmentLength, segmentPayment: segmentPaymentInt, earlyWithdrawFee } = deployConfigs;

const daiDecimals = ethers.BigNumber.from("1000000000000000000");
const segmentPayment = daiDecimals.mul(ethers.BigNumber.from(segmentPaymentInt)); // equivalent to 10 Inbound Token
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

describe("Aave V3 Variable Deposit Pool Fork Tests", () => {
  if (
    process.env.NETWORK === "local-celo-mobius-dai" ||
    process.env.NETWORK === "local-celo-mobius-usdc" ||
    process.env.NETWORK === "local-celo-moola" ||
    process.env.NETWORK === "local-variable-celo-moola" ||
    process.env.NETWORK === "local-variable-celo-mobius-dai" ||
    process.env.NETWORK === "local-variable-celo-mobius-ussdc" ||
    process.env.NETWORK === "local-polygon-curve-aave" ||
    process.env.NETWORK === "local-polygon-curve-atricrypto" ||
    process.env.NETWORK === "local-variable-polygon-curve-aave" ||
    process.env.NETWORK === "local-variable-polygon-curve-atricrypto"
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
      providers["polygon"]["aaveV3"].lendingPoolAddressProvider,
      lendingProvider.abi,
      impersonatedSigner,
    );
    dataProviderInstance = new ethers.Contract(
      providers["polygon"]["aaveV3"].dataProvider,
      dataProvider.abi,
      impersonatedSigner,
    );
    incentiveControllerInstance = new ethers.Contract(
      providers["polygon"]["aaveV3"].incentiveController,
      incentiveController.abi,
      impersonatedSigner,
    );

    wmaticInstance = new ethers.Contract(providers["polygon"]["wmatic"].address, wmatic.abi, impersonatedSigner);
    daiInstance = new ethers.Contract(providers["polygon"]["dai"].address, wmatic.abi, impersonatedSigner);

    strategy = await ethers.getContractFactory("AaveStrategyV3", accounts[0]);
    strategy = await strategy.deploy(
      lendingPoolAddressProviderInstance.address,
      providers["polygon"]["aaveV3"].wethGateway,
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
          .withArgs(accounts[i].address, ethers.utils.parseEther("5"));
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
          await expect(pool.connect(accounts[j]).makeDeposit(0, ethers.utils.parseEther("25")))
            .to.emit(pool, "Deposit")
            .withArgs(accounts[j].address, currentSegment, ethers.utils.parseEther("25"));
        } else {
          await expect(pool.connect(accounts[j]).makeDeposit(0, ethers.utils.parseEther("5")))
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
    const largeDepositUserInboundTokenBalanceBeforeWithdraw = await daiInstance.balanceOf(accounts[1].address);
    const smallDepositUserInboundTokenBalanceBeforeWithdraw = await daiInstance.balanceOf(accounts[2].address);
    for (let j = 1; j < 5; j++) {
      const inboundTokenBalanceBeforeWithdraw = await daiInstance.balanceOf(accounts[j].address);
      await pool.connect(accounts[j]).withdraw(0);
      const inboundTokenBalanceAfterWithdraw = await daiInstance.balanceOf(accounts[j].address);
      assert(inboundTokenBalanceAfterWithdraw.gt(inboundTokenBalanceBeforeWithdraw));
    }
    const largeDepositUserInboundTokenBalanceAfterWithdraw = await daiInstance.balanceOf(accounts[1].address);
    const smallDepositUserInboundTokenBalanceAftetWithdraw = await daiInstance.balanceOf(accounts[2].address);
    const inboundtokenDiffForPlayer1 = largeDepositUserInboundTokenBalanceAfterWithdraw.sub(
      largeDepositUserInboundTokenBalanceBeforeWithdraw,
    );

    const inboundtokenDiffForPlayer2 = smallDepositUserInboundTokenBalanceAftetWithdraw.sub(
      smallDepositUserInboundTokenBalanceBeforeWithdraw,
    );

    assert(inboundtokenDiffForPlayer2.lt(inboundtokenDiffForPlayer1));
  });

  it("admin is able to withdraw from the pool", async () => {
    const inboundTokenBalanceBeforeWithdraw = await daiInstance.balanceOf(accounts[0].address);
    await pool.connect(accounts[0]).adminFeeWithdraw();
    const poolBalanceAfterAllWithdraws = await daiInstance.balanceOf(pool.address);
    assert(poolBalanceAfterAllWithdraws.eq(ethers.BigNumber.from(0)));
    const inboundTokenBalanceAfterWithdraw = await daiInstance.balanceOf(accounts[0].address);
    assert(inboundTokenBalanceAfterWithdraw.gt(inboundTokenBalanceBeforeWithdraw));
  });
});
