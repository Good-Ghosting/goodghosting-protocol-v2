/* global artifacts web3 */

const GoodGhostingContract = artifacts.require("Pool");
const StrategyArtifact = artifacts.require("MobiusStrategy");
const SafeMathLib = artifacts.require("SafeMath");

const config = require("../deploy/deploy.config");

// /** @dev truffle may use network name as "kovan-fork", for example, so we need to get the correct name to be used in the configs */
// function getNetworkName(network) {

//     if (Object.prototype.toString.call(network) !== "[object String]") {
//         throw new Error(`Invalid value type for parameter "${network}"`);
//     }

//     const name = network.toLowerCase();
//     if (name.includes("kovan")) return "kovan";
//     if (name.includes("ropsten")) return "ropsten";
//     if (name.includes("mainnet")) return "mainnet";
//     if (name.includes("polygon-vigil-fork-curve")) return "polygon-curve";
//     if (name.includes("polygon")) return "polygon";
//     if (name.includes("alfajores")) return "alfajores";
//     if (name.includes("celo")) return "celo";

//     throw new Error(`Unsupported network "${network}"`);
// }

// function printSummary(
//     // contract's constructor parameters
//     {
//         inboundCurrencyAddress,
//         lendingPoolAddressProvider,
//         depositCount,
//         segmentLength,
//         segmentPaymentWei,
//         earlyWithdrawFee,
//         adminFee,
//         aaveContractAddress,
//         maxPlayersCount,
//         incentiveToken,
//         incentiveController,
//         wmatic,
//         merkleRoot,
//         curve,
//         curvePool,
//         curvePoolTokenIndex,
//         curveGauge,
//         curvePoolType
//     },
//     // additional logging info
//     {
//         networkName,
//         selectedProvider,
//         inboundCurrencySymbol,
//         segmentPayment,
//         owner,
//     }

// ) {
//     const isPolygon = networkName.toLowerCase() === "polygon";
//     const isPolygonCurve = networkName.toLowerCase() === "polygon-curve";
//     const isPolygonWhitelisted = networkName.toLowerCase() === "polygon-whitelisted" || ["polygon-whitelisted"].includes(networkName.toLowerCase()); // for local network

//     var parameterTypes = [
//         "address", // inboundCurrencyAddress
//         "address", // lendingPoolAddressProvider
//         "uint256", // depositCount
//         "uint256", // segmentLength
//         "uint256", // segmentPaymentWei
//         "uint256", // earlyWithdrawFee
//         "uint256", // adminFee
//         "address", // dataProvider/lending pool address
//         "uint256", // maxPlayersCount
//         "address" // incentiveToken
//     ];
//     var parameterValues = [
//         inboundCurrencyAddress,
//         lendingPoolAddressProvider,
//         depositCount,
//         segmentLength,
//         segmentPaymentWei,
//         earlyWithdrawFee,
//         adminFee,
//         aaveContractAddress,
//         maxPlayersCount,
//         incentiveToken
//     ];

//     if (isPolygon) {
//         parameterTypes.push(
//             "address", // IncentiveController
//             "address" // wmatic token
//         );
//         parameterValues.push(
//             incentiveController,
//             wmatic
//         );
//     }

//     if (isPolygonCurve) {
//         parameterTypes = [
//             "address",
//             "address",
//             "int128",
//             "uint256",
//             "uint256",
//             "address",
//             "uint256",
//             "uint256",
//             "uint256",
//             "uint256",
//             "uint256",
//             "uint256",
//             "address",
//             "address",
//             "address"
//         ]

//         parameterValues = [
//             inboundCurrencyAddress,
//             curvePool,
//             curvePoolTokenIndex,
//             curvePoolTokenIndex,
//             curvePoolType,
//             curveGauge,
//             depositCount,
//             segmentLength,
//             segmentPaymentWei,
//             earlyWithdrawFee,
//             adminFee,
//             maxPlayersCount,
//             curve,
//             wmatic,
//             incentiveToken
//         ]
//     }

//     if (isPolygonWhitelisted) {
//         parameterTypes.push(
//             "address", // IncentiveController
//             "address", // wmatic token
//             "bytes32" // merkle root
//         );
//         parameterValues.push(
//             incentiveController,
//             wmatic,
//             merkleRoot
//         );
//     }

//     var encodedParameters = abi.rawEncode(parameterTypes, parameterValues);

//     console.log("\n\n\n----------------------------------------------------");
//     console.log("GoogGhosting deployed with the following arguments:");
//     console.log("----------------------------------------------------\n");
//     console.log(`Network Name: ${networkName}`);
//     console.log(`Contract's Owner: ${owner}`);
//     if (!isPolygonCurve) {
//         console.log(`Lending Pool: ${selectedProvider}`);
//         console.log(`Lending Pool Address Provider: ${lendingPoolAddressProvider}`);
//         console.log(`Data Provider/Lending Pool Address: ${aaveContractAddress}`);
//     }

