import { BigNumber } from "ethers";
import { ERC20, ERC20__factory, IERC20, IStrategy, Pool } from "../src/types";
import { getRewardTokenInstance } from "./pool.utils";
const { ethers } = require("hardhat");
import { default as BigNumberJS } from "bignumber.js";

async function mapForEachSegment<T>(contract: Pool, mapFunc: (contract: Pool, segment: number) => Promise<T>) {
  const segmentCount = await contract.depositCount();

  return Promise.all(
    Array(segmentCount.toNumber())
      .fill(0)
      .map((_, index) => mapFunc(contract, index)),
  );
}

export async function getPlayerIndex(contract: Pool, playerId: string): Promise<BigNumber[]> {
  return mapForEachSegment(contract, async (contract, seg) => {
    return contract.playerIndex(playerId, seg);
  });
}

export async function getPlayerIndexSum(contract: Pool, playerAddress: string): Promise<BigNumber> {
  const playerIndex = await getPlayerIndex(contract, playerAddress);
  return playerIndex.reduce((acc, val) => acc.add(val));
}

export async function getCumulativePlayerIndexSum(contract: Pool): Promise<BigNumber> {
  const currentSegment = await getCurrentDepositSegment(contract);
  return contract.cumulativePlayerIndexSum(currentSegment);
}

async function getCurrentDepositSegment(contract: Pool) {
  const [currentSegment, paymentSegments, emergencyWithdraw] = await Promise.all([
    contract.getCurrentSegment(),
    contract.depositCount(),
    contract.emergencyWithdraw(),
  ]);

  if (emergencyWithdraw) {
    return paymentSegments.sub(BigNumber.from("1"));
  }

  const lastPaymentSegmentIndex = paymentSegments.sub(1);

  if (currentSegment.gt(lastPaymentSegmentIndex)) {
    return lastPaymentSegmentIndex;
  }

  return currentSegment;
}

export async function getDepositRoundInterestSharePercentage(contract: Pool): Promise<BigNumber> {
  const depositRoundInterestSharePercentage = await contract.depositRoundInterestSharePercentage();
  return depositRoundInterestSharePercentage;
}

export async function getMultiplier(contract: Pool): Promise<BigNumber> {
  return contract.MULTIPLIER();
}

export async function getPlayerNetDepositAmount(contract: Pool, player: string): Promise<BigNumber> {
  return (await contract.players(player)).netAmountPaid;
}

export async function getTotalWinnerDeposits(contract: Pool): Promise<BigNumber> {
  const currentSegment = await getCurrentDepositSegment(contract);
  return contract.totalWinnerDepositsPerSegment(currentSegment);
}

async function getRawGameGrossInterest(goodGhostingContract: Pool, strategyContract: IStrategy) {
  const strategyContractBalance = await strategyContract.getTotalAmount();
  const totalGamePrincipal = await goodGhostingContract.netTotalGamePrincipal();

  const accounts = await ethers.getSigners();

  const isTransactionalToken = await goodGhostingContract.isTransactionalToken();

  let sentTokens = BigNumber.from(0);
  if (isTransactionalToken) {
    sentTokens = await ethers.provider.getBalance(goodGhostingContract.address);
  } else {
    const depositTokenContract = ERC20__factory.connect(await goodGhostingContract.inboundToken(), accounts[0]);
    sentTokens = await depositTokenContract.balanceOf(goodGhostingContract.address);
  }

  const totalAmount = strategyContractBalance.add(sentTokens);
  const totalInterest = totalAmount.sub(totalGamePrincipal);

  return totalInterest;
}

export async function getExpectedFeeAdminInterestAmount(
  goodGhostingContract: Pool,
  strategyContract: IStrategy,
): Promise<BigNumber> {
  const isRedeemed = await goodGhostingContract.adminFeeSet();
  const feeAdmin = await goodGhostingContract.adminFee();
  const interestAdminFeeAmount = await goodGhostingContract.adminFeeAmount(0);

  if (isRedeemed) {
    return interestAdminFeeAmount;
  } else {
    const totalInterest = await getRawGameGrossInterest(goodGhostingContract, strategyContract);
    const adminShare = totalInterest.mul(feeAdmin).div(100);
    return adminShare;
  }
}

