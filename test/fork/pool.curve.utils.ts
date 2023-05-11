const configs = require("../../deploy.config");
const providerConfig = require("../../providers.config");
const wmaticABI = require("../../abi-external/wmatic.abi.json");
const celotripoolABI = require("../../abi-external/curve-celo-tripool-abi.json");
const aavepoolABI = require("../../abi-external/curve-aave-pool-abi.json");
const atricryptopoolABI = require("../../abi-external/curve-atricrypto-pool-abi.json");
const maticpoolABI = require("../../abi-external/curve-matic-pool-abi.json");

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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
  } else if (poolType == 2) {
    arraySize = 2;
  } else if (poolType == 3) {
    arraySize = 3;
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

  if (poolType == 0 || poolType == 1 || poolType == 3) {
    return [curveArray, true];
  }

  return [curveArray, undefined];
}

//TODO - do we need this?
export function selectWithdrawAmount(poolType: number, withdrawAmount: unknown, segmentPayment: unknown): any {
  return poolType == 0 || poolType == 1 || poolType == 3 ? withdrawAmount : segmentPayment;
}

export function subtractWithExpectedSlippage(minAmount: BN, slippagePercentage: number = 0.02) {
  return web3.utils.toBN(minAmount).sub(web3.utils.toBN(minAmount).div(web3.utils.toBN(1 / slippagePercentage)));
}

export async function getBalanceOfIfDefined(contract: any, address: string, from?: string | undefined) {
  if (contract) {
    return web3.utils.toBN(await contract.methods.balanceOf(address).call({ from: from ?? address }));
  } else {
    return web3.utils.toBN(0);
  }
}

export function shouldExecuteCurveForkTests(): boolean {
  return !["local-polygon", "local-celo"].includes(process.env.NETWORK ?? "");
}

export function shouldExecuteCurveForkVariableDepositTests(): boolean {
  return !["local-variable-polygon", "local-variable-celo"].includes(process.env.NETWORK ?? "");
}

export function isNetworkLocalPolygon(): boolean {
  return process.env.NETWORK === "local-polygon" || process.env.NETWORK === "local-variable-polygon";
}

export function getProvidersConfigCurrentNetwork(): { strategyConfig: any; providerConfig: any } {
  const isLocalPolygon = isNetworkLocalPolygon();

  let strategyConfig: any;

  if (configs.deployConfigs.strategy === "polygon-curve-aave") {
    strategyConfig = providerConfig.providers["polygon"].strategies["polygon-curve-aave"];
  } else if (configs.deployConfigs.strategy === "polygon-curve-atricrypto") {
    strategyConfig = providerConfig.providers["polygon"].strategies["polygon-curve-atricrypto"];
  } else if (configs.deployConfigs.strategy === "celo-curve-tripool") {
    strategyConfig = providerConfig.providers["celo"].strategies["celo-curve-tripool"];
  } else {
    strategyConfig = providerConfig.providers["polygon"].strategies["polygon-curve-stmatic-matic"];
  }

  const providerConfigCurrentNetwork = isLocalPolygon
    ? providerConfig.providers["polygon"]
    : providerConfig.providers["celo"];

  return { strategyConfig, providerConfig: providerConfigCurrentNetwork };
}

export function getCurvePool(strategyConfig: any) {
  let pool: any;
  if (strategyConfig.poolType == 0) {
    pool = new web3.eth.Contract(aavepoolABI, strategyConfig.pool);
  } else if (strategyConfig.poolType == 1) {
    pool = new web3.eth.Contract(atricryptopoolABI, strategyConfig.pool);
  } else if (providerConfig.poolType == 2) {
    pool = new web3.eth.Contract(maticpoolABI, strategyConfig.pool);
  } else {
    pool = new web3.eth.Contract(celotripoolABI, strategyConfig.pool);
  }

  return pool;
}

export function getDepositTokenDecimals(providerConfig: any): BN {
  const tokenDecimals = web3.utils.toBN(
    10 ** providerConfig.tokens[configs.deployConfigs.inboundCurrencySymbol].decimals,
  );

  return tokenDecimals;
}

export function getDepositTokenContract(providerConfig: any): any {
  //Todo check ABI for celo tokens (like cusd)
  return new web3.eth.Contract(wmaticABI, providerConfig.tokens[configs.deployConfigs.inboundCurrencySymbol].address);
}

export function calculateSegmentPayment(decimals: BN, segmentPaymentInt: any) {
  return decimals.mul(web3.utils.toBN(segmentPaymentInt)); // equivalent to 10 Inbound Token
}

export function getCurveAndWMaticTokensContract(): {
  curveContract: any | undefined;
  wmaticContract: any | undefined;
} {
  let curveContract: any | undefined;
  let wmaticContract: any | undefined;

  const isLocalPolygon = isNetworkLocalPolygon();

  const providerConfigCurrentNetwork = isLocalPolygon
    ? providerConfig.providers["polygon"]
    : providerConfig.providers["celo"];

  if (isLocalPolygon) {
    if (configs.deployConfigs.strategy === "polygon-curve-stmatic-matic") {
      curveContract = new web3.eth.Contract(wmaticABI, providerConfigCurrentNetwork.tokens["ldo"].address);
    } else {
      curveContract = new web3.eth.Contract(wmaticABI, providerConfigCurrentNetwork.tokens["curve"].address);
    }
    wmaticContract = new web3.eth.Contract(wmaticABI, providerConfigCurrentNetwork.tokens["wmatic"].address);
  }

  return { curveContract, wmaticContract };
}
