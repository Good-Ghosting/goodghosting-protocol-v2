import { BigNumber } from "ethers";
import { IERC20, IStrategy, Pool } from "../src/types";

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
    return currentSegment.sub(BigNumber.from("1"));
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

export async function getGameGrossInterest(
  goodGhostingContract: Pool,
  strategyContract: IStrategy,
): Promise<BigNumber> {
  const contractBalance = await strategyContract.getTotalAmount();
  const totalGamePrincipal = await goodGhostingContract.netTotalGamePrincipal();

  const feeAdmin = await goodGhostingContract.adminFee();
  const interestAdminFeeAmount = await goodGhostingContract.adminFeeAmount(0);

  const isRedeemed = await goodGhostingContract.adminFeeSet();

  if (isRedeemed) {
    return contractBalance.sub(totalGamePrincipal).sub(interestAdminFeeAmount);
  } else {
    return contractBalance.sub(totalGamePrincipal).mul(BigNumber.from(100).sub(feeAdmin)).div(100);
  }
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
  const playerDepositSharePercentage = playerNetDepositAmount.mul(multiplier).div(totalWinnersDeposits);

  const playerDepositInterestShare = playerDepositSharePercentage.mul(gameDepositRoundSharePercentage);
  const playerWaitingRoundInterestShare = playerIndexSharePercentage.mul(gameWaitRoundSharePercentage);

  const totalPlayerShare = playerWaitingRoundInterestShare.add(playerDepositInterestShare);

  return totalPlayerShare;
}

export async function getPlayerInterest(
  goodGhostingContract: Pool,
  strategyContract: IStrategy,
  playerAddress: string,
) {
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
    address => address.toLowerCase() === rewardTokenContract.address.toLowerCase(),
  );

  if (rewardIndex < 0) {
    return BigNumber.from(0);
  }

  const gameRewardsSentToStrategy = await rewardTokenContract.balanceOf(strategyContract.address);
  const gameRewardsSentToPool = await rewardTokenContract.balanceOf(goodGhostingContract.address);

  const isRedeemed = await goodGhostingContract.adminFeeSet();

  const rewardBalance = (gameRewards[rewardIndex] ?? BigNumber.from(0))
    .add(gameRewardsSentToStrategy)
    .add(gameRewardsSentToPool);

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
  const multiplier = await getMultiplier(goodGhostingContract);
  const totalPlayerShare = await getPlayerShare(goodGhostingContract, playerAddress);

  const contractRewardBalance = await getRewardBalance(goodGhostingContract, strategyContract, rewardTokenContract);

  const playerReward = contractRewardBalance.mul(totalPlayerShare).div(multiplier).div(multiplier);

  return playerReward;
}
