import { ethers } from "hardhat";
const { providers, deployConfigs } = require("../deploy.config");
const abi = require("ethereumjs-abi");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (deployer === undefined) throw new Error("Deployer is undefined.");
  console.log("Deploying contracts with the account:", deployer.address);
  const segmentPaymentWei = (
    deployConfigs.segmentPayment *
    10 ** providers["aave"]["polygon"]["dai"].decimals
  ).toString();

  console.log("Account balance:", (await deployer.getBalance()).toString());
  const AaveStrategy = await ethers.getContractFactory("AaveStrategy");
  const strategy = await AaveStrategy.deploy(
    providers["aave"]["polygon"].lendingPoolAddressProvider,
    providers["aave"]["polygon"].wethGateway,
    providers["aave"]["polygon"].dataProvider,
    providers["aave"]["polygon"].incentiveController,
    providers["aave"]["polygon"].wmatic,
  );

  console.log("Strategy Address:", strategy.address);

  const Pool = await ethers.getContractFactory("Pool");
  const pool = await Pool.deploy(
    providers["aave"]["polygon"]["dai"].address,
    0,
    deployConfigs.depositCount.toString(),
    segmentPaymentWei.toString(),
    deployConfigs.waitingRoundSegmentLength.toString(),
    deployConfigs.segmentPayment.toString(),
    deployConfigs.earlyWithdrawFee.toString(),
    deployConfigs.adminFee.toString(),
    deployConfigs.maxPlayersCount.toString(),
    deployConfigs.flexibleSegmentPayment,
    strategy.address,
    deployConfigs.isTransactionalToken,
  );

  console.log("Pool Address:", pool.address);
  await strategy.transferOwnership(pool.address);
  console.log("Ownership Transferred");
  await pool.initialize();

  var poolParameterTypes = [
    "address", // inboundCurrencyAddress
    "uint256", // maxFlexibleSegmentPaymentAmount
    "uint256", // depositCount
    "uint256", // segmentLength
    "uint256", // waitingRoundSegmentLength
    "uint256", // segmentPaymentWei
    "uint256", // earlyWithdrawFee
    "uint256", // adminFee
    "uint256", // maxPlayersCount
    "bool", // flexibleDepositSegment
    "address", // strategy
    "bool", // isTransactionalToken
  ];
  // Generating Deployment Logs
  var poolParameterValues = [
    providers["aave"]["polygon"]["dai"].address,
    0,
    deployConfigs.depositCount.toString(),
    deployConfigs.segmentLength.toString(),
    deployConfigs.waitingRoundSegmentLength.toString(),
    deployConfigs.segmentPayment.toString(),
    deployConfigs.earlyWithdrawFee.toString(),
    deployConfigs.adminFee.toString(),
    deployConfigs.maxPlayersCount.toString(),
    deployConfigs.flexibleSegmentPayment,
    strategy.address,
    deployConfigs.isTransactionalToken,
  ];

  var aaveStrategyParameterTypes = [
    "address", // lendingPoolProvider
    "address", // wethGateway
    "address", // dataProvider
    "address", // incentiveController
    "address", // rewardToken
  ];

  var aaveStrategyValues = [
    providers["aave"]["polygon"].lendingPoolAddressProvider,
    providers["aave"]["polygon"].wethGateway,
    providers["aave"]["polygon"].dataProvider,
    providers["aave"]["polygon"].incentiveController,
    providers["aave"]["polygon"].wmatic,
  ];

  var poolEncodedParameters = abi.rawEncode(poolParameterTypes, poolParameterValues);
  var aaveStrategylEncodedParameters = abi.rawEncode(aaveStrategyParameterTypes, aaveStrategyValues);

  console.log("\n\n\n----------------------------------------------------");
  console.log("GoogGhosting Holding Pool deployed with the following arguments:");
  console.log("----------------------------------------------------\n");
  console.log(`Network Name: Polygon`);
  console.log(`Contract's Owner: ${deployer.address}`);

  console.log(
    `Inbound Currency: ${deployConfigs.inboundCurrencySymbol} at ${providers["aave"]["polygon"]["dai"].address}`,
  );
  console.log(`Maximum Flexible Segment Payment Amount: ${0}`);

  console.log(`Segment Count: ${deployConfigs.depositCount}`);
  console.log(`Segment Length: ${deployConfigs.segmentLength} seconds`);
  console.log(`Waiting Segment Length: ${deployConfigs.waitingRoundSegmentLength} seconds`);
  console.log(
    `Segment Payment: ${deployConfigs.segmentPayment} ${deployConfigs.inboundCurrencySymbol} (${segmentPaymentWei} wei)`,
  );
  console.log(`Early Withdrawal Fee: ${deployConfigs.earlyWithdrawFee}%`);
  console.log(`Custom Pool Fee: ${deployConfigs.adminFee}%`);
  console.log(`Max Quantity of Players: ${deployConfigs.maxPlayersCount}`);
  console.log(`Flexible Deposit Pool: ${deployConfigs.flexibleSegmentPayment}`);
  console.log(`Transactional Token Depsoit Pool: ${deployConfigs.isTransactionalToken}`);
  console.log(`Strategy: ${strategy.address}`);
  console.log(`Lending Pool Provider: ${providers["aave"]["polygon"].lendingPoolAddressProvider}`);
  console.log(`WETHGateway: ${providers["aave"]["polygon"].wethGateway}`);
  console.log(`Data Provider: ${providers["aave"]["polygon"].dataProvider}`);
  console.log(`IncentiveController: ${providers["aave"]["polygon"].incentiveController}`);
  console.log(`Reward Token: ${providers["aave"]["polygon"].wmatic}`);
  console.log("Aave Strategy Encoded Params: ", aaveStrategylEncodedParameters.toString("hex"));
  console.log("\n\nConstructor Arguments ABI-Encoded:");
  console.log(poolEncodedParameters.toString("hex"));
  console.log("\n\n\n\n");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
