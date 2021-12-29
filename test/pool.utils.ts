const { ethers } = require("hardhat");
import * as chai from "chai";
import { assert } from "chai";
import { solidity } from "ethereum-waffle";
import {
  LendingPoolAddressesProviderMock__factory,
  Pool__factory,
  AaveStrategy__factory,
  MintableERC20__factory,
  MockWMatic__factory,
  MintableERC20,
  MockMobiusMinter__factory,
  IncentiveControllerMock__factory,
  MockCurvePool__factory,
  MockMobiusPool__factory,
  MockMobiusGauge__factory,
  MobiusStrategy__factory,
  MockCurveGauge__factory,
  CurveStrategy__factory,
  Pool,
} from "../src/types";

chai.use(solidity);
const { expect } = chai;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const deployPool = async (
  depositCount: number,
  segmentLength: number,
  segmentPayment: any,
  earlyWithdrawFee: number,
  adminFee: number,
  playerCount: any,
  isInboundToken: boolean,
  isIncentiveToken: boolean,
  isInvestmentStrategy: boolean,
  isVariableAmount: boolean,
  isTransactionalToken: boolean,
  isSameAsRewardToken: boolean,
  strategyType: string,
) => {
  const [deployer, , player1, player2] = await ethers.getSigners();
  const lendingPoolAddressProvider = new LendingPoolAddressesProviderMock__factory(deployer);
  let inboundToken: any = ZERO_ADDRESS;

  if (isInboundToken) {
    const token = new MintableERC20__factory(deployer);
    inboundToken = await token.deploy("MINT", "MINT");
    await mintTokens(inboundToken, player1.address);
    await mintTokens(inboundToken, player2.address);
  }

  let incentiveToken: any = ZERO_ADDRESS;
  if (isIncentiveToken) {
    const token = new MintableERC20__factory(deployer);
    incentiveToken = await token.deploy("INCENTIVE", "INCENTIVE");
  }
  let lendingPool: any = ZERO_ADDRESS;
  let incentiveController: any = ZERO_ADDRESS;
  let rewardToken: any = ZERO_ADDRESS;
  let strategy: any = ZERO_ADDRESS;
  let curve: any = ZERO_ADDRESS;
  let celo: any = ZERO_ADDRESS;
  let minter: any = ZERO_ADDRESS;
  let curveGauge: any = ZERO_ADDRESS;
  let curvePool: any = ZERO_ADDRESS;
  let mobiGauge: any = ZERO_ADDRESS;
  let mobiPool: any = ZERO_ADDRESS;

  if (strategyType === "aave") {
    lendingPool = await lendingPoolAddressProvider.deploy("TOKEN_NAME", "TOKEN_SYMBOL");
    await lendingPool.setUnderlyingAssetAddress(isInboundToken ? inboundToken.address : inboundToken);

    const rewardTokenDeployer = new MockWMatic__factory(deployer);
    rewardToken = await rewardTokenDeployer.deploy();

    const incentiveControllerDeployer = new IncentiveControllerMock__factory(deployer);
    incentiveController = await incentiveControllerDeployer.deploy(rewardToken.address);

    if (isInvestmentStrategy) {
      const aaveStrategyDeployer = new AaveStrategy__factory(deployer);
      strategy = await aaveStrategyDeployer.deploy(
        lendingPool.address,
        lendingPool.address,
        lendingPool.address,
        incentiveController.address,
        rewardToken.address,
      );
      await rewardToken.deposit({ value: ethers.utils.parseEther("25") });
      await rewardToken.transfer(incentiveController.address, ethers.utils.parseEther("25"));
    }
  } else if (strategyType === "curve") {
    const mockCurveTokenDeployer = new MintableERC20__factory(deployer);
    curve = await mockCurveTokenDeployer.deploy("CURVE", "CURVE");
    const rewardTokenDeployer = new MintableERC20__factory(deployer);
    rewardToken = await rewardTokenDeployer.deploy("TOKEN_NAME", "TOKEN_SYMBOL");
    const curvePoolDeployer = new MockCurvePool__factory(deployer);
    curvePool = await curvePoolDeployer.deploy("LP", "LP", inboundToken.address);
    const curveGaugeDeployer = new MockCurveGauge__factory(deployer);
    curveGauge = await curveGaugeDeployer.deploy(
      "LP-GAUGE",
      "LP-GAUGE",
      curve.address,
      curvePool.address,
      rewardToken.address,
    );
    await rewardToken.mint(curveGauge.address, ethers.utils.parseEther("100000"));
    await curve.mint(curveGauge.address, ethers.utils.parseEther("100000"));

    if (isInvestmentStrategy) {
      const curveStrategyDeployer = new CurveStrategy__factory(deployer);
      strategy = await curveStrategyDeployer.deploy(
        curvePool.address,
        0,
        0,
        curveGauge.address,
        rewardToken.address,
        curve.address,
      );
    }
  } else if (strategyType === "mobius") {
    const mockCeloTokenDeployer = new MintableERC20__factory(deployer);
    celo = await mockCeloTokenDeployer.deploy("CELO", "CELO");
    const mockMinterTokenDeployer = new MockMobiusMinter__factory(deployer);
    minter = await mockMinterTokenDeployer.deploy("MOBI", "MOBI");
    const mobiPoolDeployer = new MockMobiusPool__factory(deployer);
    mobiPool = await mobiPoolDeployer.deploy("LP", "LP", inboundToken.address);
    const mobiGaugeDeployer = new MockMobiusGauge__factory(deployer);
    mobiGauge = await mobiGaugeDeployer.deploy("LP-GAUGE", "LP-GAUGE", celo.address, mobiPool.address);
    await celo.mint(mobiGauge.address, ethers.utils.parseEther("100000"));

    if (isInvestmentStrategy) {
      const mobiStrategyDeployer = new MobiusStrategy__factory(deployer);
      strategy = await mobiStrategyDeployer.deploy(
        mobiPool.address,
        mobiGauge.address,
        minter.address,
        minter.address,
        celo.address,
      );
    }
  }

  const goodGhostingV2Deployer = new Pool__factory(deployer);

  await expect(
    goodGhostingV2Deployer.deploy(
      isInboundToken ? inboundToken.address : inboundToken,
      depositCount,
      segmentLength,
      segmentLength / 2,
      segmentPayment,
      earlyWithdrawFee,
      adminFee,
      playerCount,
      isVariableAmount,
      isIncentiveToken ? incentiveToken.address : incentiveToken,
      isInvestmentStrategy ? strategy.address : strategy,
      isTransactionalToken,
    ),
  ).to.be.revertedWith("_waitingRoundSegmentLength must be more than _segmentLength");

  if (isSameAsRewardToken) {
    inboundToken = rewardToken;
  }
  const goodGhosting = await goodGhostingV2Deployer.deploy(
    isInboundToken ? inboundToken.address : inboundToken,
    depositCount,
    segmentLength,
    segmentLength * 2,
    segmentPayment,
    earlyWithdrawFee,
    adminFee,
    playerCount,
    isVariableAmount,
    isIncentiveToken ? incentiveToken.address : incentiveToken,
    isInvestmentStrategy ? strategy.address : strategy,
    isTransactionalToken,
  );

  if (isInvestmentStrategy) {
    await strategy.transferOwnership(goodGhosting.address);
  }
  if (isIncentiveToken) {
    await mintTokens(incentiveToken, goodGhosting.address);
  }

  return {
    inboundToken,
    lendingPool,
    strategy,
    goodGhosting,
    incentiveToken,
    rewardToken,
    curvePool,
    curveGauge,
    curve,
    mobiPool,
    mobiGauge,
    minter,
  };
};