export async function getExpectedFeeAdminRewardAmount(
  goodGhostingContract: Pool,
  strategyContract: IStrategy,
  rewardTokenContract: ERC20,
): Promise<BigNumber> {
  const gameRewardsAddresses = await strategyContract.getRewardTokens();
  const rewardIndex = gameRewardsAddresses.findIndex(
    address => address.toLowerCase() === rewardTokenContract?.address?.toLowerCase(),
  );

  if (rewardIndex < 0) {
    return BigNumber.from(0);
  }

  const rewardAdminFeeAmount = await goodGhostingContract.adminFeeAmount(rewardIndex + 1);
  return rewardAdminFeeAmount;
}

export async function getGameGrossInterest(
  goodGhostingContract: Pool,
  strategyContract: IStrategy,
): Promise<BigNumber> {
  const feeAdmin = await goodGhostingContract.adminFee();
  const interestAdminFeeAmount = await goodGhostingContract.adminFeeAmount(0);

  const isRedeemed = await goodGhostingContract.adminFeeSet();
  const adminHasWithdrawn = await goodGhostingContract.adminWithdraw();
  const totalInterest = await getRawGameGrossInterest(goodGhostingContract, strategyContract);

  if (adminHasWithdrawn) {
    return totalInterest;
  }

  const lastWithdrawInterest = await goodGhostingContract.totalGameInterest();
  const lastWithdrawTotalInterestWithFee = lastWithdrawInterest.add(interestAdminFeeAmount);
  const hadImpermanentLossSinceLastWithdraw = totalInterest.lt(lastWithdrawTotalInterestWithFee);

  if (isRedeemed) {
    //If had impermanent loss since last withdraw, recalculate the admin fee
    if (hadImpermanentLossSinceLastWithdraw) {
      const adminShare = totalInterest.mul(feeAdmin).div(100);
      return totalInterest.sub(adminShare);
    }

    const interestGeneratedSinceLastWithdraw = totalInterest.sub(lastWithdrawTotalInterestWithFee);
    const additionalAdminFee = interestGeneratedSinceLastWithdraw.mul(feeAdmin).div(100);
    return totalInterest.sub(interestAdminFeeAmount).sub(additionalAdminFee);
  } else {
    const adminShare = totalInterest.mul(feeAdmin).div(100);
    return totalInterest.sub(adminShare);
  }
}

export async function getGameImpermanentLossShare(
  goodGhostingContract: Pool,
  strategyContract: IStrategy,
): Promise<BigNumberJS> {
  const contractBalance = await strategyContract.getTotalAmount();
  const grossTotalGamePrincipal = await goodGhostingContract.totalGamePrincipal();
  const netTotalGamePrincipal = await goodGhostingContract.netTotalGamePrincipal();

  const contractBalanceWithPrecision = new BigNumberJS(contractBalance.toString());
  const grossTotalGamePrincipalWithPrecision = new BigNumberJS(grossTotalGamePrincipal.toString());
  const netTotalGamePrincipalWithPrecision = new BigNumberJS(netTotalGamePrincipal.toString());

  const doNotHaveImpermanentLoss =
    contractBalanceWithPrecision.gte(netTotalGamePrincipalWithPrecision) &&
    !netTotalGamePrincipalWithPrecision.isZero();

  if (doNotHaveImpermanentLoss) {
    return BigNumberJS(100);
  }

  return contractBalanceWithPrecision.div(netTotalGamePrincipalWithPrecision);
}

