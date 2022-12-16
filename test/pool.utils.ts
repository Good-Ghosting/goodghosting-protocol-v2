const { ethers } = require("hardhat");
import * as chai from "chai";
import { assert } from "chai";
import { solidity } from "ethereum-waffle";
import {
  LendingPoolAddressesProviderMock__factory,
  Pool__factory,
  WhitelistedPool__factory,
  AaveStrategy__factory,
  AaveStrategyV3__factory,
  MintableERC20__factory,
  MockWMatic__factory,
  MintableERC20,
  MockMobiusMinter__factory,
  IncentiveControllerMock__factory,
  RewardsControllerMock__factory,
  MockCurvePool__factory,
  MockCurveStrategy__factory,
  MockCurveGaugeMinter__factory,
  MockCurveGaugeMinter,
  MockMobiusStrategy__factory,
  MockMobiusPool__factory,
  MockMobiusGauge__factory,
  MobiusStrategy__factory,
  NoExternalStrategy__factory,
  MockCurveGauge__factory,
  CurveStrategy__factory,
  Pool,
} from "../src/types";
import * as wmatic from "../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json";

chai.use(solidity);
const { expect } = chai;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const merkleRoot: any = "0x2dac1451902c8c1cb264301adfc0e0a2527a01cb92a344d68a16521d7bca56d8";

