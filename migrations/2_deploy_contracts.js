const abi = require("ethereumjs-abi");
const GoodGhostingContract = artifacts.require("Pool");
const StrategyArtifact = artifacts.require("MobiusStrategy");
const SafeMathLib = artifacts.require("SafeMath");

const config = require("../deploy/deploy.config");

function printSummary(
  // contract's constructor parameters
  {
    inboundCurrencyAddress,
    depositCount,
    segmentLength,
    waitingRoundSegmentLength,
    segmentPaymentWei,
    earlyWithdrawFee,
    adminFee,
    maxPlayersCount,
    flexibleDepositSegment,
    incentiveToken,
    strategy,
    mobiusPool,
    mobiusGauge,
    minter,
    mobi,
    celo,
  },
  // additional logging info
  { networkName, selectedProvider, inboundCurrencySymbol, segmentPayment, owner },
) {
  var poolParameterTypes = [
    "address", // inboundCurrencyAddress
    "uint256", // depositCount
    "uint256", // segmentLength
    "uint256", // waitingRoundSegmentLength
    "uint256", // segmentPaymentWei
    "uint256", // earlyWithdrawFee
    "uint256", // adminFee
    "uint256", // maxPlayersCount
    "bool", // flexibleDepositSegment
    "address", // incentiveToken
    "address", // strategy
  ];
  var poolParameterValues = [
    inboundCurrencyAddress,
    depositCount,
    segmentLength,
    waitingRoundSegmentLength,
    segmentPaymentWei,
    earlyWithdrawFee,
    adminFee,
    maxPlayersCount,
    flexibleDepositSegment,
    incentiveToken,
    strategy,
  ];

  var poolEncodedParameters = abi.rawEncode(poolParameterTypes, poolParameterValues);

  console.log("\n\n\n----------------------------------------------------");
  console.log("GoogGhosting Holding Pool deployed with the following arguments:");
  console.log("----------------------------------------------------\n");
  console.log(`Network Name: ${networkName}`);
  console.log(`Contract's Owner: ${owner}`);

  console.log(`Inbound Currency: ${inboundCurrencySymbol} at ${inboundCurrencyAddress}`);
  console.log(`Segment Count: ${depositCount}`);
  console.log(`Segment Length: ${segmentLength} seconds`);
  console.log(`Waiting Segment Length: ${waitingRoundSegmentLength} seconds`);
  console.log(`Segment Payment: ${segmentPayment} ${inboundCurrencySymbol} (${segmentPaymentWei} wei)`);
  console.log(`Early Withdrawal Fee: ${earlyWithdrawFee}%`);
  console.log(`Custom Pool Fee: ${adminFee}%`);
  console.log(`Max Quantity of Players: ${maxPlayersCount}`);
  console.log(`Flexible Deposit Pool: ${flexibleDepositSegment}`);
  console.log(`Incentive Token: ${incentiveToken}`);
  console.log(`Strategy: ${strategy}`);
  console.log("\n\nConstructor Arguments ABI-Encoded:");
  console.log(poolEncodedParameters.toString("hex"));
  console.log("\n\n\n\n");
}

module.exports = function (deployer, network, accounts) {
  // Injects network name into process .env variable to make accessible on test suite.
  process.env.NETWORK = network;

  // Skips migration for local tests and soliditycoverage
  if (["test", "soliditycoverage"].includes(network)) return;

  deployer.then(async () => {
    const poolConfigs = config.providers["celo"]["mobius"];
    const mobiusGauge = poolConfigs.gauge;
    const inboundCurrencyAddress = poolConfigs["cusd"].address;
    const inboundCurrencyDecimals = poolConfigs["cusd"].decimals;
    const segmentPaymentWei = (config.deployConfigs.segmentPayment * 10 ** inboundCurrencyDecimals).toString();
    const mobiusPool = poolConfigs.pool;
    const mobi = poolConfigs.mobi;
    const celo = poolConfigs.celo;
    const minter = poolConfigs.minter;
    const maxPlayersCount = config.deployConfigs.maxPlayersCount;
    const incentiveToken = poolConfigs.incentiveToken;
    const goodGhostingContract = GoodGhostingContract; // defaults to Ethereum version

    const strategyArgs = [StrategyArtifact, mobiusPool, mobiusGauge, minter, mobi, celo];
    await deployer.deploy(...strategyArgs);

    const strategyInstance = await StrategyArtifact.deployed();

    // Prepares deployment arguments
    const deploymentArgs = [
      goodGhostingContract,
      inboundCurrencyAddress,
      config.deployConfigs.depositCount,
      config.deployConfigs.segmentLength,
      config.deployConfigs.waitingRoundSegmentLength,
      segmentPaymentWei,
      config.deployConfigs.earlyWithdrawFee,
      config.deployConfigs.adminFee,
      maxPlayersCount,
      config.deployConfigs.flexibleSegmentPayment,
      incentiveToken,
      strategyInstance.address,
      false,
    ];

    // Deploys the Pool Contract
    await deployer.deploy(SafeMathLib);
    await deployer.link(SafeMathLib, goodGhostingContract);
    await deployer.deploy(...deploymentArgs);

    const ggInstance = await goodGhostingContract.deployed();

    await strategyInstance.transferOwnership(ggInstance.address);

    // Prints deployment summary
    printSummary(
      {
        inboundCurrencyAddress,
        depositCount: config.deployConfigs.depositCount,
        segmentLength: config.deployConfigs.segmentLength,
        waitingRoundSegmentLength: config.deployConfigs.waitingRoundSegmentLength,
        segmentPaymentWei,
        earlyWithdrawFee: config.deployConfigs.earlyWithdrawFee,
        adminFee: config.deployConfigs.adminFee,
        maxPlayersCount,
        flexibleDepositSegment: config.deployConfigs.flexibleSegmentPayment,
        incentiveToken,
        strategy: strategyInstance.address,
        mobiusPool,
        mobiusGauge,
        minter,
        mobi,
        celo,
      },
      {
        networkName: process.env.NETWORK,
        selectedProvider: config.deployConfigs.selectedProvider,
        inboundCurrencySymbol: config.deployConfigs.inboundCurrencySymbol,
        segmentPayment: config.deployConfigs.segmentPayment,
        owner: accounts[0],
      },
    );
  });
};