export async function getPlayerShare(goodGhostingContract: Pool, playerAddress: string) {
  const multiplier = await getMultiplier(goodGhostingContract);
  const playerIndexSum = await getPlayerIndexSum(goodGhostingContract, playerAddress);
  const cumulativePlayersIndexesSum = await getCumulativePlayerIndexSum(goodGhostingContract);

  const gameDepositRoundSharePercentage = await getDepositRoundInterestSharePercentage(goodGhostingContract);
  const gameWaitRoundSharePercentage = multiplier.sub(gameDepositRoundSharePercentage);

  const playerNetDepositAmount = await getPlayerNetDepositAmount(goodGhostingContract, playerAddress);
  const totalWinnersDeposits = await getTotalWinnerDeposits(goodGhostingContract);

  const playerIndexSharePercentage = playerIndexSum.mul(multiplier).div(cumulativePlayersIndexesSum);

  const playerDepositSharePercentage = !totalWinnersDeposits.isZero()
    ? playerNetDepositAmount.mul(multiplier).div(totalWinnersDeposits)
    : multiplier;

  const playerDepositInterestShare = playerIndexSharePercentage.mul(gameDepositRoundSharePercentage);
  const playerWaitingRoundInterestShare = playerDepositSharePercentage.mul(gameWaitRoundSharePercentage);

  const totalPlayerShare = playerWaitingRoundInterestShare.add(playerDepositInterestShare);

  return totalPlayerShare;
}

export async function getPlayerInterest(
  goodGhostingContract: Pool,
  strategyContract: IStrategy,
  playerAddress: string,
): Promise<BigNumber> {
  const gameImpermanentLossShare = await getGameImpermanentLossShare(goodGhostingContract, strategyContract);
  if (gameImpermanentLossShare.lt(1)) {
    const playerDepositAmount = await getPlayerNetDepositAmount(goodGhostingContract, playerAddress);

    const playerDepositAmountWithPrecision = new BigNumberJS(playerDepositAmount.toString());

    const playerRemainingDeposit = playerDepositAmountWithPrecision.times(gameImpermanentLossShare);
    const playerNegativeInterest = playerRemainingDeposit.minus(playerDepositAmountWithPrecision);
    return BigNumber.from(playerNegativeInterest.integerValue().toString());
  }

  const isWinner = await goodGhostingContract.isWinner(playerAddress);
  if (!isWinner) {
    return BigNumber.from(0);
  }

  const multiplier = await getMultiplier(goodGhostingContract);
  const totalPlayerShare = await getPlayerShare(goodGhostingContract, playerAddress);
  const gameInterest = await getGameGrossInterest(goodGhostingContract, strategyContract);
  const playerInterest = gameInterest.mul(totalPlayerShare).div(multiplier).div(multiplier);
  return playerInterest;
}

export async function getRewardBalance(
  goodGhostingContract: Pool,
  strategyContract: IStrategy,
  rewardTokenContract: IERC20,
) {
  const gameRewards = await strategyContract.callStatic.getAccumulatedRewardTokenAmounts(false);
  const gameRewardsAddresses = await strategyContract.getRewardTokens();
  const rewardIndex = gameRewardsAddresses.findIndex(
    address => address.toLowerCase() === rewardTokenContract?.address?.toLowerCase(),
  );

  if (rewardIndex < 0) {
    return BigNumber.from(0);
  }

  const gameRewardsSentToPool = await rewardTokenContract.balanceOf(goodGhostingContract.address);
  const isRedeemed = await goodGhostingContract.adminFeeSet();

  const rewardBalance = (gameRewards[rewardIndex] ?? BigNumber.from(0)).add(gameRewardsSentToPool);

  const adminHasWithdrawn = await goodGhostingContract.adminWithdraw();

  if (adminHasWithdrawn) {
    return rewardBalance;
  }

  if (isRedeemed) {
    const rewardAdminFeeAmount = await goodGhostingContract.adminFeeAmount(rewardIndex + 1);
    return rewardBalance.sub(rewardAdminFeeAmount);
  } else {
    const feeAdmin = await goodGhostingContract.adminFee();

    return rewardBalance.mul(BigNumber.from(100).sub(feeAdmin)).div(100);
  }
}

