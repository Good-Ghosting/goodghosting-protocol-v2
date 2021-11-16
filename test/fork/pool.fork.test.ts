import chai from "chai";
import { solidity } from "ethereum-waffle";
import { network, ethers, waffle } from "hardhat";
import { providers, deployConfigs } from "../../deploy/deploy.config";
import lendingProvider from "../../artifacts/contracts/aave/ILendingPoolAddressesProvider.sol/ILendingPoolAddressesProvider.json";
import incentiveController from "../../artifacts/contracts/aave/IncentiveController.sol/IncentiveController.json";
import wmatic from "../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json";
import dataProvider from "../../artifacts/contracts/mock/LendingPoolAddressesProviderMock.sol/LendingPoolAddressesProviderMock.json";

chai.use(solidity);
const { expect } = chai;

// dai holder
const impersonateAddress = "0xc75a0ff40db54203d66bff76315ed25d66037ce1";

describe("Pool Fork Tests", async () => {
  if (!(process.env.NETWORK === "local-polygon-aave")) {
    return;
  }

  // Impersonate as another address
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [impersonateAddress],
  });
  const impersonatedSigner = await ethers.getSigner(impersonateAddress);

  const accounts = await ethers.getSigners();

  let lendingPoolAddressProviderInstance = new ethers.Contract(
    providers["aave"]["polygon"].lendingPoolAddressProvider,
    lendingProvider.abi,
    impersonatedSigner,
  );
  let dataProviderInstance = new ethers.Contract(
    providers["aave"]["polygon"].dataProvider,
    dataProvider.abi,
    impersonatedSigner,
  );
  let incentiveControllerInstance = new ethers.Contract(
    providers["aave"]["polygon"].incentiveController,
    incentiveController.abi,
    impersonatedSigner,
  );
  let wmaticInstance = new ethers.Contract(providers["aave"]["polygon"].wmatic, wmatic.abi, impersonatedSigner);
  let daiInstance = new ethers.Contract(providers["aave"]["polygon"]["dai"].address, wmatic.abi, impersonatedSigner);

  let strategy: any = await ethers.getContractFactory("AaveStrategy", accounts[0]);
  strategy = await strategy.deploy(
    lendingPoolAddressProviderInstance.address,
    dataProviderInstance.address,
    incentiveControllerInstance.address,
    wmaticInstance.address,
  );
  let pool: any = await ethers.getContractFactory("Pool", accounts[0]);
  pool = await pool.deploy(
    daiInstance.address,
    deployConfigs.segmentCount.toString(),
    deployConfigs.segmentLength.toString(),
    deployConfigs.waitingRoundSegmentLength.toString(),
    deployConfigs.segmentPayment.toString(),
    deployConfigs.earlyWithdrawFee.toString(),
    deployConfigs.customFee.toString(),
    deployConfigs.maxPlayersCount.toString(),
    deployConfigs.flexibleSegmentPayment.toString(),
    providers["aave"]["polygon"].incentiveToken,
    strategy.address,
  );
});
