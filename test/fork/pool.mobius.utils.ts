export function buildMoolaTokenArray(balance: string | BN, tokenIndex: number): Array<string | number> {
  const arraySize = 2;
  const array = new Array(arraySize).fill("0");

  array[tokenIndex] = balance.toString();

  return array;
}

export function buildCalculateTokenAmountParameters(
  balance: string | BN,
  tokenIndex: number,
  mobiusStrategyAddress: string,
): [string, Array<string | number>, boolean | undefined] {
  const mobiusArray = buildMoolaTokenArray(balance, tokenIndex);

  return [mobiusStrategyAddress, mobiusArray, true];
}