export async function getPlayerReward(
  goodGhostingContract: Pool,
  strategyContract: IStrategy,
  rewardTokenContract: IERC20,
  playerAddress: string,
): Promise<BigNumber> {
  const isWinner = await goodGhostingContract.isWinner(playerAddress);

  if (!isWinner) {
    return BigNumber.from(0);
  }

  const multiplier = await getMultiplier(goodGhostingContract);
  const totalPlayerShare = await getPlayerShare(goodGhostingContract, playerAddress);

  const contractRewardBalance = await getRewardBalance(goodGhostingContract, strategyContract, rewardTokenContract);

  const playerReward = contractRewardBalance.mul(totalPlayerShare).div(multiplier).div(multiplier);

  return playerReward;
}

export type GameContracts = {
  goodGhostingContract: Pool;
  strategyContract: IStrategy;
  rewardsTokenContract: Array<IERC20>;
};

export async function getPlayerMultipleRewards(
  { goodGhostingContract, strategyContract, rewardsTokenContract }: GameContracts,
  playerAddress: string,
): Promise<Array<BigNumber>> {
  const playerRewards = rewardsTokenContract.map(rewardContract =>
    getPlayerReward(goodGhostingContract, strategyContract, rewardContract, playerAddress),
  );

  return Promise.all(playerRewards);
}

export type PlayerBeforeWithdrawAccounting = {
  governanceTokenPlayerBalanceBeforeWithdraw: BigNumber;
  rewardTokenPlayerBalanceBeforeWithdraw: BigNumber;
  playerDepositTokenBalanceBeforeWithdraw: BigNumber;
  playerExpectedRewards: BigNumber;
  playerExpectedGovernanceRewards: BigNumber;
  playerExpectedInterest: BigNumber;

  playerNetDepositAmount: BigNumber;
} & {
  context: {
    player: any;
    strategyType: string;
    contracts: any;
  };
};

export async function getPlayerBeforeWithdrawAccounting(
  player: any,
  strategyType: string,
  contracts: any,
): Promise<PlayerBeforeWithdrawAccounting> {
  let governanceTokenPlayerBalanceBeforeWithdraw = 0,
    rewardTokenPlayerBalanceBeforeWithdraw = 0;

  const governanceRewardTokenContract = strategyType === "curve" ? contracts.curve : contracts.minter;
  const isCurveOrMobius = strategyType === "curve" || strategyType === "mobius";

  if (isCurveOrMobius) {
    governanceTokenPlayerBalanceBeforeWithdraw = await governanceRewardTokenContract.balanceOf(player.address);
  }
  const rewardTokenInstance = await getRewardTokenInstance(contracts.strategy, player);

  rewardTokenPlayerBalanceBeforeWithdraw = await rewardTokenInstance.balanceOf(player.address);

  const gameContracts: GameContracts = {
    goodGhostingContract: contracts.goodGhosting,
    strategyContract: contracts.strategy,
    rewardsTokenContract: [rewardTokenInstance, governanceRewardTokenContract],
  };

  const [playerExpectedRewards, playerExpectedGovernanceRewards] = await getPlayerMultipleRewards(
    gameContracts,
    player.address,
  );

  const playerNetDepositAmount = await getPlayerNetDepositAmount(gameContracts.goodGhostingContract, player.address);
  const playerDepositTokenBalanceBeforeWithdraw = await contracts.inboundToken.balanceOf(player.address);

  const playerExpectedInterest = await getPlayerInterest(
    gameContracts.goodGhostingContract,
    gameContracts.strategyContract,
    player.address,
  );

  return {
    governanceTokenPlayerBalanceBeforeWithdraw: BigNumber.from(governanceTokenPlayerBalanceBeforeWithdraw),
    rewardTokenPlayerBalanceBeforeWithdraw: BigNumber.from(rewardTokenPlayerBalanceBeforeWithdraw),
    playerExpectedRewards,
    playerExpectedInterest,
    playerExpectedGovernanceRewards,
    playerDepositTokenBalanceBeforeWithdraw,

    playerNetDepositAmount,

    context: { player, strategyType, contracts },
  };
}

