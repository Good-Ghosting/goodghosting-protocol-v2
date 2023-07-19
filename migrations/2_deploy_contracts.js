/* global console, process, web3 */

const abi = require("ethereumjs-abi");
const axios = require("axios");
const GoodGhostingContract = artifacts.require("Pool");
// const WhitelistedContract = artifacts.require("WhitelistedPool");
const MobiusStrategyArtifact = artifacts.require("MobiusStrategy");
const MoolaStrategyArtifact = artifacts.require("AaveStrategy");
const AaveV3StrategyArtifact = artifacts.require("AaveStrategyV3");
const CurveStrategyArtifact = artifacts.require("CurveStrategy");
const NoExternalStrategyArtifact = artifacts.require("NoExternalStrategy");
const RegistryAbi = require("../abi-external/registry.json");

const fs = require("fs");
const ethers = require("ethers");
const config = require("../deploy.config");
const providerConfig = require("../providers.config");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Immutable
const OPERATOR_ROLE = "0x97667070c54ef182b0f5858b034beac1b6f3089aa2d3188bb1e8929f4fa9b929";
const POLYGON_GAS_STATION_URL = "https://gasstation.polygon.technology/v2";

// used for amm strategies
const tokenIndexMapping = {
  "polygon-curve-aave": {
    dai: 0,
    usdc: 1,
    usdt: 2,
  },
  "polygon-curve-atricrypto": {
    dai: 0,
    usdc: 1,
    usdt: 2,
    wbtc: 3,
    weth: 4,
  },
  "polygon-curve-stmatic-matic": {
    stmatic: 0,
    wmatic: 1,
  },
  "mobius-cUSD-DAI": {
    cusd: 0,
    dai: 1,
  },
  "mobius-cUSD-USDC": {
    cusd: 0,
    usdc: 1,
  },
  "mobius-celo-stCelo": {
    celo: 0,
    rstCelo: 1,
  },
  "mobius-cusd-usdcet": {
    cusd: 0,
    usdcet: 1,
  },
  "celo-curve-tripool": {
    cusd: 0,
    usdc: 1,
    usdt: 2,
  },
};

function getProviderNetworkName(network) {
  if (network.includes("celo")) {
    return network.includes("test-celo") ? "alfajores" : "celo";
  }

  if (network.includes("polygon")) {
    return network.includes("test-polygon") ? "mumbai" : "polygon";
  }

  if (network.includes("base")) {
    return network.includes("test-base") ? "baseGoerli" : "base";
  }
  throw new Error("Unsupported network provider configs");
}