//     console.log(`Inbound Currency: ${inboundCurrencySymbol} at ${inboundCurrencyAddress}`);
//     console.log(`Segment Count: ${depositCount}`);
//     console.log(`Segment Length: ${segmentLength} seconds`);
//     console.log(`Segment Payment: ${segmentPayment} ${inboundCurrencySymbol} (${segmentPaymentWei} wei)`);
//     console.log(`Early Withdrawal Fee: ${earlyWithdrawFee}%`);
//     console.log(`Custom Pool Fee: ${adminFee}%`);
//     console.log(`Max Quantity of Players: ${maxPlayersCount}`);
//     console.log(`Incentive Token: ${incentiveToken}`);
//     if (isPolygon) {
//         console.log(`Incentive Controller: ${incentiveController}`);
//         console.log(`Matic Token: ${wmatic}`);
//     }
//     if (isPolygonWhitelisted) {
//         console.log(`Incentive Controller: ${incentiveController}`);
//         console.log(`Matic Token: ${wmatic}`);
//         console.log(`Merkle Root: ${merkleRoot}`);
//     }
//     if (isPolygonCurve) {
//         console.log(`Curve Pool: ${curvePool}`);
//         console.log(`Curve Pool Type: ${curvePoolType}`);
//         console.log(`Curve Gauge: ${curveGauge}`);
//         console.log(`Curve Deposit Token Index: ${curvePoolTokenIndex}`);
//         console.log(`Curve Token: ${curve}`);
//         console.log(`Matic Token: ${wmatic}`);
//     }
//     console.log("\n\nConstructor Arguments ABI-Encoded:");
//     console.log(encodedParameters.toString("hex"));
//     console.log("\n\n\n\n");

// }

module.exports = function (deployer, network, accounts) {
  // Injects network name into process .env variable to make accessible on test suite.
  process.env.NETWORK = network;

  // Skips migration for local tests and soliditycoverage
  if (["test", "soliditycoverage"].includes(network)) return;

  deployer.then(async () => {
    // let networkName = getNetworkName(network);
    // if (network === "local-celo-fork") {
    //     config.deployConfigs.selectedProvider = "moola";
    //     config.deployConfigs.inboundCurrencySymbol = "cusd";
    // }
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
    let goodGhostingContract = GoodGhostingContract; // defaults to Ethereum version
    // if (network.includes("polygon-whitelisted")) {
    //     networkName = "polygon-whitelisted";
    // }
    // if (networkName === "polygon") {
    //     goodGhostingContract = GoodGhostingPolygonContract;
    // } else if (networkName === "polygon-whitelisted") {
    //     goodGhostingContract = GoodGhostingPolygonWhitelisted;
    // } else if (networkName === 'polygon-curve') {
    //     goodGhostingContract = GoodGhostingPolygonCurveContract;
    // }

    let strategyArgs = [StrategyArtifact, mobiusPool, mobiusGauge, minter, mobi, celo];
    // await deployer.deploy(SafeMathLib);
    // await deployer.link(SafeMathLib, StrategyArtifact);
    await deployer.deploy(...strategyArgs);

    const strategyAddress = await StrategyArtifact.deployed();

    // IERC20 _inboundCurrency,
    // uint256 _segmentCount,
    // uint256 _segmentLength,
    // uint256 _waitingRoundSegmentLength,
    // uint256 _segmentPayment,
    // uint128 _earlyWithdrawalFee,
    // uint128 _customFee,
    // uint256 _maxPlayersCount,
    // bool _flexibleSegmentPayment,
    // IERC20 _incentiveToken,
    // IStrategy _strategy

    // Prepares deployment arguments
    let deploymentArgs = [
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
      strategyAddress.address,
    ];
    // if (networkName === "polygon") {
    //     deploymentArgs.push(
    //         incentiveController,
    //         wmatic
    //     );
    // } else if (networkName === "polygon-whitelisted") {
    //     deploymentArgs.push(
    //         incentiveController,
    //         wmatic,
    //         config.deployConfigs.merkleroot
    //     );
    // } else if (networkName === "polygon-curve") {
    //     deploymentArgs = [
    //         goodGhostingContract,
    //         inboundCurrencyAddress,
    //         poolConfigs.pool,
    //         poolConfigs.tokenIndex,
    //         poolConfigs.tokenIndex,
    //         poolConfigs.poolType,
    //         poolConfigs.gauge,
    //         config.deployConfigs.depositCount,
    //         config.deployConfigs.segmentLength,
    //         segmentPaymentWei,
    //         config.deployConfigs.earlyWithdrawFee,
    //         config.deployConfigs.adminFee,
    //         maxPlayersCount,
    //         poolConfigs.curve,
    //         wmatic,
    //         incentiveToken
    //     ];
    // }

    // Deploys GoodGhosting contract based on network
    await deployer.deploy(SafeMathLib);
    await deployer.link(SafeMathLib, goodGhostingContract);
    await deployer.deploy(...deploymentArgs);

    const ggInstance = await goodGhostingContract.deployed();

    await strategyAddress.transferOwnership(ggInstance.address);

    // // Prints deployment summary
    // printSummary(
    //     {
    //         inboundCurrencyAddress,
    //         lendingPoolAddressProvider,
    //         depositCount: config.deployConfigs.depositCount,
    //         segmentLength: config.deployConfigs.segmentLength,
    //         segmentPaymentWei,
    //         earlyWithdrawFee: config.deployConfigs.earlyWithdrawFee,
    //         adminFee: config.deployConfigs.adminFee,
    //         aaveContractAddress,
    //         maxPlayersCount,
    //         incentiveToken,
    //         incentiveController,
    //         wmatic,
    //         merkleRoot: config.deployConfigs.merkleroot,
    //         curve: poolConfigs.curve,
    //         curvePool: poolConfigs.pool,
    //         curvePoolTokenIndex: poolConfigs.tokenIndex,
    //         curveGauge: poolConfigs.gauge,
    //         curvePoolType: poolConfigs.poolType
    //     },
    //     {
    //         networkName,
    //         selectedProvider: config.deployConfigs.selectedProvider,
    //         inboundCurrencySymbol: config.deployConfigs.inboundCurrencySymbol,
    //         segmentPayment: config.deployConfigs.segmentPayment,
    //         owner: accounts[0],
    //     }
    // );
  });
};