export type PlayerAfterWithdrawAccounting = {
  playerReceivedReward: BigNumber;
  playerReceivedGovernanceReward: BigNumber;
  playerReceivedInterest: BigNumber;
  playerWithdrawAmount: BigNumber;
};

export async function getPlayerAfterWithdrawAccounting(
  playerBeforeWithdrawAccounting: PlayerBeforeWithdrawAccounting,
): Promise<PlayerAfterWithdrawAccounting> {
  let governanceTokenPlayerBalanceAfterWithdraw = 0,
    rewardTokenPlayerBalanceAfterWithdraw = 0;

  const { player, strategyType, contracts } = playerBeforeWithdrawAccounting.context;

  const governanceRewardTokenContract = strategyType === "curve" ? contracts.curve : contracts.minter;
  const isCurveOrMobius = strategyType === "curve" || strategyType === "mobius";

  if (isCurveOrMobius) {
    governanceTokenPlayerBalanceAfterWithdraw = await governanceRewardTokenContract.balanceOf(player.address);
  }

  const rewardTokenInstance = await getRewardTokenInstance(contracts.strategy, player);

  rewardTokenPlayerBalanceAfterWithdraw = await rewardTokenInstance.balanceOf(player.address);

  const playerReceivedReward = BigNumber.from(rewardTokenPlayerBalanceAfterWithdraw).sub(
    playerBeforeWithdrawAccounting.rewardTokenPlayerBalanceBeforeWithdraw,
  );

  const playerReceivedGovernanceReward = BigNumber.from(governanceTokenPlayerBalanceAfterWithdraw).sub(
    playerBeforeWithdrawAccounting.governanceTokenPlayerBalanceBeforeWithdraw,
  );

  const playerDepositTokenBalanceAfterWithdraw = await contracts.inboundToken.balanceOf(player.address);

  const playerWithdrawAmount = BigNumber.from(playerDepositTokenBalanceAfterWithdraw).sub(
    playerBeforeWithdrawAccounting.playerDepositTokenBalanceBeforeWithdraw,
  );

  const playerReceivedInterest = playerWithdrawAmount.sub(playerBeforeWithdrawAccounting.playerNetDepositAmount);

  return {
    playerReceivedReward,
    playerReceivedGovernanceReward,
    playerReceivedInterest,
    playerWithdrawAmount,
  };
}

export function assertExpectedRewardsEqualReceivedRewards(
  playerBeforeAccounting: PlayerBeforeWithdrawAccounting,
  playerAfterAccounting: PlayerAfterWithdrawAccounting,
) {
  assert(playerBeforeAccounting.playerExpectedRewards.eq(playerAfterAccounting.playerReceivedReward));
  assert(
    playerBeforeAccounting.playerExpectedGovernanceRewards.eq(playerAfterAccounting.playerReceivedGovernanceReward),
  );
}

export function assertExpectedInterestEqualReceivedInterest(
  playerBeforeAccounting: PlayerBeforeWithdrawAccounting,
  playerAfterAccounting: PlayerAfterWithdrawAccounting,
) {
  // console.log("playerBeforeAccounting.playerExpectedInterest", playerBeforeAccounting.playerExpectedInterest.toString());
  //console.log("playerAfterAccounting.playerReceivedInterest", playerAfterAccounting.playerReceivedInterest.toString());

  assert(playerBeforeAccounting.playerExpectedInterest.eq(playerAfterAccounting.playerReceivedInterest));
}

export function assertExpectedInterestAndRewardsEqualToReceived(
  playerBeforeAccounting: PlayerBeforeWithdrawAccounting,
  playerAfterAccounting: PlayerAfterWithdrawAccounting,
) {
  assertExpectedRewardsEqualReceivedRewards(playerBeforeAccounting, playerAfterAccounting);
  assertExpectedInterestEqualReceivedInterest(playerBeforeAccounting, playerAfterAccounting);
}
