// deploy/00_deploy_your_contract.js

const { ethers } = require("hardhat");
import { providers, deployConfigs } from "../tasks/deploy/deploy.config";

const localChainId = "31337";

module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = await getChainId();

  await deploy("AaveStrategy", {
    // Learn more about args here: https://www.npmjs.com/package/hardhat-deploy#deploymentsdeploy
    from: deployer,
    args: [
      providers["aave"]["polygon"].lendingPoolAddressProvider,
      providers["aave"]["polygon"].dataProvider,
      providers["aave"]["polygon"].incentiveController,
      providers["aave"]["polygon"].wmatic,
    ],
    log: true,
  });

  // Getting a previously deployed contract
  const YourContract = await ethers.getContract("AaveStrategy", deployer);

  await deploy("Pool", {
    // Learn more about args here: https://www.npmjs.com/package/hardhat-deploy#deploymentsdeploy
    from: deployer,
    args: [
      providers["aave"]["polygon"]["dai"].address,
      deployConfigs.segmentCount.toString(),
      deployConfigs.segmentLength.toString(),
      deployConfigs.waitingRoundSegmentLength.toString(),
      deployConfigs.segmentPayment.toString(),
      deployConfigs.earlyWithdrawFee.toString(),
      deployConfigs.customFee.toString(),
      deployConfigs.maxPlayersCount.toString(),
      deployConfigs.flexibleSegmentPayment.toString(),
      providers["aave"]["polygon"].incentiveToken,
      YourContract.address,
    ],
    log: true,
  });
};
module.exports.tags = ["YourContract"];
