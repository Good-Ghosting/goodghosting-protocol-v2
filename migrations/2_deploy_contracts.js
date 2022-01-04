const abi = require("ethereumjs-abi");
const GoodGhostingContract = artifacts.require("Pool");
const MobiusStrategyArtifact = artifacts.require("MobiusStrategy");
const MoolaStrategyArtifact = artifacts.require("AaveStrategy");

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
    lendingPoolProvider,
    wethGateway,
    dataProvider,
    incentiveController,
    rewardToken,
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

  var mobiusStrategyParameterTypes = [
    "address", // mobius pool
    "address", // mobius gauge
    "address", // minter
    "address", // mobi
    "address", // celo
  ];

  var mobiusStrategyValues = [mobiusPool, mobiusGauge, minter, mobi, celo];

  var moolaStrategyParameterTypes = [
    "address", // lendingPoolProvider
    "address", // wethGateway
    "address", // dataProvider
    "address", // incentiveController
    "address", // rewardToken
  ];

  var moolaStrategyValues = [lendingPoolProvider, wethGateway, dataProvider, incentiveController, rewardToken];

  var poolEncodedParameters = abi.rawEncode(poolParameterTypes, poolParameterValues);
  var mobiusStrategylEncodedParameters = abi.rawEncode(mobiusStrategyParameterTypes, mobiusStrategyValues);
  var moolsStrategylEncodedParameters = abi.rawEncode(moolaStrategyParameterTypes, moolaStrategyValues);

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
  if (networkName === "local-celo-mobius") {
    console.log(`Mobius Pool: ${mobiusPool}`);
    console.log(`Mobius Gauge: ${mobiusGauge}`);
    console.log(`Mobius Minter: ${minter}`);
    console.log(`Mobi Token: ${mobi}`);
    console.log(`Celo Token: ${celo}`);
    console.log("Mobius Strategy Encoded Params: ", mobiusStrategylEncodedParameters.toString("hex"));
  } else {
    console.log(`Lending Pool Provider: ${lendingPoolProvider}`);
    console.log(`WETHGateway: ${wethGateway}`);
    console.log(`Data Provider: ${dataProvider}`);
    console.log(`IncentiveController: ${incentiveController}`);
    console.log(`Reward Token: ${rewardToken}`);
    console.log("Moola Strategy Encoded Params: ", moolsStrategylEncodedParameters.toString("hex"));
  }
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
    const mobiusPoolConfigs = config.providers["celo"]["mobius"];
    const moolaPoolConfigs = config.providers["celo"]["moola"];
    const lendingPoolProvider = moolaPoolConfigs.lendingPoolAddressProvider;
    const dataProvider = moolaPoolConfigs.dataProvider;
    const mobiusGauge = mobiusPoolConfigs.gauge;
    const inboundCurrencyAddress = mobiusPoolConfigs["cusd"].address;
    const inboundCurrencyDecimals = mobiusPoolConfigs["cusd"].decimals;
    const segmentPaymentWei = (config.deployConfigs.segmentPayment * 10 ** inboundCurrencyDecimals).toString();
    const mobiusPool = mobiusPoolConfigs.pool;
    const mobi = mobiusPoolConfigs.mobi;
    const celo = mobiusPoolConfigs.celo;
    const minter = mobiusPoolConfigs.minter;
    const maxPlayersCount = config.deployConfigs.maxPlayersCount;
    const incentiveToken = mobiusPoolConfigs.incentiveToken;
    const goodGhostingContract = GoodGhostingContract; // defaults to Ethereum version
    let strategyArgs;
    if (network === "local-celo-mobius")
      strategyArgs = [MobiusStrategyArtifact, mobiusPool, mobiusGauge, minter, mobi, celo];
    else
      strategyArgs = [
        MoolaStrategyArtifact,
        lendingPoolProvider,
        moolaPoolConfigs.wethGateway,
        dataProvider,
        moolaPoolConfigs.incentiveController,
        moolaPoolConfigs.incentiveToken,
      ];

    await deployer.deploy(...strategyArgs);
    let strategyInstance;
    if (network === "local-celo-mobius") strategyInstance = await MobiusStrategyArtifact.deployed();
    else strategyInstance = await MoolaStrategyArtifact.deployed();

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
        lendingPoolProvider,
        wethGateway: moolaPoolConfigs.wethGateway,
        dataProvider,
        incentiveController: moolaPoolConfigs.incentiveController,
        rewardToken: moolaPoolConfigs.incentiveToken,
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
