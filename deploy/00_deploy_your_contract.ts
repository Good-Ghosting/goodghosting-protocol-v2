// deploy/00_deploy_your_contract.js

const { ethers } = require("hardhat");
import { providers, deployConfigs } from "../deploy.config";

module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  if (process.env.NETWORK === "local-polygon-aave") {
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
    const AaveStrategy = await ethers.getContract("AaveStrategy", deployer);

    await deploy("Pool", {
      // Learn more about args here: https://www.npmjs.com/package/hardhat-deploy#deploymentsdeploy
      from: deployer,
      args: [
        providers["aave"]["polygon"]["dai"].address,
        deployConfigs.depositCount.toString(),
        deployConfigs.segmentLength.toString(),
        deployConfigs.waitingRoundSegmentLength.toString(),
        deployConfigs.segmentPayment.toString(),
        deployConfigs.earlyWithdrawFee.toString(),
        deployConfigs.adminFee.toString(),
        deployConfigs.maxPlayersCount.toString(),
        deployConfigs.flexibleSegmentPayment.toString(),
        providers["aave"]["polygon"].incentiveToken,
        AaveStrategy.address,
      ],
      log: true,
    });
  }
};
