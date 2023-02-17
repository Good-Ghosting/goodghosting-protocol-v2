export function buildCurveTokenArray(
  balance: string | BN,
  tokenIndex: number,
  poolType: number,
): Array<string | number> {
  let arraySize;

  if (poolType == 0) {
    arraySize = 3;
  } else if (poolType == 1) {
    arraySize = 5;
  } else {
    arraySize = 2;
  }

  const array = new Array(arraySize).fill(0);
  array[tokenIndex] = balance.toString();

  return array;
}

export function buildCalcTokenAmountParameters(
  balance: string | BN,
  tokenIndex: number,
  poolType: number,
): [Array<string | number>, boolean | undefined] {
  const curveArray = buildCurveTokenArray(balance, tokenIndex, poolType);

  if (poolType == 0 || poolType == 1) {
    return [curveArray, true];
  }

  return [curveArray, undefined];
}

export function selectWithdrawAmount(poolType: number, withdrawAmount: unknown, segmentPayment: unknown): any {
  return poolType == 0 || poolType == 1 ? withdrawAmount : segmentPayment;
}
