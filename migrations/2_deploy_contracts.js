const abi = require("ethereumjs-abi");
const axios = require("axios");
const BN = require("bn.js");
const GoodGhostingContract = artifacts.require("Pool");
const WhitelistedContract = artifacts.require("WhitelistedPool");
const MobiusStrategyArtifact = artifacts.require("MobiusStrategy");
const MoolaStrategyArtifact = artifacts.require("AaveStrategy");
const AaveV3StrategyArtifact = artifacts.require("AaveStrategyV3");
const CurveStrategyArtifact = artifacts.require("CurveStrategy");
const NoExternalStrategyArtifact = artifacts.require("NoExternalStrategy");

const fs = require("fs");
const config = require("../deploy.config");
const providerConfig = require("../providers.config");

module.exports = function (deployer, network, accounts) {
  // Injects network name into process .env variable to make accessible on test suite.
  process.env.NETWORK = network;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const MAX_PLAYER_COUNT = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

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

    const strategyConfig =
      providerConfig.providers[
        network.includes("celo")
          ? network.includes("test-celo")
            ? "alfajores"
            : "celo"
          : network.includes("test-polygon")
          ? "mumbai"
          : "polygon"
      ].strategies[config.deployConfigs.strategy];

    const inboundCurrencyAddress = network.includes("celo")
      ? network.includes("test-celo")
        ? providerConfig.providers["alfajores"].tokens[config.deployConfigs.inboundCurrencySymbol].address
        : providerConfig.providers["celo"].tokens[config.deployConfigs.inboundCurrencySymbol].address
      : network.includes("test-polygon")
      ? providerConfig.providers["mumbai"].tokens[config.deployConfigs.inboundCurrencySymbol].address
      : providerConfig.providers["polygon"].tokens[config.deployConfigs.inboundCurrencySymbol].address;
    const inboundCurrencyDecimals = network.includes("celo")
      ? network.includes("test-celo")
        ? providerConfig.providers["alfajores"].tokens[config.deployConfigs.inboundCurrencySymbol].decimals
        : providerConfig.providers["celo"].tokens[config.deployConfigs.inboundCurrencySymbol].decimals
      : network.includes("test-polygon")
      ? providerConfig.providers["mumbai"].tokens[config.deployConfigs.inboundCurrencySymbol].decimals
      : providerConfig.providers["polygon"].tokens[config.deployConfigs.inboundCurrencySymbol].decimals;
    const segmentPaymentWei = (config.deployConfigs.segmentPayment * 10 ** inboundCurrencyDecimals).toString();
    const maxFlexibleSegmentPaymentAmountWei = (
      maxFlexibleSegmentPaymentAmount *
      10 ** inboundCurrencyDecimals
    ).toString();

    let maxPlayersCount;
    if (config.deployConfigs.maxPlayersCount && config.deployConfigs.maxPlayersCount != "") {
      maxPlayersCount = config.deployConfigs.maxPlayersCount;
    } else {
      maxPlayersCount = MAX_PLAYER_COUNT;
    }
    const goodGhostingContract = config.deployConfigs.isWhitelisted ? WhitelistedContract : GoodGhostingContract; // defaults to Ethereum version
    let strategyArgs;
    if (config.deployConfigs.strategy === "mobius-cUSD-DAI" || config.deployConfigs.strategy === "mobius-cUSD-USDC") {
      strategyArgs = [
        MobiusStrategyArtifact,
        strategyConfig.pool,
        strategyConfig.gauge,
        strategyConfig.minter,
        providerConfig.providers["celo"].tokens["mobi"].address,
        providerConfig.providers["celo"].tokens["celo"].address,
      ];
    } else if (config.deployConfigs.strategy === "moola") {
      strategyArgs = [
        MoolaStrategyArtifact,
        strategyConfig.lendingPoolAddressProvider,
        "0x0000000000000000000000000000000000000000",
        strategyConfig.dataProvider,
        "0x0000000000000000000000000000000000000000",
        // wmatic address in case of aave deployments
        "0x0000000000000000000000000000000000000000",
        inboundCurrencyAddress,
      ];
    } else if (config.deployConfigs.strategy === "aaveV2" || config.deployConfigs.strategy === "aaveV3") {
      strategyArgs = [
        config.deployConfigs.strategy === "aaveV2" ? MoolaStrategyArtifact : AaveV3StrategyArtifact,
        strategyConfig.lendingPoolAddressProvider,
        strategyConfig.wethGateway,
        strategyConfig.dataProvider,
        strategyConfig.incentiveController,
        network.includes("test-polygon")
          ? providerConfig.providers["mumbai"].tokens["wmatic"].address
          : providerConfig.providers["polygon"].tokens["wmatic"].address,
        inboundCurrencyAddress,
      ];
    } else if (config.deployConfigs.strategy === "no-external-strategy") {
      strategyArgs = [NoExternalStrategyArtifact, inboundCurrencyAddress, config.deployConfigs.rewardTokens];
    } else {
      strategyArgs = [
        CurveStrategyArtifact,
        strategyConfig.pool,
        strategyConfig.tokenIndex,
        strategyConfig.poolType,
        strategyConfig.gauge,
        providerConfig.providers["polygon"].tokens["wmatic"].address,
        providerConfig.providers["polygon"].tokens["curve"].address,
      ];
    }
    const deploymentResult = {};
    // converting to 1 eth worth of gwei default for celo
    let gasPrice = new BN("1").mul(new BN(10 ** 9));
    if (network.includes("celo")) {
      deploymentResult.network = "celo";
    } else {
      deploymentResult.network = "polygon";
      const payload = await axios.get("https://gasstation-mainnet.matic.network");
      // converting to 1 eth worth of gwei
      gasPrice = new BN(payload.data.fast).mul(new BN(10 ** 9));
    }
    const strategyTx = await deployer.deploy(...strategyArgs, { gasPrice: gasPrice });
    let strategyInstance;
    if (config.deployConfigs.strategy === "mobius-cUSD-DAI" || config.deployConfigs.strategy === "mobius-cUSD-USDC")
      strategyInstance = await MobiusStrategyArtifact.deployed();
    else if (
      config.deployConfigs.strategy === "moola" ||
      config.deployConfigs.strategy === "aaveV2" ||
      config.deployConfigs.strategy === "aaveV3"
    )
      strategyInstance =
        config.deployConfigs.strategy == "aaveV3"
          ? await AaveV3StrategyArtifact.deployed()
          : await MoolaStrategyArtifact.deployed();
    else if (config.deployConfigs.strategy === "no-external-strategy")
      strategyInstance = await NoExternalStrategyArtifact.deployed();
    else strategyInstance = await CurveStrategyArtifact.deployed();

    // Prepares deployment arguments
    let deploymentArgs = [
      goodGhostingContract,
      inboundCurrencyAddress,
      maxFlexibleSegmentPaymentAmountWei,
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
    const poolTx = await deployer.deploy(...deploymentArgs, { gasPrice: gasPrice });
    const ggInstance = await goodGhostingContract.deployed();

    if (config.deployConfigs.owner && config.deployConfigs.owner != "0x") {
      await ggInstance.transferOwnership(config.deployConfigs.owner);
    }
    await strategyInstance.transferOwnership(ggInstance.address);

    if (config.deployConfigs.initialize) {
      config.deployConfigs.isWhitelisted
        ? await ggInstance.initializePool(config.deployConfigs.merkleroot, config.deployConfigs.incentiveToken)
        : await ggInstance.initialize(config.deployConfigs.incentiveToken);
    }
    const poolTxInfo = await web3.eth.getTransaction(poolTx.transactionHash);
    const strategyTxInfo = await web3.eth.getTransaction(strategyTx.transactionHash);

    deploymentResult.poolOwner = accounts[0];
    deploymentResult.poolAddress = ggInstance.address;
    deploymentResult.poolDeploymentHash = poolTx.transactionHash;
    deploymentResult.poolDeploymentBlock = poolTxInfo.blockNumber;
    deploymentResult.strategyName = config.deployConfigs.strategy;
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
    deploymentResult.performanceFee = config.deployConfigs.adminFee;
    deploymentResult.maxPlayersCount = maxPlayersCount;
    deploymentResult.incentiveTokenAddress = config.deployConfigs.incentiveToken;
    deploymentResult.flexibleDepositSegment = flexibleSegmentPayment;
    deploymentResult.transactionalTokenDepositEnabled = config.deployConfigs.isTransactionalToken;
    deploymentResult.rewardTokenAdddresses = await strategyInstance.getRewardTokens();
    if (config.deployConfigs.isWhitelisted) {
      deploymentResult.merkleroot = config.deployConfigs.merkleroot;
    }
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

    if (config.deployConfigs.strategy === "mobius-cUSD-DAI" || config.deployConfigs.strategy === "mobius-cUSD-USDC") {
      deploymentResult.mobiusPoolAddress = strategyConfig.pool;
      deploymentResult.mobiusGaugeAddress = strategyConfig.gauge;
      deploymentResult.mobiusMinterAddress = strategyConfig.minter;
      deploymentResult.strategyMobiAddress = providerConfig.providers["celo"].tokens["mobi"].address;
      deploymentResult.strategyCeloAddress = providerConfig.providers["celo"].tokens["celo"].address;
      var mobiusStrategyParameterTypes = ["address", "address", "address", "address", "address"];

      var mobiusStrategyValues = [
        deploymentResult.mobiusPoolAddress,
        deploymentResult.mobiusGaugeAddress,
        deploymentResult.mobiusMinterAddress,
        deploymentResult.strategyMobiAddress,
        deploymentResult.strategyCeloAddress,
      ];

      deploymentResult.strategyEncodedParameters = abi
        .rawEncode(mobiusStrategyParameterTypes, mobiusStrategyValues)
        .toString("hex");
    } else if (config.deployConfigs.strategy === "moola") {
      deploymentResult.lendingPoolProviderMoolaAddress = strategyConfig.lendingPoolAddressProvider;
      deploymentResult.wethGatewayMoolaAddress = "0x0000000000000000000000000000000000000000";
      deploymentResult.dataProviderMoolaAddress = strategyConfig.dataProvider;
      deploymentResult.incentiveControllerMoolaAddress = "0x0000000000000000000000000000000000000000";
      deploymentResult.rewardTokenMoolaAddress = "0x0000000000000000000000000000000000000000";
      var moolaStrategyParameterTypes = ["address", "address", "address", "address", "address", "address"];

      var moolaStrategyValues = [
        deploymentResult.lendingPoolProviderMoolaAddress,
        deploymentResult.wethGatewayMoolaAddress,
        deploymentResult.dataProviderMoolaAddress,
        deploymentResult.incentiveControllerMoolaAddress,
        deploymentResult.rewardTokenMoolaAddress,
        deploymentResult.inboundCurrencyAddress,
      ];
      deploymentResult.strategyEncodedParameters = abi
        .rawEncode(moolaStrategyParameterTypes, moolaStrategyValues)
        .toString("hex");
    } else if (config.deployConfigs.strategy === "aaveV2" || config.deployConfigs.strategy === "aaveV3") {
      deploymentResult.lendingPoolProviderAaveAddress = strategyConfig.lendingPoolAddressProvider;
      deploymentResult.wethGatewayAaveAddress = strategyConfig.wethGateway;
      deploymentResult.dataProviderAaveAddress = strategyConfig.dataProvider;
      deploymentResult.incentiveControllerAaveAddress = strategyConfig.incentiveController;
      deploymentResult.rewardTokenAaveAddress = providerConfig.providers["polygon"].tokens["wmatic"].address;
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
    } else if (config.deployConfigs.strategy === "no-external-strategy") {
      var noExternalStrategyParameterTypes = ["address", "address[]"];
      var noExternalStrategyValues = [deploymentResult.inboundCurrencyAddress, deploymentResult.rewardTokenAdddresses];
      deploymentResult.strategyEncodedParameters = abi
        .rawEncode(noExternalStrategyParameterTypes, noExternalStrategyValues)
        .toString("hex");
    } else {
      deploymentResult.curvePoolAddress = strategyConfig.pool;
      deploymentResult.curveGaugeAddress = strategyConfig.gauge;
      deploymentResult.strategyTokenIndex = strategyConfig.tokenIndex;
      deploymentResult.strategyPoolType = strategyConfig.poolType;
      deploymentResult.strategyRewardTokenAddress = providerConfig.providers["polygon"].tokens["wmatic"].address;
      deploymentResult.strategyCurveTokenAddress = providerConfig.providers["polygon"].tokens["curve"].address;

      var curveStrategyParameterTypes = ["address", "address", "uint", "uint", "address", "address"];
      var curveStrategyValues = [
        deploymentResult.curvePoolAddress,
        deploymentResult.curveGaugeAddress,
        deploymentResult.strategyTokenIndex,
        deploymentResult.strategyPoolType,
        deploymentResult.strategyRewardTokenAddress,
        deploymentResult.strategyCurveTokenAddress,
      ];
      deploymentResult.strategyEncodedParameters = abi
        .rawEncode(curveStrategyParameterTypes, curveStrategyValues)
        .toString("hex");
    }

    fs.writeFileSync("./deployment-result.json", JSON.stringify(deploymentResult, null, 4), err => {
      if (err) {
        console.error(err);
        throw new Error(`Error while writing deployment logs to file: ${err}`);
      }
      console.log("Deployment Result Documented");
    });
  });
};
