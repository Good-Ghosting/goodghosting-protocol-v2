import * as chai from "chai";
import { solidity } from "ethereum-waffle";
const { network, ethers } = require("hardhat");
const { providers, deployConfigs } = require("../../deploy/deploy.config");
const aavepoolABI = require("../../abi-external/curve-aave-pool-abi.json");
const atricryptopoolABI = require("../../abi-external/curve-atricrypto-pool-abi.json");
const curveGauge = require("../../artifacts/contracts/curve/ICurveGauge.sol/ICurveGauge.json");
import * as wmatic from "../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json";

chai.use(solidity);
const { expect } = chai;

// dai holder
let impersonatedSigner: any;
let daiInstance: any, wmaticInstance, curveInstance;
let curvePoolInstance: any, curveGaugeInstance: any;

let accounts: any[];
let pool: any, strategy: any;
const { depositCount, segmentLength, segmentPayment: segmentPaymentInt, earlyWithdrawFee } = deployConfigs;

const daiDecimals = ethers.BigNumber.from("1000000000000000000");
const segmentPayment = daiDecimals.mul(ethers.BigNumber.from(segmentPaymentInt)); // equivalent to 10 Inbound Token

describe("Curve Pool Fork Tests", () => {
  if (process.env.NETWORK === "local-celo-mobius" || process.env.NETWORK === "local-moola") {
    return;
  }

  if (process.env.FORKING == "false") {
    return;
  }

  before(async function () {
    accounts = await ethers.getSigners();

    const impersonateAddress = process.env.DAI_ACCOUNT_HOLDER_FORKED_NETWORK;
    // Impersonate as another address
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [impersonateAddress],
    });

    impersonatedSigner = await ethers.getSigner(impersonateAddress);
    if (providers["aave"]["polygon-curve"].poolType === 0) {
      curvePoolInstance = new ethers.Contract(providers["aave"]["polygon-curve"].pool, aavepoolABI, impersonatedSigner);
    } else {
      curvePoolInstance = new ethers.Contract(
        providers["aave"]["polygon-curve"].pool,
        atricryptopoolABI,
        impersonatedSigner,
      );
    }
    curveGaugeInstance = new ethers.Contract(
      providers["aave"]["polygon-curve"].gauge,
      curveGauge.abi,
      impersonatedSigner,
    );

    wmaticInstance = new ethers.Contract(providers["aave"]["polygon"].wmatic, wmatic.abi, impersonatedSigner);
    curveInstance = new ethers.Contract(providers["aave"]["polygon-curve"].curve, wmatic.abi, impersonatedSigner);
    daiInstance = new ethers.Contract(providers["aave"]["polygon"]["dai"].address, wmatic.abi, impersonatedSigner);

    strategy = await ethers.getContractFactory("CurveStrategy", accounts[0]);
    strategy = await strategy.deploy(
      curvePoolInstance.address,
      providers["aave"]["polygon-curve"].tokenIndex,
      providers["aave"]["polygon-curve"].poolType,
      curveGaugeInstance.address,
      wmaticInstance.address,
      curveInstance.address,
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

  it("players are able to approve inbound token and join the pool", async () => {
    const userSlippageOptions = [1, 3, 4, 2, 1];

    for (let i = 0; i < 5; i++) {
      let slippageFromContract;
      let minAmountWithFees: any = 0;
      const userProvidedMinAmount = segmentPayment.sub(
        segmentPayment.mul(ethers.BigNumber.from(userSlippageOptions[i].toString())).div(ethers.BigNumber.from(100)),
      );
      if (providers["aave"]["polygon-curve"].poolType === 0) {
        slippageFromContract = await curvePoolInstance.calc_token_amount([segmentPayment.toString(), 0, 0], true);
      } else {
        slippageFromContract = await curvePoolInstance.calc_token_amount([segmentPayment.toString(), 0, 0, 0, 0], true);
      }

      minAmountWithFees =
        parseInt(userProvidedMinAmount.toString()) > parseInt(slippageFromContract.toString())
          ? ethers.BigNumber.from(slippageFromContract).sub(
              ethers.BigNumber.from(slippageFromContract)
                .mul(ethers.BigNumber.from("10"))
                .div(ethers.BigNumber.from("10000")),
            )
          : userProvidedMinAmount.sub(
              userProvidedMinAmount.mul(ethers.BigNumber.from("10")).div(ethers.BigNumber.from("10000")),
            );

      await daiInstance.connect(accounts[i]).approve(pool.address, ethers.utils.parseEther("200"));

      await pool.connect(accounts[i]).joinGame(minAmountWithFees.toString(), 0);

      if (i == 0) {
        const withdrawAmount = segmentPayment.sub(
          segmentPayment.mul(ethers.BigNumber.from(earlyWithdrawFee)).div(ethers.BigNumber.from(100)),
        );
        let lpTokenAmount;

        if (providers["aave"]["polygon-curve"].poolType === 0) {
          lpTokenAmount = await curvePoolInstance.calc_token_amount([withdrawAmount.toString(), 0, 0], true);
        } else {
          lpTokenAmount = await curvePoolInstance.calc_token_amount([withdrawAmount.toString(), 0, 0, 0, 0], true);
        }

        const gaugeTokenBalance = await curveGaugeInstance.balanceOf(strategy.address);

        if (parseInt(gaugeTokenBalance.toString()) < parseInt(lpTokenAmount.toString())) {
          lpTokenAmount = gaugeTokenBalance;
        }

        let minAmount = await curvePoolInstance.calc_withdraw_one_coin(
          lpTokenAmount.toString(),
          providers["aave"]["polygon-curve"].tokenIndex,
        );

        minAmount = ethers.BigNumber.from(minAmount).sub(
          ethers.BigNumber.from(minAmount).div(ethers.BigNumber.from("1000")),
        );

        const userProvidedMinAmount = ethers.BigNumber.from(lpTokenAmount).sub(
          ethers.BigNumber.from(lpTokenAmount).mul(ethers.BigNumber.from("6")).div(ethers.BigNumber.from(1000)),
        );

        if (parseInt(userProvidedMinAmount.toString()) < parseInt(minAmount.toString())) {
          minAmount = userProvidedMinAmount;
        }

        await pool.connect(accounts[i]).earlyWithdraw(minAmount.toString());
        await expect(pool.connect(accounts[i]).joinGame(minAmountWithFees.toString(), 0))
          .to.emit(pool, "JoinedGame")
          .withArgs(accounts[i].address, ethers.BigNumber.from(segmentPayment));
      }
    }
  });

  it("players are able to make deposits and 1 player early withdraws", async () => {
    const userSlippageOptions = [3, 5, 1, 2, 4];
    let slippageFromContract;
    let minAmountWithFees: any = 0;
    for (let i = 1; i < depositCount; i++) {
      await ethers.provider.send("evm_increaseTime", [segmentLength]);
      await ethers.provider.send("evm_mine", []);
      if (i == 1) {
        let userProvidedMinAmount = segmentPayment.sub(
          segmentPayment.mul(ethers.BigNumber.from(userSlippageOptions[i].toString())).div(ethers.BigNumber.from(100)),
        );
        slippageFromContract = await curvePoolInstance.calc_token_amount([segmentPayment.toString(), 0, 0], true);

        minAmountWithFees =
          parseInt(userProvidedMinAmount.toString()) > parseInt(slippageFromContract.toString())
            ? ethers.BigNumber.from(slippageFromContract).sub(
                ethers.BigNumber.from(slippageFromContract)
                  .mul(ethers.BigNumber.from("10"))
                  .div(ethers.BigNumber.from("10000")),
              )
            : userProvidedMinAmount.sub(
                userProvidedMinAmount.mul(ethers.BigNumber.from("10")).div(ethers.BigNumber.from("10000")),
              );
        await pool.connect(accounts[0]).makeDeposit(minAmountWithFees.toString(), 0);
        const playerInfo = await pool.players(accounts[0].address);
        let totalPrincipal = await pool.totalGamePrincipal();
        totalPrincipal = totalPrincipal.sub(playerInfo.amountPaid);
        const feeAmount = ethers.BigNumber.from(playerInfo.amountPaid)
          .mul(ethers.BigNumber.from(earlyWithdrawFee))
          .div(ethers.BigNumber.from(100)); // fee is set as an integer, so needs to be converted to a percentage

        const withdrawAmount = segmentPayment.sub(
          segmentPayment.mul(ethers.BigNumber.from(earlyWithdrawFee)).div(ethers.BigNumber.from(100)),
        );
        let lpTokenAmount;
        lpTokenAmount = await curvePoolInstance.calc_token_amount([withdrawAmount.toString(), 0, 0], true);

        const gaugeTokenBalance = await curveGaugeInstance.balanceOf(strategy.address);

        if (parseInt(gaugeTokenBalance.toString()) < parseInt(lpTokenAmount.toString())) {
          lpTokenAmount = gaugeTokenBalance;
        }

        let minAmount = await curvePoolInstance.calc_withdraw_one_coin(
          lpTokenAmount.toString(),
          providers["aave"]["polygon-curve"].tokenIndex,
        );
        minAmount = ethers.BigNumber.from(minAmount).sub(
          ethers.BigNumber.from(minAmount).div(ethers.BigNumber.from("1000")),
        );

        userProvidedMinAmount = ethers.BigNumber.from(lpTokenAmount).sub(
          ethers.BigNumber.from(lpTokenAmount).mul(ethers.BigNumber.from("6")).div(ethers.BigNumber.from(1000)),
        );

        if (parseInt(userProvidedMinAmount.toString()) < parseInt(minAmount.toString())) {
          minAmount = userProvidedMinAmount;
        }
        await expect(pool.connect(accounts[0]).earlyWithdraw(minAmount.toString()))
          .to.emit(pool, "EarlyWithdrawal")
          .withArgs(accounts[0].address, playerInfo.amountPaid.sub(feeAmount), totalPrincipal);
      }
      const currentSegment = await pool.getCurrentSegment();

      for (let j = 1; j < 5; j++) {
        let userProvidedMinAmount = segmentPayment.sub(
          segmentPayment.mul(ethers.BigNumber.from(userSlippageOptions[i].toString())).div(ethers.BigNumber.from(100)),
        );
        slippageFromContract = await curvePoolInstance.calc_token_amount([segmentPayment.toString(), 0, 0], true);

        minAmountWithFees =
          parseInt(userProvidedMinAmount.toString()) > parseInt(slippageFromContract.toString())
            ? ethers.BigNumber.from(slippageFromContract).sub(
                ethers.BigNumber.from(slippageFromContract)
                  .mul(ethers.BigNumber.from("10"))
                  .div(ethers.BigNumber.from("10000")),
              )
            : userProvidedMinAmount.sub(
                userProvidedMinAmount.mul(ethers.BigNumber.from("10")).div(ethers.BigNumber.from("10000")),
              );
        await expect(pool.connect(accounts[j]).makeDeposit(minAmountWithFees.toString(), 0))
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
    const userSlippage = 1;
    let minAmount;
    const gaugeTokenBalance = await curveGaugeInstance.balanceOf(strategy.address);

    minAmount = await curvePoolInstance.calc_withdraw_one_coin(
      gaugeTokenBalance.toString(),
      providers["aave"]["polygon-curve"].tokenIndex,
    );

    const userProvidedMinAmount = ethers.BigNumber.from(gaugeTokenBalance).sub(
      ethers.BigNumber.from(gaugeTokenBalance).mul(ethers.BigNumber.from(userSlippage)).div(ethers.BigNumber.from(100)),
    );

    if (parseInt(userProvidedMinAmount.toString()) < parseInt(minAmount.toString())) {
      minAmount = userProvidedMinAmount;
    }

    await pool.redeemFromExternalPool(minAmount.toString());
  });

  it("players are able to withdraw from the pool", async () => {
    for (let j = 1; j < 5; j++) {
      await pool.connect(accounts[j]).withdraw(0);
    }
  });
});
