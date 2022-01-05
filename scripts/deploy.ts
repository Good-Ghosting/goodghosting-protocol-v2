import { ethers } from "hardhat";
const { providers, deployConfigs } = require("../deploy.config");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (deployer === undefined) throw new Error("Deployer is undefined.");
  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());
  let strategy: any;
  if (process.env.NETWORK === "polygon-aave") {
    const AaveStrategy = await ethers.getContractFactory("AaveStrategy");
    strategy = await AaveStrategy.deploy(
      providers["aave"]["polygon"].lendingPoolAddressProvider,
      providers["aave"]["polygon"].wethGateway,
      providers["aave"]["polygon"].dataProvider,
      providers["aave"]["polygon"].incentiveController,
      providers["aave"]["polygon"].wmatic,
    );
  } else if (process.env.NETWORK === "polygon-curve") {
    const CurveStrategy = await ethers.getContractFactory("CurveStrategy");
    strategy = await CurveStrategy.deploy(
      providers["aave"]["polygon-curve"].pool,
      providers["aave"]["polygon-curve"].tokenIndex,
      providers["aave"]["polygon-curve"].poolType,
      providers["aave"]["polygon-curve"].gauge,
      providers["aave"]["polygon-curve"].wmatic,
      providers["aave"]["polygon-curve"].curve,
    );
  }

  console.log("Strategy Address:", strategy.address);

  const Pool = await ethers.getContractFactory("Pool");
  const pool = await Pool.deploy(
    providers["aave"]["polygon"]["dai"].address,
    deployConfigs.depositCount.toString(),
    deployConfigs.segmentLength.toString(),
    deployConfigs.waitingRoundSegmentLength.toString(),
    deployConfigs.segmentPayment.toString(),
    deployConfigs.earlyWithdrawFee.toString(),
    deployConfigs.adminFee.toString(),
    deployConfigs.maxPlayersCount.toString(),
    deployConfigs.flexibleSegmentPayment,
    providers["aave"]["polygon"].incentiveToken,
    strategy.address,
    deployConfigs.isTransactionalToken,
  );

  console.log("Pool Address:", pool.address);
  await strategy.transferOwnership(pool.address);
  console.log("Ownership Transferred");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
