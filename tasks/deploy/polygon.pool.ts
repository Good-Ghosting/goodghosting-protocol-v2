import { task } from "hardhat/config";
import { TaskArguments } from "hardhat/types";
import { providers, deployConfigs } from "./deploy.config";

import { Pool } from "../../src/types/Pool";
import { Pool__factory } from "../../src/types/factories/Pool__factory";

task("deploy:Pool")
  .addParam("_inboundCurrency", providers["aave"]["polygon"]["dai"].address)
  .addParam("_segmentCount", deployConfigs.segmentCount.toString())
  .addParam("_segmentLength", deployConfigs.segmentLength.toString())
  .addParam("_waitingRoundSegmentLength", deployConfigs.waitingRoundSegmentLength.toString())
  .addParam("_segmentPayment", deployConfigs.segmentPayment.toString())
  .addParam("_earlyWithdrawalFee", deployConfigs.earlyWithdrawFee.toString())
  .addParam("_customFee", deployConfigs.customFee.toString())
  .addParam("_maxPlayersCount", deployConfigs.maxPlayersCount.toString())
  .addParam("_flexibleSegmentPayment", deployConfigs.flexibleSegmentPayment.toString())
  .addParam("_incentiveToken", providers["aave"]["polygon"].incentiveToken)
  .addParam("_strategy", "Say hello, be nice")

  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    const poolFactory: Pool__factory = <Pool__factory>await ethers.getContractFactory("Pool");
    const pool: Pool = <Pool>(
      await poolFactory.deploy(
        taskArguments._inboundCurrency,
        taskArguments._segmentCount,
        taskArguments._segmentLength,
        taskArguments._waitingRoundSegmentLength,
        taskArguments._segmentPayment,
        taskArguments._earlyWithdrawalFee,
        taskArguments._customFee,
        taskArguments._maxPlayersCount,
        taskArguments._flexibleSegmentPayment,
        taskArguments._incentiveToken,
        taskArguments._strategy,
      )
    );
    await pool.deployed();
    console.log("Pool deployed to: ", pool.address);
  });
