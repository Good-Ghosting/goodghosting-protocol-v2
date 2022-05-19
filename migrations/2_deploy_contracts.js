const abi = require("ethereumjs-abi");
const GoodGhostingContract = artifacts.require("Pool");
const WhitelistedContract = artifacts.require("WhitelistedPool");
const MobiusStrategyArtifact = artifacts.require("MobiusStrategy");
const MoolaStrategyArtifact = artifacts.require("AaveStrategy");
const AaveV3StrategyArtifact = artifacts.require("AaveStrategyV3");
const CurveStrategyArtifact = artifacts.require("CurveStrategy");
const SafeMathLib = artifacts.require("SafeMath");
const fs = require("fs");
const config = require("../deploy.config");

function printSummary(
  // contract's constructor parameters
  {
    inboundCurrencyAddress,
    depositCount,
    maxFlexibleSegmentPaymentAmount,
    segmentLength,
    waitingRoundSegmentLength,
    segmentPaymentWei,
    earlyWithdrawFee,
    adminFee,
    maxPlayersCount,
    flexibleDepositSegment,
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
    curvePool,
    curveGauge,
    tokenIndex,
    poolType,
    curve,
    wmatic,
    lendingPoolAddressProviderAave,
    wethGatewayAave,
    dataProviderAave,
    incentiveControllerAave,
    incentiveTokenAave,
  },
  // additional logging info
  { networkName, inboundCurrencySymbol, segmentPayment, owner },
) {
  var poolParameterTypes = [
    "address", // inboundCurrencyAddress,
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
  var poolParameterValues = [
    inboundCurrencyAddress,
    maxFlexibleSegmentPaymentAmount,
    depositCount,
    segmentLength,
    waitingRoundSegmentLength,
    segmentPaymentWei,
    earlyWithdrawFee,
    adminFee,
    maxPlayersCount,
    flexibleDepositSegment,
    strategy,
    config.deployConfigs.isTransactionalToken,
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
    "address", // inbound currency address
  ];

  var moolaStrategyValues = [
    lendingPoolProvider,
    wethGateway,
    dataProvider,
    incentiveController,
    rewardToken,
    inboundCurrencyAddress,
  ];
  var aaveStrategyValues = [
    lendingPoolAddressProviderAave,
    wethGatewayAave,
    dataProviderAave,
    incentiveControllerAave,
    incentiveTokenAave,
    inboundCurrencyAddress,
  ];

  var curveStrategyParameterTypes = [
    "address", // curvePool
    "address", // tokenIndex
    "uint", // poolType
    "uint", // curveGauge
    "address", // wmatic
    "address", // curve
  ];

  var curveStrategyValues = [curvePool, tokenIndex, poolType, curveGauge, wmatic, curve];

  var poolEncodedParameters = abi.rawEncode(poolParameterTypes, poolParameterValues);
  var mobiusStrategylEncodedParameters = abi.rawEncode(mobiusStrategyParameterTypes, mobiusStrategyValues);
  var moolsStrategylEncodedParameters = abi.rawEncode(moolaStrategyParameterTypes, moolaStrategyValues);
  var curveStrategylEncodedParameters = abi.rawEncode(curveStrategyParameterTypes, curveStrategyValues);
  var aaveStrategylEncodedParameters = abi.rawEncode(moolaStrategyParameterTypes, aaveStrategyValues);

  console.log("\n\n\n----------------------------------------------------");
  console.log("GoodGhosting Holding Pool deployed with the following arguments:");
  console.log("----------------------------------------------------\n");
  console.log(`Network Name: ${networkName}`);
  console.log(`Contract's Owner: ${owner}`);

  console.log(`Inbound Currency: ${inboundCurrencyAddress}`);
  console.log(`Maximum Flexible Segment Payment Amount: ${maxFlexibleSegmentPaymentAmount}`);

  console.log(`Segment Count: ${depositCount}`);
  console.log(`Segment Length: ${segmentLength} seconds`);
  console.log(`Waiting Segment Length: ${waitingRoundSegmentLength} seconds`);
  console.log(`Segment Payment: ${segmentPayment} ${inboundCurrencySymbol} (${segmentPaymentWei} wei)`);
  console.log(`Early Withdrawal Fee: ${earlyWithdrawFee}%`);
  console.log(`Custom Pool Fee: ${adminFee}%`);
  console.log(`Max Quantity of Players: ${maxPlayersCount}`);
  console.log(`Flexible Deposit Pool: ${flexibleDepositSegment}`);
  console.log(`Transactional Token Depsoit Pool: ${config.deployConfigs.isTransactionalToken}`);

  console.log(`Strategy: ${strategy}`);
  if (
    networkName === "local-celo-mobius-dai" ||
    networkName === "celo-mobius-dai" ||
    networkName === "local-variable-celo-mobius-dai" ||
    networkName === "local-celo-mobius-usdc" ||
    networkName === "celo-mobius-usdc" ||
    networkName === "local-variable-celo-mobius-usdc"
  ) {
    console.log(`Mobius Pool: ${mobiusPool}`);
    console.log(`Mobius Gauge: ${mobiusGauge}`);
    console.log(`Mobius Minter: ${minter}`);
    console.log(`Mobi Token: ${mobi}`);
    console.log(`Celo Token: ${celo}`);
    console.log("Mobius Strategy Encoded Params: ", mobiusStrategylEncodedParameters.toString("hex"));
  } else if (
    networkName === "local-celo-moola" ||
    networkName === "local-variable-celo-moola" ||
    networkName === "celo-moola"
  ) {
    console.log(`Lending Pool Provider: ${lendingPoolProvider}`);
    console.log(`WETHGateway: ${wethGateway}`);
    console.log(`Data Provider: ${dataProvider}`);
    console.log(`IncentiveController: ${incentiveController}`);
    console.log(`Reward Token: ${rewardToken}`);
    console.log("Moola Strategy Encoded Params: ", moolsStrategylEncodedParameters.toString("hex"));
  } else if (networkName == "polygon-aave-v2" || networkName == "polygon-aave-v3") {
    console.log(`Lending Pool Provider: ${lendingPoolAddressProviderAave}`);
    console.log(`WETHGateway: ${wethGatewayAave}`);
    console.log(`Data Provider: ${dataProviderAave}`);
    console.log(`IncentiveController: ${incentiveControllerAave}`);
    console.log(`Reward Token: ${incentiveTokenAave}`);
    console.log("Aave Strategy Encoded Params: ", aaveStrategylEncodedParameters.toString("hex"));
  } else {
    console.log(`Curve Pool: ${curvePool}`);
    console.log(`Curve Gauge: ${curveGauge}`);
    console.log(`Token index: ${tokenIndex}`);
    console.log(`Pool Type: ${poolType}`);
    console.log(`Reward Token: ${wmatic}`);
    console.log(`Curve Token: ${curve}`);
    console.log("Curve Strategy Encoded Params: ", curveStrategylEncodedParameters.toString("hex"));
  }
  console.log("\n\nConstructor Arguments ABI-Encoded:");
  console.log(poolEncodedParameters.toString("hex"));
  console.log("\n\n\n\n");
}

module.exports = function (deployer, network, accounts) {
  // Injects network name into process .env variable to make accessible on test suite.
  process.env.NETWORK = network;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  // Skips migration for local tests and soliditycoverage
  if (["test", "soliditycoverage"].includes(network)) return;

  deployer.then(async () => {
    let maxFlexibleSegmentPaymentAmount, flexibleSegmentPayment;
    if (network.toString().includes("local-variable")) {
      flexibleSegmentPayment = true;
      maxFlexibleSegmentPaymentAmount = "1000000000000000000000";
    } else {
      flexibleSegmentPayment = config.deployConfigs.flexibleSegmentPayment;
      maxFlexibleSegmentPaymentAmount = config.deployConfigs.maxFlexibleSegmentPaymentAmount;
    }
    const mobiusPoolConfigs = network.includes("celo-mobius-dai")
      ? config.providers["celo"].strategies["mobius-cUSD-DAI"]
      : config.providers["celo"].strategies["mobius-cUSD-USDC"];
    const moolaPoolConfigs = config.providers["celo"].strategies["moola"];
    const curvePoolConfigs = network.includes("polygon-curve-aave")
      ? config.providers["polygon"].strategies["polygon-curve-aave"]
      : config.providers["polygon"].strategies["polygon-curve-atricrypto"];
    const aavePoolConfigs = network.includes("polygon-aave-v2")
      ? config.providers["polygon"].strategies["aaveV2"]
      : config.providers["polygon"].strategies["aaveV3"];
    const curvePool = curvePoolConfigs.pool;
    const curveGauge = curvePoolConfigs.gauge;
    const wmatic = config.providers["polygon"].tokens["wmatic"].address;
    const curve = config.providers["polygon"].tokens["curve"].address;
    const lendingPoolProvider = moolaPoolConfigs.lendingPoolAddressProvider;
    const dataProvider = moolaPoolConfigs.dataProvider;
    const mobiusGauge = mobiusPoolConfigs.gauge;
    const curveTokenIndex = curvePoolConfigs.tokenIndex;
    const curvePoolType = curvePoolConfigs.poolType;

    const inboundCurrencyAddress = network.includes("celo")
      ? config.providers["celo"].tokens[config.deployConfigs.inboundCurrencySymbol].address
      : config.providers["polygon"].tokens[config.deployConfigs.inboundCurrencySymbol].address;
    const inboundCurrencyDecimals = network.includes("celo")
      ? config.providers["celo"].tokens[config.deployConfigs.inboundCurrencySymbol].decimals
      : config.providers["polygon"].tokens[config.deployConfigs.inboundCurrencySymbol].decimals;
    const segmentPaymentWei = (config.deployConfigs.segmentPayment * 10 ** inboundCurrencyDecimals).toString();
    const mobiusPool = mobiusPoolConfigs.pool;
    const mobi = config.providers["celo"].tokens["mobi"].address;
    const celo = config.providers["celo"].tokens["celo"].address;
    const minter = mobiusPoolConfigs.minter;
    const maxPlayersCount = config.deployConfigs.maxPlayersCount;
    const goodGhostingContract = config.deployConfigs.isWhitelisted ? WhitelistedContract : GoodGhostingContract; // defaults to Ethereum version
    let strategyArgs;
    if (network.includes("celo-mobius")) {
      strategyArgs = [MobiusStrategyArtifact, mobiusPool, mobiusGauge, minter, mobi, celo];
    } else if (network.includes("celo-moola")) {
      strategyArgs = [
        MoolaStrategyArtifact,
        lendingPoolProvider,
        "0x0000000000000000000000000000000000000000",
        dataProvider,
        "0x0000000000000000000000000000000000000000",
        // wmatic address in case of aave deployments
        "0x0000000000000000000000000000000000000000",
        inboundCurrencyAddress,
      ];
    } else if (network.includes("polygon-aave")) {
      strategyArgs = [
        network.includes("polygon-aave-v2") ? MoolaStrategyArtifact : AaveV3StrategyArtifact,
        aavePoolConfigs.lendingPoolAddressProvider,
        aavePoolConfigs.wethGateway,
        aavePoolConfigs.dataProvider,
        aavePoolConfigs.incentiveController,
        wmatic,
        inboundCurrencyAddress,
      ];
    } else {
      strategyArgs = [CurveStrategyArtifact, curvePool, curveTokenIndex, curvePoolType, curveGauge, wmatic, curve];
    }
    const strategyTx = await deployer.deploy(...strategyArgs);
    let strategyInstance;
    if (network.includes("celo-mobius")) strategyInstance = await MobiusStrategyArtifact.deployed();
    else if (network.includes("celo-moola") || network.includes("polygon-aave"))
      strategyInstance = network.includes("polygon-aave-v3")
        ? await AaveV3StrategyArtifact.deployed()
        : await MoolaStrategyArtifact.deployed();
    else strategyInstance = await CurveStrategyArtifact.deployed();

    // Prepares deployment arguments
    let deploymentArgs = [
      goodGhostingContract,
      inboundCurrencyAddress,
      maxFlexibleSegmentPaymentAmount,
      config.deployConfigs.depositCount,
      config.deployConfigs.segmentLength,
      config.deployConfigs.waitingRoundSegmentLength,
      segmentPaymentWei,
      config.deployConfigs.earlyWithdrawFee,
      config.deployConfigs.adminFee,
      maxPlayersCount,
      flexibleSegmentPayment,
      strategyInstance.address,
      config.deployConfigs.isTransactionalToken,
    ];

    // Deploys the Pool Contract
    await deployer.deploy(SafeMathLib);
    await deployer.link(SafeMathLib, goodGhostingContract);
    const poolTx = await deployer.deploy(...deploymentArgs);
    const ggInstance = await goodGhostingContract.deployed();
    await strategyInstance.transferOwnership(ggInstance.address);

    if (config.deployConfigs.initialize) {
      config.deployConfigs.isWhitelisted
        ? await ggInstance.initializePool(config.deployConfigs.merkleroot, ZERO_ADDRESS)
        : await ggInstance.initialize(ZERO_ADDRESS);
    }

    const poolTxInfo = await web3.eth.getTransaction(poolTx.transactionHash);
    const strategyTxInfo = await web3.eth.getTransaction(strategyTx.transactionHash);

    const deploymentResult = {};
    if (network.includes("celo")) {
      deploymentResult.network = "celo";
    } else {
      deploymentResult.network = "polygon";
    }
    deploymentResult.poolOwner = accounts[0];
    deploymentResult.poolAddress = ggInstance.address;
    deploymentResult.poolDeploymentHash = poolTx.transactionHash;
    deploymentResult.poolDeploymentBlock = poolTxInfo.blockNumber;
    deploymentResult.strategyDeploymentHash = strategyTx.transactionHash;
    deploymentResult.strategyDeploymentBlock = strategyTxInfo.blockNumber;
    deploymentResult.strategyOwner = ggInstance.address;
    deploymentResult.strategyAddress = strategyInstance.address;
    deploymentResult.inboundCurrencyAddress = inboundCurrencyAddress;
    deploymentResult.maxFlexibleSegmentPaymentAmount = maxFlexibleSegmentPaymentAmount;
    deploymentResult.depositCount = config.deployConfigs.depositCount;
    deploymentResult.segmentLength = config.deployConfigs.segmentLength;
    deploymentResult.waitingRoundSegmentLength = config.deployConfigs.waitingRoundSegmentLength;
    deploymentResult.segmentPayment = config.deployConfigs.segmentPayment;
    deploymentResult.segmentPaymentWei = segmentPaymentWei;
    deploymentResult.earlyWithdrawFee = config.deployConfigs.earlyWithdrawFee;
    deploymentResult.adminFee = config.deployConfigs.adminFee;
    deploymentResult.maxPlayersCount = maxPlayersCount;
    deploymentResult.incentiveToken = config.deployConfigs.incentiveToken;
    deploymentResult.flexibleDepositSegment = flexibleSegmentPayment;
    deploymentResult.transactionalTokenDepositEnabled = config.deployConfigs.isTransactionalToken;
    var poolParameterTypes = [
      "address", // inboundCurrencyAddress,
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
    var poolParameterValues = [
      inboundCurrencyAddress,
      maxFlexibleSegmentPaymentAmount,
      config.deployConfigs.depositCount,
      config.deployConfigs.segmentLength,
      config.deployConfigs.waitingRoundSegmentLength,
      segmentPaymentWei,
      config.deployConfigs.earlyWithdrawFee,
      config.deployConfigs.adminFee,
      maxPlayersCount,
      flexibleSegmentPayment,
      strategyInstance.address,
      config.deployConfigs.isTransactionalToken,
    ];
    deploymentResult.poolEncodedParameters = abi.rawEncode(poolParameterTypes, poolParameterValues).toString("hex");

    if (
      deploymentResult.network === "local-celo-mobius-dai" ||
      deploymentResult.network === "celo-mobius-dai" ||
      deploymentResult.network === "local-variable-celo-mobius-dai" ||
      deploymentResult.network === "local-celo-mobius-usdc" ||
      deploymentResult.network === "celo-mobius-usdc" ||
      deploymentResult.network === "local-variable-celo-mobius-usdc"
    ) {
      deploymentResult.mobiusPoolAddress = mobiusPool;
      deploymentResult.mobiusGaugeAddress = mobiusGauge;
      deploymentResult.minterAddress = minter;
      deploymentResult.mobiAddress = mobi;
      deploymentResult.celoAddress = celo;

      var mobiusStrategyParameterTypes = ["address", "address", "address", "address", "address"];

      var mobiusStrategyValues = [mobiusPool, mobiusGauge, minter, mobi, celo];

      deploymentResult.strategyEncodedParameters = abi
        .rawEncode(mobiusStrategyParameterTypes, mobiusStrategyValues)
        .toString("hex");
    } else if (
      deploymentResult.network === "local-celo-moola" ||
      deploymentResult.network === "local-variable-celo-moola" ||
      deploymentResult.network === "celo-moola"
    ) {
      deploymentResult.lendingPoolProviderMoolaAddress = lendingPoolProvider;
      deploymentResult.wethGatewayMoolaAddress = "0x0000000000000000000000000000000000000000";
      deploymentResult.dataProviderMoolaAddress = dataProvider;
      deploymentResult.incentiveControllerMoolaAddress = "0x0000000000000000000000000000000000000000";
      deploymentResult.rewardTokenMoolaAddress = "0x0000000000000000000000000000000000000000";
      var moolaStrategyParameterTypes = ["address", "address", "address", "address", "address"];

      var moolaStrategyValues = [
        deploymentResult.lendingPoolProviderMoolaAddress,
        deploymentResult.wethGatewayMoolaAddress,
        deploymentResult.dataProviderMoolaAddress,
        deploymentResult.incentiveControllerMoolaAddress,
        deploymentResult.rewardTokenMoolaAddress,
      ];
      deploymentResult.strategyEncodedParameters = abi
        .rawEncode(moolaStrategyParameterTypes, moolaStrategyValues)
        .toString("hex");
    } else if (deploymentResult.network == "polygon-aave-v2" || deploymentResult.network == "polygon-aave-v3") {
      deploymentResult.lendingPoolProviderAaveAddress = aavePoolConfigs.lendingPoolAddressProvider;
      deploymentResult.wethGatewayAaveAddress = aavePoolConfigs.wethGateway;
      deploymentResult.dataProviderAaveAddress = aavePoolConfigs.dataProvider;
      deploymentResult.incentiveControllerAaveAddress = aavePoolConfigs.incentiveController;
      deploymentResult.rewardTokenAaveAddress = wmatic;
      var aaveStrategyParameterTypes = ["address", "address", "address", "address", "address", "address"];
      var aaveStrategyValues = [
        deploymentResult.lendingPoolProviderAaveAddress,
        deploymentResult.wethGatewayAaveAddress,
        deploymentResult.dataProviderAaveAddress,
        deploymentResult.incentiveControllerAaveAddress,
        deploymentResult.rewardTokenAaveAddress,
        deploymentResult.inboundCurrencyAddress,
      ];
      deploymentResult.strategyEncodedParameters = abi
        .rawEncode(aaveStrategyParameterTypes, aaveStrategyValues)
        .toString("hex");
    } else {
      deploymentResult.curvePoolAddress = curvePool;
      deploymentResult.curveGaugeAddress = curveGauge;
      deploymentResult.tokenIndex = curveTokenIndex;
      deploymentResult.poolType = curvePoolType;
      deploymentResult.rewardTokenAddress = wmatic;
      deploymentResult.curveTokenAddress = curve;

      var curveStrategyParameterTypes = ["address", "address", "uint", "uint", "address", "address"];
      var curveStrategyValues = [
        deploymentResult.curvePoolAddress,
        deploymentResult.curveGaugeAddress,
        deploymentResult.tokenIndex,
        deploymentResult.poolType,
        deploymentResult.rewardTokenAddress,
        deploymentResult.curveTokenAddress,
      ];
      deploymentResult.strategyEncodedParameters = abi
        .rawEncode(curveStrategyParameterTypes, curveStrategyValues)
        .toString("hex");
    }

    // Prints deployment summary
    printSummary(
      {
        inboundCurrencyAddress,
        depositCount: config.deployConfigs.depositCount,
        maxFlexibleSegmentPaymentAmount,
        segmentLength: config.deployConfigs.segmentLength,
        waitingRoundSegmentLength: config.deployConfigs.waitingRoundSegmentLength,
        segmentPaymentWei,
        earlyWithdrawFee: config.deployConfigs.earlyWithdrawFee,
        adminFee: config.deployConfigs.adminFee,
        maxPlayersCount,
        flexibleDepositSegment: flexibleSegmentPayment,
        strategy: strategyInstance.address,
        mobiusPool,
        mobiusGauge,
        minter,
        mobi,
        celo,
        lendingPoolProvider,
        wethGateway: "0x0000000000000000000000000000000000000000",
        dataProvider,
        incentiveController: "0x0000000000000000000000000000000000000000",
        rewardToken: config.deployConfigs.incentiveToken,
        curvePool,
        curveGauge,
        tokenIndex: curveTokenIndex,
        poolType: curvePoolType,
        curve,
        wmatic,
        lendingPoolAddressProviderAave: aavePoolConfigs.lendingPoolAddressProvider,
        wethGatewayAave: aavePoolConfigs.wethGateway,
        dataProviderAave: aavePoolConfigs.dataProvider,
        incentiveControllerAave: aavePoolConfigs.incentiveController,
        incentiveTokenAave: wmatic,
      },
      {
        networkName: process.env.NETWORK,
        inboundCurrencySymbol: config.deployConfigs.inboundCurrencySymbol,
        segmentPayment: config.deployConfigs.segmentPayment,
        owner: accounts[0],
      },
    );

    fs.writeFile("./deployment-result.json", JSON.stringify(deploymentResult, null, 4), err => {
      if (err) {
        console.error(err);
        return;
      }
      console.log("Deployment Result Documented");
    });
  });
};