export const mintTokens = async (inboundToken: MintableERC20, player: string) => {
  await inboundToken.mint(player, ethers.utils.parseEther("100000"));
  const balance = await inboundToken.balanceOf(player);
  assert(balance.gt(ethers.BigNumber.from("0")));
};

export const approveToken = async (
  inboundToken: MintableERC20,
  player: any,
  poolAddress: string,
  segmentPayment: string,
) => {
  await inboundToken
    .connect(player)
    .approve(poolAddress, ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString());
  const allowance = await inboundToken.allowance(player.address, poolAddress);
  assert(
    allowance.eq(
      ethers.BigNumber.from(ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("2")).toString()),
    ),
  );
};

export const joinGamePaySegmentsAndComplete = async (
  inboundToken: MintableERC20,
  player: any,
  segmentPayment: string,
  depositCount: number,
  segmentLength: number,
  goodGhosting: Pool,
  depositAmount: string,
) => {
  await approveToken(inboundToken, player, goodGhosting.address, segmentPayment);
  await goodGhosting.connect(player).joinGame(0, depositAmount);

  // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
  for (let index = 1; index < depositCount; index++) {
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    await approveToken(inboundToken, player, goodGhosting.address, segmentPayment);
    await goodGhosting.connect(player).makeDeposit(0, depositAmount);
  }
  // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
  // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
  await ethers.provider.send("evm_increaseTime", [segmentLength]);
  await ethers.provider.send("evm_mine", []);
  const waitingRoundLength = await goodGhosting.waitingRoundSegmentLength();
  await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
  await ethers.provider.send("evm_mine", []);
  const gameStatus = await goodGhosting.isGameCompleted();
  assert(gameStatus);
};