export const mintTokens = async (inboundToken: MintableERC20, player: string) => {
  await inboundToken.mint(player, ethers.utils.parseEther("100000"));
  const balance = await inboundToken.balanceOf(player);
  assert(balance.gt(ethers.BigNumber.from("0")));
};

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
  curvePoolType: number,
  strategyType: string,
  maxFlexibleSegmentAmount: number,
  isWhitelisted: boolean,
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
  let rewardController: any = ZERO_ADDRESS;
  let rewardToken: any = ZERO_ADDRESS;
  let strategy: any = ZERO_ADDRESS;
  let curve: any = ZERO_ADDRESS;
  let mobi: any = ZERO_ADDRESS;
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
      await expect(
        aaveStrategyDeployer.deploy(
          ZERO_ADDRESS,
          lendingPool.address,
          lendingPool.address,
          incentiveController.address,
          rewardToken.address,
          isInboundToken ? inboundToken.address : inboundToken,
        ),
      ).to.be.revertedWith("INVALID_LENDING_POOL_ADDRESS_PROVIDER()");

      await expect(
        aaveStrategyDeployer.deploy(
          lendingPool.address,
          lendingPool.address,
          ZERO_ADDRESS,
          incentiveController.address,
          rewardToken.address,
          isInboundToken ? inboundToken.address : inboundToken,
        ),
      ).to.be.revertedWith("INVALID_DATA_PROVIDER()");

      strategy = await aaveStrategyDeployer.deploy(
        lendingPool.address,
        lendingPool.address,
        lendingPool.address,
        incentiveController.address,
        rewardToken.address,
        isInboundToken ? inboundToken.address : inboundToken,
      );

      await expect(
        deployer.sendTransaction({ to: strategy.address, value: ethers.utils.parseEther("1.0") }),
      ).to.be.revertedWith("INVALID_TRANSACTIONAL_TOKEN_SENDER()");

      await rewardToken.deposit({ value: ethers.utils.parseEther("8") });
      // rewards
      if (isSameAsRewardToken) {
        await rewardToken.transfer(strategy.address, ethers.utils.parseEther("8"));
      } else {
        await rewardToken.transfer(incentiveController.address, ethers.utils.parseEther("8"));
      }

      if (isInboundToken) {
        const goodGhostingV2Deployer = new Pool__factory(deployer);
        await expect(
          goodGhostingV2Deployer.deploy(
            rewardToken.address,
            ethers.utils.parseEther(maxFlexibleSegmentAmount.toString()),
            depositCount,
            segmentLength,
            segmentLength * 2,
            segmentPayment,
            earlyWithdrawFee,
            adminFee,
            playerCount,
            isVariableAmount,
            isInvestmentStrategy ? strategy.address : strategy,
            isTransactionalToken,
          ),
        ).to.be.revertedWith("INVALID_INBOUND_TOKEN()");
      }
    }
  } else if (strategyType === "aaveV3") {
    lendingPool = await lendingPoolAddressProvider.deploy("TOKEN_NAME", "TOKEN_SYMBOL");

    await lendingPool.setUnderlyingAssetAddress(isInboundToken ? inboundToken.address : inboundToken);

    const rewardTokenDeployer = new MockWMatic__factory(deployer);
    rewardToken = await rewardTokenDeployer.deploy();

    const rewardControllerDeployer = new RewardsControllerMock__factory(deployer);
    rewardController = await rewardControllerDeployer.deploy(rewardToken.address);

    if (isInvestmentStrategy) {
      const aaveStrategyDeployer = new AaveStrategyV3__factory(deployer);

      await expect(
        aaveStrategyDeployer.deploy(
          ZERO_ADDRESS,
          lendingPool.address,
          lendingPool.address,
          rewardController.address,
          rewardToken.address,
          isInboundToken ? inboundToken.address : inboundToken,
        ),
      ).to.be.revertedWith("INVALID_LENDING_POOL_ADDRESS_PROVIDER()");

      await expect(
        aaveStrategyDeployer.deploy(
          lendingPool.address,
          lendingPool.address,
          ZERO_ADDRESS,
          rewardController.address,
          rewardToken.address,
          isInboundToken ? inboundToken.address : inboundToken,
        ),
      ).to.be.revertedWith("INVALID_DATA_PROVIDER()");

      strategy = await aaveStrategyDeployer.deploy(
        lendingPool.address,
        lendingPool.address,
        lendingPool.address,
        rewardController.address,
        rewardToken.address,
        isInboundToken ? inboundToken.address : inboundToken,
      );

      await expect(
        deployer.sendTransaction({ to: strategy.address, value: ethers.utils.parseEther("1.0") }),
      ).to.be.revertedWith("INVALID_TRANSACTIONAL_TOKEN_SENDER()");

      await rewardToken.deposit({ value: ethers.utils.parseEther("8") });

      // rewards
      if (isSameAsRewardToken) {
        await rewardToken.transfer(strategy.address, ethers.utils.parseEther("8"));
      } else {
        await rewardToken.transfer(rewardController.address, ethers.utils.parseEther("8"));
      }
      if (isInboundToken) {
        const goodGhostingV2Deployer = new Pool__factory(deployer);
        await expect(
          goodGhostingV2Deployer.deploy(
            rewardToken.address,
            ethers.utils.parseEther(maxFlexibleSegmentAmount.toString()),
            depositCount,
            segmentLength,
            segmentLength * 2,
            segmentPayment,
            earlyWithdrawFee,
            adminFee,
            playerCount,
            isVariableAmount,
            isInvestmentStrategy ? strategy.address : strategy,
            isTransactionalToken,
          ),
        ).to.be.revertedWith("INVALID_INBOUND_TOKEN()");
      }
    }
  } else if (strategyType === "curve") {
    const mockCurveMinterDeployer = new MockCurveGaugeMinter__factory(deployer);
    const gaugeminter = await mockCurveMinterDeployer.deploy();
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
    await curvePool.setGauge(curveGauge.address);

    await rewardToken.mint(curveGauge.address, ethers.utils.parseEther("100000"));
    await curve.mint(curveGauge.address, ethers.utils.parseEther("100000"));
    const rewardTokens = new Array();
    rewardTokens[0] = curve.address;

    if (isInvestmentStrategy) {
      const curveStrategyDeployer = new CurveStrategy__factory(deployer);
      await expect(
        curveStrategyDeployer.deploy(
          curvePool.address,
          -1,
          curvePoolType,
          curveGauge.address,
          ZERO_ADDRESS,
          rewardTokens,
        ),
      ).to.be.revertedWith("INVALID_INBOUND_TOKEN_INDEX()");

      await expect(
        curveStrategyDeployer.deploy(
          curvePool.address,
          6,
          curvePoolType,
          curveGauge.address,
          gaugeminter.address,
          rewardTokens,
        ),
      ).to.be.revertedWith("INVALID_INBOUND_TOKEN_INDEX()");

      await expect(
        curveStrategyDeployer.deploy(
          ZERO_ADDRESS,
          0,
          curvePoolType,
          curveGauge.address,
          gaugeminter.address,
          rewardTokens,
        ),
      ).to.be.revertedWith("INVALID_POOL()");

      await expect(
        curveStrategyDeployer.deploy(curvePool.address, 0, curvePoolType, curveGauge.address, gaugeminter.address, [
          ZERO_ADDRESS,
        ]),
      ).to.be.revertedWith("INVALID_REWARD_TOKEN()");

      strategy = await curveStrategyDeployer.deploy(
        curvePool.address,
        0,
        curvePoolType,
        curveGauge.address,
        ZERO_ADDRESS,
        rewardTokens,
      );
      if (isInboundToken) {
        await expect(strategy.invest(inboundToken.address, 0, { value: (1e18).toString() })).to.be.revertedWith(
          "CANNOT_ACCEPT_TRANSACTIONAL_TOKEN()",
        );
      }
    }
    rewardToken = curve;
  } else if (strategyType === "mobius") {
    const mockMobiTokenDeployer = new MintableERC20__factory(deployer);
    mobi = await mockMobiTokenDeployer.deploy("MOBI", "MOBI");
    const mockMinterTokenDeployer = new MockMobiusMinter__factory(deployer);
    minter = await mockMinterTokenDeployer.deploy("MOBI", "MOBI");
    const mobiPoolDeployer = new MockMobiusPool__factory(deployer);
    mobiPool = await mobiPoolDeployer.deploy("LP", "LP", inboundToken.address);
    const mobiGaugeDeployer = new MockMobiusGauge__factory(deployer);
    mobiGauge = await mobiGaugeDeployer.deploy("LP-GAUGE", "LP-GAUGE", minter.address, mobiPool.address);

    const rewardTokens = new Array();
    rewardTokens[0] = minter.address;

    await mobiPool.setGauge(mobiGauge.address);
    if (isInvestmentStrategy) {
      const mobiStrategyDeployer = new MobiusStrategy__factory(deployer);
      await expect(
        mobiStrategyDeployer.deploy(ZERO_ADDRESS, mobiGauge.address, minter.address, ZERO_ADDRESS, 0, rewardTokens),
      ).to.be.revertedWith("INVALID_POOL()");

      await expect(
        mobiStrategyDeployer.deploy(mobiPool.address, mobiGauge.address, minter.address, ZERO_ADDRESS, 0, [
          ZERO_ADDRESS,
        ]),
      ).to.be.revertedWith("INVALID_REWARD_TOKEN()");

      await expect(
        mobiStrategyDeployer.deploy(mobiPool.address, ZERO_ADDRESS, minter.address, ZERO_ADDRESS, 0, rewardTokens),
      ).to.be.revertedWith("INVALID_REWARD_TOKEN()");

      strategy = await mobiStrategyDeployer.deploy(
        mobiPool.address,
        mobiGauge.address,
        minter.address,
        ZERO_ADDRESS,
        0,
        rewardTokens,
      );

      if (isInboundToken) {
        await expect(strategy.invest(inboundToken.address, 0, { value: (1e18).toString() })).to.be.revertedWith(
          "CANNOT_ACCEPT_TRANSACTIONAL_TOKEN()",
        );
      }
    }
  } else {
    const rewardTokenDeployer = new MockWMatic__factory(deployer);
    rewardToken = await rewardTokenDeployer.deploy();
    const rewardToken2 = await rewardTokenDeployer.deploy();
    const rewardToken3 = await rewardTokenDeployer.deploy();
    const rewardToken4 = await rewardTokenDeployer.deploy();
    const rewardToken5 = await rewardTokenDeployer.deploy();
    const rewardToken6 = await rewardTokenDeployer.deploy();
    const rewardToken7 = await rewardTokenDeployer.deploy();
    const rewardToken8 = await rewardTokenDeployer.deploy();
    const rewardToken9 = await rewardTokenDeployer.deploy();
    const rewardToken10 = await rewardTokenDeployer.deploy();

    if (isSameAsRewardToken) {
      inboundToken = rewardToken;
    }

    if (isInvestmentStrategy) {
      const noExternalStrategyDeployer = new NoExternalStrategy__factory(deployer);
      await expect(
        noExternalStrategyDeployer.deploy(isInboundToken ? inboundToken.address : inboundToken, [ZERO_ADDRESS]),
      ).to.be.revertedWith("INVALID_REWARD_TOKEN()");
      strategy = await noExternalStrategyDeployer.deploy(isInboundToken ? inboundToken.address : inboundToken, [
        rewardToken.address,
        rewardToken2.address,
        rewardToken3.address,
        rewardToken4.address,
        rewardToken5.address,
        rewardToken6.address,
        rewardToken7.address,
        rewardToken8.address,
        rewardToken9.address,
        rewardToken10.address,
      ]);
      await rewardToken.deposit({ value: ethers.utils.parseEther("3") });
      await rewardToken.transfer(strategy.address, ethers.utils.parseEther("3"));

      await rewardToken2.deposit({ value: ethers.utils.parseEther("3") });
      await rewardToken2.transfer(strategy.address, ethers.utils.parseEther("3"));

      await rewardToken3.deposit({ value: ethers.utils.parseEther("3") });
      await rewardToken3.transfer(strategy.address, ethers.utils.parseEther("3"));

      await rewardToken4.deposit({ value: ethers.utils.parseEther("3") });
      await rewardToken4.transfer(strategy.address, ethers.utils.parseEther("3"));

      await rewardToken5.deposit({ value: ethers.utils.parseEther("3") });
      await rewardToken5.transfer(strategy.address, ethers.utils.parseEther("3"));

      await rewardToken6.deposit({ value: ethers.utils.parseEther("3") });
      await rewardToken6.transfer(strategy.address, ethers.utils.parseEther("3"));

      await rewardToken7.deposit({ value: ethers.utils.parseEther("3") });
      await rewardToken7.transfer(strategy.address, ethers.utils.parseEther("3"));

      await rewardToken8.deposit({ value: ethers.utils.parseEther("3") });
      await rewardToken8.transfer(strategy.address, ethers.utils.parseEther("3"));

      await rewardToken9.deposit({ value: ethers.utils.parseEther("3") });
      await rewardToken9.transfer(strategy.address, ethers.utils.parseEther("3"));

      await rewardToken10.deposit({ value: ethers.utils.parseEther("3") });
      await rewardToken10.transfer(strategy.address, ethers.utils.parseEther("3"));
    }
  }
  if (isSameAsRewardToken) {
    inboundToken = rewardToken;
    if (strategyType == "aave" || strategyType == "aaveV3") {
      await lendingPool.setUnderlyingAssetAddress(rewardToken.address);
    }
  }
  let goodGhosting: any;
  if (!isWhitelisted) {
    const goodGhostingV2Deployer = new Pool__factory(deployer);
    await expect(
      goodGhostingV2Deployer.deploy(
        isInboundToken ? inboundToken.address : inboundToken,
        ethers.utils.parseEther(maxFlexibleSegmentAmount.toString()),
        depositCount,
        segmentLength,
        0,
        segmentPayment,
        earlyWithdrawFee,
        adminFee,
        playerCount,
        isVariableAmount,
        isInvestmentStrategy ? strategy.address : strategy,
        isTransactionalToken,
      ),
    ).to.be.revertedWith("INVALID_WAITING_ROUND_SEGMENT_LENGTH()");

    await expect(
      goodGhostingV2Deployer.deploy(
        isInboundToken ? inboundToken.address : inboundToken,
        ethers.utils.parseEther(maxFlexibleSegmentAmount.toString()),
        depositCount,
        segmentLength,
        segmentLength / 2,
        segmentPayment,
        earlyWithdrawFee,
        adminFee,
        playerCount,
        isVariableAmount,
        isInvestmentStrategy ? strategy.address : strategy,
        isTransactionalToken,
      ),
    ).to.be.revertedWith("INVALID_WAITING_ROUND_SEGMENT_LENGTH()");

    if (isVariableAmount) {
      await expect(
        goodGhostingV2Deployer.deploy(
          isInboundToken ? inboundToken.address : inboundToken,
          "0",
          depositCount,
          segmentLength,
          segmentLength * 2,
          segmentPayment,
          earlyWithdrawFee,
          adminFee,
          playerCount,
          isVariableAmount,
          isInvestmentStrategy ? strategy.address : strategy,
          isTransactionalToken,
        ),
      ).to.be.revertedWith("INVALID_MAX_FLEXIBLE_AMOUNT()");
    }

    if (
      (strategyType === "curve" || strategyType === "mobius") &&
      isInvestmentStrategy &&
      !isIncentiveToken &&
      isInboundToken &&
      !isTransactionalToken
    ) {
      const token = new MintableERC20__factory(deployer);
      const newInboundToken = await token.deploy("NEW", "NEW");
      await mintTokens(newInboundToken, player1.address);
      let newStrategy: any;

      if (strategyType === "curve") {
        const mockCurveTokenDeployer = new MintableERC20__factory(deployer);
        const curve = await mockCurveTokenDeployer.deploy("CURVE", "CURVE");
        const rewardTokenDeployer = new MintableERC20__factory(deployer);
        let rewardToken = await rewardTokenDeployer.deploy("TOKEN_NAME", "TOKEN_SYMBOL");
        const curvePoolDeployer = new MockCurvePool__factory(deployer);
        const curvePool = await curvePoolDeployer.deploy("LP", "LP", inboundToken.address);
        const curveGaugeDeployer = new MockCurveGauge__factory(deployer);
        const curveGauge = await curveGaugeDeployer.deploy(
          "LP-GAUGE",
          "LP-GAUGE",
          curve.address,
          curvePool.address,
          rewardToken.address,
        );

        const rewardTokens = new Array();
        rewardTokens[0] = curve.address;
        await curvePool.setGauge(curveGauge.address);

        await rewardToken.mint(curveGauge.address, ethers.utils.parseEther("100000"));
        await curve.mint(curveGauge.address, ethers.utils.parseEther("100000"));
        const mockCurveMinterDeployer = new MockCurveGaugeMinter__factory(deployer);
        const gaugeminter = await mockCurveMinterDeployer.deploy();
        const curveStrategyDeployer = new CurveStrategy__factory(deployer);
        newStrategy = await curveStrategyDeployer.deploy(
          curvePool.address,
          0,
          curvePoolType,
          curveGauge.address,
          ZERO_ADDRESS,
          rewardTokens,
        );
        rewardToken = curve;
      } else if (strategyType === "mobius") {
        const mockMobiTokenDeployer = new MintableERC20__factory(deployer);
        const mobi = await mockMobiTokenDeployer.deploy("MOBI", "MOBI");
        const mockMinterTokenDeployer = new MockMobiusMinter__factory(deployer);
        const minter = await mockMinterTokenDeployer.deploy("CELO", "CELO");
        const mobiPoolDeployer = new MockMobiusPool__factory(deployer);
        const mobiPool = await mobiPoolDeployer.deploy("LP", "LP", inboundToken.address);
        const mobiGaugeDeployer = new MockMobiusGauge__factory(deployer);
        const mobiGauge = await mobiGaugeDeployer.deploy("LP-GAUGE", "LP-GAUGE", minter.address, mobiPool.address);
        await mobiPool.setGauge(mobiGauge.address);
        const rewardTokens = new Array();
        rewardTokens[0] = minter.address;
        const mobiStrategyDeployer = new MobiusStrategy__factory(deployer);

        newStrategy = await mobiStrategyDeployer.deploy(
          mobiPool.address,
          mobiGauge.address,
          minter.address,
          ZERO_ADDRESS,
          0,
          rewardTokens,
        );
      }
      await expect(
        goodGhostingV2Deployer.deploy(
          newInboundToken.address,
          ethers.utils.parseEther(maxFlexibleSegmentAmount.toString()),
          depositCount,
          segmentLength,
          segmentLength * 2,
          segmentPayment,
          earlyWithdrawFee,
          adminFee,
          playerCount,
          isVariableAmount,
          newStrategy.address,
          isTransactionalToken,
        ),
      ).to.be.revertedWith("INVALID_INBOUND_TOKEN()");
    }

    goodGhosting = await goodGhostingV2Deployer.deploy(
      isInboundToken ? inboundToken.address : inboundToken,
      ethers.utils.parseEther(maxFlexibleSegmentAmount.toString()),
      depositCount,
      segmentLength,
      segmentLength * 2,
      segmentPayment,
      earlyWithdrawFee,
      adminFee,
      playerCount,
      isVariableAmount,
      isInvestmentStrategy ? strategy.address : strategy,
      isTransactionalToken,
    );

    let incentiveTokenAddress = ZERO_ADDRESS;
    if (isIncentiveToken) {
      incentiveTokenAddress = incentiveToken.address;
      await mintTokens(incentiveToken, goodGhosting.address);
    }
    if (isInvestmentStrategy) {
      await expect(goodGhosting.initialize(incentiveTokenAddress)).to.be.revertedWith("INVALID_OWNER()");
      await strategy.transferOwnership(goodGhosting.address);
    }

    await expect(goodGhosting.connect(deployer).joinGame(0, "1000000000000000000")).to.be.revertedWith(
      "GAME_NOT_INITIALIZED()",
    );

    await expect(goodGhosting.getCurrentSegment()).to.be.revertedWith("GAME_NOT_INITIALIZED()");

    const result = await goodGhosting.initialize(incentiveTokenAddress);

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    const waitingRoundSegmentStart = ethers.BigNumber.from(timestamp).add(
      ethers.BigNumber.from(depositCount).mul(ethers.BigNumber.from(segmentLength)),
    );
    await expect(result)
      .to.emit(goodGhosting, "Initialized")
      .withArgs(ethers.BigNumber.from(timestamp), waitingRoundSegmentStart);

    await expect(goodGhosting.initialize(incentiveTokenAddress)).to.be.revertedWith("GAME_ALREADY_INITIALIZED()");
  } else {
    const goodGhostingV2Deployer = new WhitelistedPool__factory(deployer);

    await expect(
      goodGhostingV2Deployer.deploy(
        isInboundToken ? inboundToken.address : inboundToken,
        ethers.utils.parseEther(maxFlexibleSegmentAmount.toString()),
        depositCount,
        segmentLength,
        0,
        segmentPayment,
        earlyWithdrawFee,
        adminFee,
        playerCount,
        isVariableAmount,
        isInvestmentStrategy ? strategy.address : strategy,
        isTransactionalToken,
      ),
    ).to.be.revertedWith("INVALID_WAITING_ROUND_SEGMENT_LENGTH()");

    await expect(
      goodGhostingV2Deployer.deploy(
        isInboundToken ? inboundToken.address : inboundToken,
        ethers.utils.parseEther(maxFlexibleSegmentAmount.toString()),
        depositCount,
        segmentLength,
        segmentLength / 2,
        segmentPayment,
        earlyWithdrawFee,
        adminFee,
        playerCount,
        isVariableAmount,
        isInvestmentStrategy ? strategy.address : strategy,
        isTransactionalToken,
      ),
    ).to.be.revertedWith("INVALID_WAITING_ROUND_SEGMENT_LENGTH()");

    goodGhosting = await goodGhostingV2Deployer.deploy(
      isInboundToken ? inboundToken.address : inboundToken,
      ethers.utils.parseEther(maxFlexibleSegmentAmount.toString()),
      depositCount,
      segmentLength,
      segmentLength * 2,
      segmentPayment,
      earlyWithdrawFee,
      adminFee,
      playerCount,
      isVariableAmount,
      isInvestmentStrategy ? strategy.address : strategy,
      isTransactionalToken,
    );
    await expect(goodGhosting.connect(deployer).joinGame(0, "1000000000000000000")).to.be.revertedWith(
      "GAME_NOT_INITIALIZED()",
    );

    let incentiveTokenAddress = ZERO_ADDRESS;
    if (isIncentiveToken) {
      incentiveTokenAddress = incentiveToken.address;
      await mintTokens(incentiveToken, goodGhosting.address);
    }

    if (isInvestmentStrategy) {
      await expect(goodGhosting.initializePool(merkleRoot, incentiveTokenAddress)).to.be.revertedWith(
        "INVALID_OWNER()",
      );
      await strategy.transferOwnership(goodGhosting.address);
    }
    await expect(goodGhosting.initialize(incentiveTokenAddress)).to.be.revertedWith(
      "Whitelisting enabled - use initializePool(bytes32) instead",
    );

    await expect(goodGhosting.getCurrentSegment()).to.be.revertedWith("GAME_NOT_INITIALIZED()");

    await goodGhosting.initializePool(merkleRoot, incentiveTokenAddress);

    await expect(goodGhosting.initializePool(merkleRoot, incentiveTokenAddress)).to.be.revertedWith(
      "GAME_ALREADY_INITIALIZED()",
    );
  }
  const isInitialized = await goodGhosting.isInitialized();
  assert(isInitialized);

  if (!isTransactionalToken) {
    await expect(
      deployer.sendTransaction({ to: goodGhosting.address, value: ethers.utils.parseEther("1.0") }),
    ).to.be.revertedWith("INVALID_TRANSACTIONAL_TOKEN_SENDER()");
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
    mobi,
    curvePoolType,
  };
};

