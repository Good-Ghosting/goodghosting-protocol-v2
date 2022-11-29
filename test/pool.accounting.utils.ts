import { BigNumber } from "ethers";
import { IStrategy, Pool } from "../src/types";

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

export async function getPlayerInterest(
  goodGhostingContract: Pool,
  strategyContract: IStrategy,
  playerAddress: string,
) {
  const multiplier = await getMultiplier(goodGhostingContract);
  const playerIndexSum = await getPlayerIndexSum(goodGhostingContract, playerAddress);
  const cumulativePlayersIndexesSum = await getCumulativePlayerIndexSum(goodGhostingContract);
  console.log("pindex", playerIndexSum.toString());
  console.log("cindex", cumulativePlayersIndexesSum.toString());

  const gameDepositRoundSharePercentage = await getDepositRoundInterestSharePercentage(goodGhostingContract);
  const gameWaitRoundSharePercentage = multiplier.sub(gameDepositRoundSharePercentage);
  console.log("share", gameDepositRoundSharePercentage.toString());
  console.log("whhare", gameWaitRoundSharePercentage.toString());

  const playerNetDepositAmount = await getPlayerNetDepositAmount(goodGhostingContract, playerAddress);
  const totalWinnersDeposits = await getTotalWinnerDeposits(goodGhostingContract);

  const playerIndexSharePercentage = playerIndexSum.mul(multiplier).div(cumulativePlayersIndexesSum);
  const playerDepositSharePercentage = playerNetDepositAmount.mul(multiplier).div(totalWinnersDeposits);

  const playerDepositInterestShare = playerDepositSharePercentage.mul(gameDepositRoundSharePercentage);
  const playerWaitingRoundInterestShare = playerIndexSharePercentage.mul(gameWaitRoundSharePercentage);

  const totalPlayerShare = playerWaitingRoundInterestShare.add(playerDepositInterestShare);

  const gameInterest = await getGameGrossInterest(goodGhostingContract, strategyContract);

  const playerInterest = gameInterest.mul(totalPlayerShare).div(multiplier).div(multiplier);

  return playerInterest;
}
