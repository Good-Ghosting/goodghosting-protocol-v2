import * as chai from "chai";
import { solidity } from "ethereum-waffle";
const { network, ethers } = require("hardhat");
const { providers, deployConfigs } = require("../../deploy/deploy.config");
import * as lendingProvider from "../../artifacts/contracts/aave/ILendingPoolAddressesProvider.sol/ILendingPoolAddressesProvider.json";
import * as incentiveController from "../../artifacts/contracts/aave/IncentiveController.sol/IncentiveController.json";
import * as wmatic from "../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json";
import * as dataProvider from "../../artifacts/contracts/mock/LendingPoolAddressesProviderMock.sol/LendingPoolAddressesProviderMock.json";

chai.use(solidity);
const { expect } = chai;

// dai holder
let impersonateAddress;
let impersonatedSigner: any;
let daiInstance: any, wmaticInstance;
let accounts: any[];
let pool: any, strategy: any;
const {
  depositCount,
  segmentLength,
  segmentPayment: segmentPaymentInt,
  waitingRoundSegmentLength,
  earlyWithdrawFee,
  maxPlayersCount,
} = deployConfigs;

const daiDecimals = ethers.BigNumber.from("1000000000000000000");
const segmentPayment = daiDecimals.mul(ethers.BigNumber.from(segmentPaymentInt)); // equivalent to 10 Inbound Token

describe("Pool Aave/Moola Fork Tests", () => {
  if (process.env.NETWORK === "local-celo-mobius") {
    return;
  }

  if (process.env.FORKING == "false") {
    return;
  }

  before(async function () {
    accounts = await ethers.getSigners();
    let lendingPoolAddressProviderInstance: any, dataProviderInstance: any, incentiveControllerInstance: any;

    impersonateAddress = "0x2DdA8dc2f67f1eB94b250CaEFAc9De16f70c5A51";
    // Impersonate as another address
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [impersonateAddress],
    });

    impersonatedSigner = await ethers.getSigner(impersonateAddress);

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

    wmaticInstance = new ethers.Contract(providers["aave"]["polygon"].wmatic, wmatic.abi, impersonatedSigner);
    daiInstance = new ethers.Contract(providers["aave"]["polygon"]["dai"].address, wmatic.abi, impersonatedSigner);

    strategy = await ethers.getContractFactory("AaveStrategy", accounts[0]);
    strategy = await strategy.deploy(
      lendingPoolAddressProviderInstance.address,
      dataProviderInstance.address,
      incentiveControllerInstance.address,
      wmaticInstance.address,
    );

    pool = await ethers.getContractFactory("Pool", accounts[0]);
    pool = await pool.deploy(
      daiInstance.address,
      deployConfigs.depositCount.toString(),
      deployConfigs.segmentLength.toString(),
      deployConfigs.waitingRoundSegmentLength.toString(),
      segmentPayment.toString(),
      deployConfigs.earlyWithdrawFee.toString(),
      deployConfigs.adminFee.toString(),
      deployConfigs.maxPlayersCount.toString(),
      deployConfigs.flexibleSegmentPayment,
      providers["aave"]["polygon"].incentiveToken,
      strategy.address,
    );

    await strategy.connect(accounts[0]).transferOwnership(pool.address);
    const impersonateAccountBalance = await daiInstance.balanceOf(impersonatedSigner.address);
    console.log(`Impersonate Account  Balance`, impersonateAccountBalance.toString());

    // send out tokens to the players
    for (let i = 0; i < 5; i++) {
      await daiInstance.connect(impersonatedSigner).transfer(accounts[i].address, ethers.utils.parseEther("3"));
    }
  });

  it("checks if users have their balance increased", async () => {
    for (let i = 0; i < 5; i++) {
      const playerBalance = await daiInstance.balanceOf(accounts[i].address);
      console.log(`Player ${i} Balance`, playerBalance.toString());
      expect(playerBalance.eq(ethers.utils.parseEther("200")));
    }
  });

  // it("checks if the contract's variables were properly initialized", async () => {
  //   const inboundCurrencyResult = await pool.inboundToken();
  //   const lastSegmentResult = await pool.lastSegment();
  //   const segmentLengthResult = await pool.segmentLength();
  //   const flexibleDepositFlag = await pool.flexibleSegmentPayment();
  //   const segmentPaymentResult = await pool.segmentPayment();
  //   const waitingSegmentLength = await pool.waitingRoundSegmentLength();
  //   const expectedSegment = ethers.BigNumber.from(0);
  //   const currentSegmentResult = await pool.getCurrentSegment();
  //   const maxPlayersCountResult = await pool.maxPlayersCount();

  //   expect(segmentPaymentResult.eq(segmentPayment));
  //   expect(!flexibleDepositFlag);
  //   expect(lastSegmentResult.eq(depositCount));
  //   expect(waitingSegmentLength.eq(waitingRoundSegmentLength));
  //   expect(currentSegmentResult.eq(expectedSegment));
  //   expect(maxPlayersCountResult.eq(maxPlayersCount));
  //   expect(segmentLengthResult.eq(segmentLength));
  //   expect(inboundCurrencyResult == daiInstance.address);
  // });

  it("players are able to approve inbound token and join the pool", async () => {
    for (let i = 0; i < 5; i++) {
      await daiInstance.connect(accounts[i]).approve(pool.address, ethers.utils.parseEther("200"));
      await pool.connect(accounts[i]).joinGame(0, 0);
      if (i == 0) {
        await pool.connect(accounts[i]).earlyWithdraw(0);
        await expect(pool.connect(accounts[i]).joinGame(0, 0))
          .to.emit(pool, "JoinedGame")
          .withArgs(accounts[i].address, ethers.BigNumber.from(segmentPayment));
      }
    }
  });

  it("players are able to make deposits and 1 player early withdraws", async () => {
    for (let i = 1; i < depositCount; i++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      if (i == 1) {
        await pool.connect(accounts[0]).makeDeposit(0, 0);
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
        await expect(pool.connect(accounts[j]).makeDeposit(0, 0))
          .to.emit(pool, "Deposit")
          .withArgs(accounts[j].address, currentSegment, ethers.BigNumber.from(segmentPayment));
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

  it("funds are redeemed from the pool", async () => {
    await pool.redeemFromExternalPool(0);
  });

  it("players are able to withdraw from the pool", async () => {
    for (let j = 1; j < 5; j++) {
      await pool.connect(accounts[j]).withdraw(0);
    }
  });
});