export const deployPoolWithMockStrategy = async (
  depositCount: number,
  segmentLength: number,
  segmentPayment: any,
  earlyWithdrawFee: number,
  adminFee: number,
  playerCount: any,
  curvePoolType: number,
  strategyType: string,
  maxFlexibleSegmentAmount: number,
) => {
  const [deployer, , player1, player2] = await ethers.getSigners();
  let inboundToken: any = ZERO_ADDRESS;

  let rewardToken: any = ZERO_ADDRESS;
  let strategy: any = ZERO_ADDRESS;
  let curve: any = ZERO_ADDRESS;
  let mobi: any = ZERO_ADDRESS;
  let minter: any = ZERO_ADDRESS;
  let curveGauge: any = ZERO_ADDRESS;
  let curvePool: any = ZERO_ADDRESS;
  let mobiGauge: any = ZERO_ADDRESS;
  let mobiPool: any = ZERO_ADDRESS;

  const token = new MintableERC20__factory(deployer);
  inboundToken = await token.deploy("MINT", "MINT");
  await mintTokens(inboundToken, player1.address);
  await mintTokens(inboundToken, player2.address);
  let incentiveToken: any = ZERO_ADDRESS;

  if (strategyType == "curve") {
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
    await curvePool.setGauge(curveGauge.address);

    await rewardToken.mint(curveGauge.address, ethers.utils.parseEther("100000"));
    await curve.mint(curveGauge.address, ethers.utils.parseEther("100000"));

    const rewardTokens = new Array();
    rewardTokens[0] = curve.address;
    const mockCurveMinterDeployer = new MockCurveGaugeMinter__factory(deployer);
    const gaugeminter = await mockCurveMinterDeployer.deploy();
    const curveStrategyDeployer = new MockCurveStrategy__factory(deployer);
    strategy = await curveStrategyDeployer.deploy(
      curvePool.address,
      0,
      curvePoolType,
      curveGauge.address,
      ZERO_ADDRESS,
      rewardTokens,
    );
    rewardToken = curve;
  } else {
    const mockMobiTokenDeployer = new MintableERC20__factory(deployer);
    mobi = await mockMobiTokenDeployer.deploy("MOBI", "MOBI");
    const mockMinterTokenDeployer = new MockMobiusMinter__factory(deployer);
    minter = await mockMinterTokenDeployer.deploy("CELO", "CELO");
    const mobiPoolDeployer = new MockMobiusPool__factory(deployer);
    mobiPool = await mobiPoolDeployer.deploy("LP", "LP", inboundToken.address);
    const mobiGaugeDeployer = new MockMobiusGauge__factory(deployer);
    mobiGauge = await mobiGaugeDeployer.deploy("LP-GAUGE", "LP-GAUGE", minter.address, mobiPool.address);
    await mobiPool.setGauge(mobiGauge.address);
    const rewardTokens = new Array();
    rewardTokens[0] = minter.address;
    const mobiStrategyDeployer = new MockMobiusStrategy__factory(deployer);

    strategy = await mobiStrategyDeployer.deploy(
      mobiPool.address,
      mobiGauge.address,
      minter.address,
      ZERO_ADDRESS,
      0,
      rewardTokens,
    );
  }

  const goodGhostingV2Deployer = new Pool__factory(deployer);
  let goodGhosting = await goodGhostingV2Deployer.deploy(
    inboundToken.address,
    ethers.utils.parseEther(maxFlexibleSegmentAmount.toString()),
    depositCount,
    segmentLength,
    segmentLength * 2,
    segmentPayment,
    earlyWithdrawFee,
    adminFee,
    playerCount,
    false,
    strategy.address,
    false,
  );

  await strategy.transferOwnership(goodGhosting.address);
  await goodGhosting.initialize(incentiveToken);
  return {
    inboundToken,
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
    mobi,
    curvePoolType,
  };
};

export const getRewardTokenInstance = async (strategy: any, player: any) => {
  const rewardToken = await strategy.getRewardTokens();
  return new ethers.Contract(rewardToken[0], wmatic.abi, player);
};

export const approveToken = async (
  inboundToken: MintableERC20,
  player: any,
  poolAddress: string,
  segmentPayment: string,
) => {
  await inboundToken
    .connect(player)
    .approve(poolAddress, ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("1000")).toString());
  const allowance = await inboundToken.allowance(player.address, poolAddress);
  assert(
    allowance.eq(
      ethers.BigNumber.from(ethers.BigNumber.from(segmentPayment).mul(ethers.BigNumber.from("1000")).toString()),
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
    const T = await goodGhosting.connect(player).makeDeposit(0, depositAmount);
    await T.wait();
  } else {
    const T = await goodGhosting.connect(player).makeDeposit(0, depositAmount, { value: depositAmount });
    await T.wait();
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