export const joinGamePaySegmentsAndNotComplete = async (
  inboundToken: MintableERC20,
  player: any,
  segmentPayment: string,
  depositCount: number,
  segmentLength: number,
  goodGhosting: Pool,
  depositAmount: string,
) => {
  await approveToken(inboundToken, player, goodGhosting.address, segmentPayment);
  await goodGhosting.connect(player).joinGame(0, depositAmount);
  // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
  for (let index = 1; index < depositCount; index++) {
    await ethers.provider.send("evm_increaseTime", [segmentLength]);
    await ethers.provider.send("evm_mine", []);
    if (index < depositCount - 1) {
      await approveToken(inboundToken, player, goodGhosting.address, segmentPayment);
      await goodGhosting.connect(player).makeDeposit(0, depositAmount);
    }
  }
  // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
  // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
  await ethers.provider.send("evm_increaseTime", [segmentLength]);
  await ethers.provider.send("evm_mine", []);
  const waitingRoundLength = await goodGhosting.waitingRoundSegmentLength();
  await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
  await ethers.provider.send("evm_mine", []);
  const gameStatus = await goodGhosting.isGameCompleted();
  assert(gameStatus);
};

export const advanceToEndOfGame = async (goodGhosting: Pool, segmentLength: number, depositCount: number) => {
  // We need to to account for the first deposit window.
  // i.e., if game has 5 segments, we need to add + 1, because while current segment was 0,
  // it was just the first deposit window (a.k.a., joining period).
  await ethers.provider.send("evm_increaseTime", [segmentLength * depositCount]);
  await ethers.provider.send("evm_mine", []);
  const waitingRoundLength = await goodGhosting.waitingRoundSegmentLength();
  await ethers.provider.send("evm_increaseTime", [parseInt(waitingRoundLength.toString())]);
  await ethers.provider.send("evm_mine", []);
};

export const joinGame = async (
  goodGhosting: Pool,
  inboundToken: MintableERC20,
  player: any,
  amount: string,
  depositAmount: string,
) => {
  const isTransactionalToken = await goodGhosting.isTransactionalToken();
  if (!isTransactionalToken) {
    await approveToken(inboundToken, player, goodGhosting.address, amount);
    await goodGhosting.connect(player).joinGame(0, depositAmount);
  } else {
    await goodGhosting.connect(player).joinGame(0, depositAmount, { value: depositAmount });
  }
};

export const unableToJoinGame = async (
  goodGhosting: Pool,
  inboundToken: MintableERC20,
  player: any,
  amount: string,
  depositAmount: string,
  revertReason: string,
) => {
  const isTransactionalToken = await goodGhosting.isTransactionalToken();
  if (!isTransactionalToken) {
    await approveToken(inboundToken, player, goodGhosting.address, amount);
    await expect(goodGhosting.connect(player).joinGame(0, depositAmount)).to.be.revertedWith(revertReason);
  } else {
    await expect(goodGhosting.connect(player).joinGame(0, depositAmount, { value: depositAmount })).to.be.revertedWith(
      revertReason,
    );
  }
};

export const makeDeposit = async (
  goodGhosting: Pool,
  inboundToken: MintableERC20,
  player: any,
  amount: string,
  depositAmount: string,
) => {
  const isTransactionalToken = await goodGhosting.isTransactionalToken();
  if (!isTransactionalToken) {
    await approveToken(inboundToken, player, goodGhosting.address, amount);
    await goodGhosting.connect(player).makeDeposit(0, depositAmount);
  } else {
    await goodGhosting.connect(player).makeDeposit(0, depositAmount, { value: depositAmount });
  }
};

export const shouldNotBeAbleToDeposit = async (
  goodGhosting: Pool,
  inboundToken: MintableERC20,
  player: any,
  amount: string,
  depositAmount: string,
  revertReason: string,
) => {
  const isTransactionalToken = await goodGhosting.isTransactionalToken();
  if (!isTransactionalToken) {
    await approveToken(inboundToken, player, goodGhosting.address, amount);
    await expect(goodGhosting.connect(player).makeDeposit(0, depositAmount)).to.be.revertedWith(revertReason);
  } else {
    await expect(
      goodGhosting.connect(player).makeDeposit(0, depositAmount, { value: depositAmount }),
    ).to.be.revertedWith(revertReason);
  }
};

export const redeem = async (
  goodGhosting: Pool,
  inboundToken: MintableERC20,
  player: any,
  amount: string,
  depositCount: number,
  segmentLength: number,
  depositAmount: string,
) => {
  await joinGamePaySegmentsAndComplete(
    inboundToken,
    player,
    amount,
    depositCount,
    segmentLength,
    goodGhosting,
    depositAmount,
  );
  await goodGhosting.connect(player).redeemFromExternalPool(0);
};