module.exports = function (deployer, network, accounts) {
  // Injects network name into process .env variable to make accessible on test suite.
  process.env.NETWORK = network;
  const MAX_PLAYER_COUNT = "18446744073709551615";

  // Skips migration for local tests and soliditycoverage
  if (["test", "soliditycoverage"].includes(network)) return;

  deployer.then(async () => {
    const deployerAccount = accounts[0];
    // eslint-disable-next-line no-undef
    console.log("Deployer account: ", deployerAccount);

    const maxFlexibleSegmentPaymentAmount = config.deployConfigs.maxFlexibleSegmentPaymentAmount;
    const flexibleSegmentPayment = config.deployConfigs.flexibleSegmentPayment;
    const providerNetwork = getProviderNetworkName(network);
    const strategyConfig = providerConfig.providers[providerNetwork].strategies[config.deployConfigs.strategy];
    const inboundCurrencyAddress =
      providerConfig.providers[providerNetwork].tokens[config.deployConfigs.inboundCurrencySymbol].address;
    const inboundCurrencyDecimals =
      providerConfig.providers[providerNetwork].tokens[config.deployConfigs.inboundCurrencySymbol].decimals;

    const segmentPaymentWei = ethers.utils
      .parseUnits(config.deployConfigs.segmentPayment.toString(), inboundCurrencyDecimals)
      .toString();

    const maxFlexibleSegmentPaymentAmountWei = ethers.utils
      .parseUnits(maxFlexibleSegmentPaymentAmount.toString(), inboundCurrencyDecimals)
      .toString();
    let maxPlayersCount;
    if (config.deployConfigs.maxPlayersCount && config.deployConfigs.maxPlayersCount != "") {
      maxPlayersCount = config.deployConfigs.maxPlayersCount;
    } else {
      maxPlayersCount = MAX_PLAYER_COUNT;
    }
    const goodGhostingContract = GoodGhostingContract; //config.deployConfigs.isWhitelisted ? WhitelistedContract : GoodGhostingContract; // defaults to Ethereum version
    let strategyArgs;
    if (
      config.deployConfigs.strategy === "mobius-cUSD-DAI" ||
      config.deployConfigs.strategy === "mobius-cUSD-USDC" ||
      config.deployConfigs.strategy === "mobius-celo-stCelo" ||
      config.deployConfigs.strategy === "mobius-cusd-usdcet"
    ) {
      strategyArgs = [
        MobiusStrategyArtifact,
        strategyConfig.pool,
        strategyConfig.gauge,
        strategyConfig.minter,
        strategyConfig.lpToken,
        tokenIndexMapping[config.deployConfigs.strategy][config.deployConfigs.inboundCurrencySymbol],
        strategyConfig.rewardTokens,
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
        providerConfig.providers[providerNetwork].tokens["wmatic"].address,
        inboundCurrencyAddress,
      ];
    } else if (config.deployConfigs.strategy === "open") {
      strategyArgs = [NoExternalStrategyArtifact, inboundCurrencyAddress, config.deployConfigs.rewardTokens];
    } else {
      strategyArgs = [
        CurveStrategyArtifact,
        strategyConfig.pool,
        tokenIndexMapping[config.deployConfigs.strategy][config.deployConfigs.inboundCurrencySymbol],
        strategyConfig.poolType,
        strategyConfig.gauge,
        strategyConfig.gaugeMinter,
        strategyConfig.rewardTokens,
      ];
    }
    const deploymentResult = {};
    let txGasConfig = undefined;
    // converting to 1 eth worth of gwei default for celo
    if (network.includes("celo")) {
      deploymentResult.network = "celo";
      txGasConfig = { gasPrice: ethers.utils.parseUnits("5", "gwei").toString() };
    } else if (network.includes("polygon")) {
      deploymentResult.network = "polygon";
      try {
        const payload = await axios.get(POLYGON_GAS_STATION_URL);
        // eslint-disable-next-line no-undef
        console.log("gas price options:", payload.data);
        const roundedMaxPriorityFee = Math.round(payload.data.fast.maxPriorityFee).toString();
        const roundedMaxFee = Math.round(payload.data.fast.maxFee).toString();
        txGasConfig = {
          maxPriorityFeePerGas: ethers.utils.parseUnits(roundedMaxPriorityFee, "gwei").toString(),
          maxFeePerGas: ethers.utils.parseUnits(roundedMaxFee, "gwei").toString(),
        };
      } catch (error) {
        // eslint-disable-next-line no-undef
        console.log(`error fetching gas price from "${POLYGON_GAS_STATION_URL}".`);
        // eslint-disable-next-line no-undef
        console.log("error details:");
        // eslint-disable-next-line no-undef
        console.log(error);
        // eslint-disable-next-line no-undef
        console.log(`using polygon's fallback gas price configs`);
        txGasConfig = {
          maxPriorityFeePerGas: ethers.utils.parseUnits("550", "gwei").toString(),
          maxFeePerGas: ethers.utils.parseUnits("60", "gwei").toString(),
        };
      }
    } else if (network.includes("test-base")) {
      txGasConfig = {
        maxPriorityFeePerGas: ethers.utils.parseUnits("90", "wei").toString(),
        maxFeePerGas: ethers.utils.parseUnits("120", "wei").toString(),
      };
    } else if (network.includes("base")) {
      txGasConfig = {
        maxPriorityFeePerGas: ethers.utils.parseUnits("90", "wei").toString(),
        maxFeePerGas: ethers.utils.parseUnits("120", "wei").toString(),
      };
    }

    // eslint-disable-next-line no-undef
    console.log("gas price used:", txGasConfig);
    const strategyTx = await deployer.deploy(...strategyArgs, txGasConfig);
    let strategyInstance;
    if (
      config.deployConfigs.strategy === "mobius-cUSD-DAI" ||
      config.deployConfigs.strategy === "mobius-cUSD-USDC" ||
      config.deployConfigs.strategy === "mobius-celo-stCelo" ||
      config.deployConfigs.strategy === "mobius-cusd-usdcet"
    )
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
    else if (config.deployConfigs.strategy === "open") strategyInstance = await NoExternalStrategyArtifact.deployed();
    else strategyInstance = await CurveStrategyArtifact.deployed();

    // Prepares deployment arguments
    let deploymentArgs = [
      goodGhostingContract,
      config.deployConfigs.isTransactionalToken ? ZERO_ADDRESS : inboundCurrencyAddress,
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
    const poolTx = await deployer.deploy(...deploymentArgs, txGasConfig);
    const ggInstance = await goodGhostingContract.deployed();
    let poolOwnerAccount = deployerAccount;

    // Transfer strategy ownership to pool
    console.log(
      `\n\nStarting... Transfer ownership of strategy contract "${strategyInstance.address}" to pool contract "${ggInstance.address}"`,
    );
    await strategyInstance.transferOwnership(ggInstance.address, { ...txGasConfig });
    console.log(
      `Completed... Transferred ownership of strategy contract "${strategyInstance.address}" to pool contract "${ggInstance.address}"`,
    );

    // Initialize pool if applicable
    if (config.deployConfigs.initialize) {
      console.log(`\n\nStarting... Initialize pool contract "${ggInstance.address}" with params:`);
      console.log(`merkleRoot: "${config.deployConfigs.isWhitelisted ? config.deployConfigs.merkleroot : ""}"`);
      console.log(`incentive token: "${config.deployConfigs.incentiveToken}"`);
      config.deployConfigs.isWhitelisted
        ? await ggInstance.initializePool(config.deployConfigs.merkleroot, config.deployConfigs.incentiveToken, {
            ...txGasConfig,
          })
        : await ggInstance.initialize(config.deployConfigs.incentiveToken, { ...txGasConfig });
      console.log(`Completed... Initialize pool contract "${ggInstance.address}"`);
    }

    // Transfer pool's ownership if applicable
    if (
      config.deployConfigs.owner &&
      config.deployConfigs.owner != "0x" &&
      config.deployConfigs.owner != "0x0000000000000000000000000000000000000000"
    ) {
      poolOwnerAccount = config.deployConfigs.owner;
      console.log(
        `\n\nStarting... Transfer ownership of pool contract "${ggInstance.address}" to new owner "${config.deployConfigs.owner}"`,
      );
      await ggInstance.transferOwnership(config.deployConfigs.owner, { ...txGasConfig });
      console.log(
        `Completed... Transferred ownership of pool contract "${ggInstance.address}" to new owner "${config.deployConfigs.owner}"`,
      );
    }

    // Add pool and strategy to registry,  if applicable
    let addToRegistryStatus = "skipped";
    let addToRegistryMessage = `Skipped... "addToRegistry" deployment configs set to "false".`;
    let registryAddress = process.env.REGISTRY_ADDRESS ?? "";
    if (registryAddress.toLowerCase() === ZERO_ADDRESS) {
      registryAddress = "";
    }

    if (config?.deployConfigs?.addToRegistry) {
      try {
        console.log(`\n\nStarting... Add deployed contracts to registry`);
        console.log("Selected Registry:", registryAddress ?? "NOT FOUND");

        if (registryAddress) {
          const provider = new ethers.providers.Web3Provider(web3.currentProvider);
          const signer = provider.getSigner(deployerAccount);
          const registryInstance = new ethers.Contract(registryAddress, RegistryAbi, signer);

          const hasPermission = await registryInstance.hasRole(OPERATOR_ROLE, deployerAccount, {
            from: deployerAccount,
          });
          console.log("[pre-check completed] Deployer have required permissions on registry?: ", hasPermission);

          if (hasPermission) {
            const t = await registryInstance.addContract([ggInstance.address, strategyInstance.address], {
              from: deployerAccount,
              ...txGasConfig,
            });
            await t.wait();
            addToRegistryMessage = `Completed... Added deployed contracts to registry: "${ggInstance.address}", "${strategyInstance.address}"`;
            addToRegistryStatus = "completed";
          } else {
            addToRegistryMessage = `Skipped... Deployer Account does not have required permission to add contracts to registry.`;
          }
        } else {
          addToRegistryMessage = `Skipped... No registry address found to add deployed contracts to.`;
        }
      } catch (error) {
        const errosMsg = error?.message ?? "exception error with no specific error message";
        addToRegistryStatus = "error";
        addToRegistryMessage = `ERROR... Cannot add deployed contracts to registry due to error: "${errosMsg}".`;
        console.log(`--------------- BEGIN OF ERROR - Add Contract to Registry ---------------\n`);
        console.log(error);
        console.log(`\n--------------- END OF ERROR - Add Contract to Registry ---------------`);
      }
    }
    // prints out result of adding contracts to registry.
    console.log(addToRegistryMessage);

    const poolTxInfo = await web3.eth.getTransaction(poolTx.transactionHash);
    const strategyTxInfo = await web3.eth.getTransaction(strategyTx.transactionHash);

    deploymentResult.deployer = deployerAccount;
    deploymentResult.poolOwner = poolOwnerAccount;
    deploymentResult.poolAddress = ggInstance.address;
    deploymentResult.poolDeploymentHash = poolTx.transactionHash;
    if (config.deployConfigs.initialize) {
      const firstSegmentStart = await ggInstance.firstSegmentStart();
      const waitingRoundSegmentStart = await ggInstance.waitingRoundSegmentStart();
      deploymentResult.firstSegmentStart = firstSegmentStart.toString();
      deploymentResult.waitingRoundSegmentStart = waitingRoundSegmentStart.toString();
    }
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
    deploymentResult.addToRegistryStatus = addToRegistryStatus;
    deploymentResult.addToRegistryMessage = addToRegistryMessage;
    deploymentResult.registryAddress = registryAddress;
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
      config.deployConfigs.isTransactionalToken ? ZERO_ADDRESS : inboundCurrencyAddress,
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
    deploymentResult.poolEncodedParameters = abi.rawEncode(poolParameterTypes, poolParameterValues).toString("hex");

    if (
      config.deployConfigs.strategy === "mobius-cUSD-DAI" ||
      config.deployConfigs.strategy === "mobius-cUSD-USDC" ||
      config.deployConfigs.strategy === "mobius-celo-stCelo" ||
      config.deployConfigs.strategy === "mobius-cusd-usdcet"
    ) {
      deploymentResult.mobiusPoolAddress = strategyConfig.pool;
      deploymentResult.mobiusGaugeAddress = strategyConfig.gauge;
      deploymentResult.mobiusMinterAddress = strategyConfig.minter;
      deploymentResult.strategyLPTokenAddress = strategyConfig.lpToken;
      deploymentResult.strategyTokenIndex =
        tokenIndexMapping[config.deployConfigs.strategy][config.deployConfigs.inboundCurrencySymbol];
      deploymentResult.rewardTokenAdddresses = strategyConfig.rewardTokens;
      var mobiusStrategyParameterTypes = ["address", "address", "address", "address", "uint", "address[]"];

      var mobiusStrategyValues = [
        deploymentResult.mobiusPoolAddress,
        deploymentResult.mobiusGaugeAddress,
        deploymentResult.mobiusMinterAddress,
        deploymentResult.strategyLPTokenAddress,
        deploymentResult.strategyTokenIndex,
        deploymentResult.rewardTokenAdddresses,
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
    } else if (config.deployConfigs.strategy === "open") {
      var noExternalStrategyParameterTypes = ["address", "address[]"];
      var noExternalStrategyValues = [deploymentResult.inboundCurrencyAddress, deploymentResult.rewardTokenAdddresses];
      deploymentResult.strategyEncodedParameters = abi
        .rawEncode(noExternalStrategyParameterTypes, noExternalStrategyValues)
        .toString("hex");
    } else {
      deploymentResult.curvePoolAddress = strategyConfig.pool;
      deploymentResult.curveGaugeAddress = strategyConfig.gauge;
      deploymentResult.strategyTokenIndex =
        tokenIndexMapping[config.deployConfigs.strategy][config.deployConfigs.inboundCurrencySymbol];
      deploymentResult.strategyPoolType = strategyConfig.poolType;
      deploymentResult.gaugeMinterAddress = strategyConfig.gaugeMinter;
      deploymentResult.rewardTokenAdddresses = strategyConfig.rewardTokens;
      var curveStrategyParameterTypes = ["address", "address", "uint", "uint", "address", "address[]"];
      var curveStrategyValues = [
        deploymentResult.curvePoolAddress,
        deploymentResult.curveGaugeAddress,
        deploymentResult.strategyTokenIndex,
        deploymentResult.strategyPoolType,
        deploymentResult.gaugeMinterAddress,
        deploymentResult.rewardTokenAdddresses,
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
