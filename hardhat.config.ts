import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import { resolve } from "path";
import "@nomiclabs/hardhat-truffle5";
import { config as dotenvConfig } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import { NetworkUserConfig } from "hardhat/types";

dotenvConfig({ path: resolve(__dirname, "./.env") });

const chainIds = {
  goerli: 5,
  hardhat: 31337,
  kovan: 42,
  mainnet: 1,
  rinkeby: 4,
  ropsten: 3,
  polygon: 137,
};

// Ensure that we have all the environment variables we need.
const mnemonic: string | undefined = process.env.MNEMONIC;
if (!mnemonic) {
  throw new Error("Please set your MNEMONIC in a .env file");
}

const infuraApiKey: string | undefined = process.env.RPC;
if (!infuraApiKey) {
  throw new Error("Please set your RPC in a .env file");
}

function getChainConfig(network: keyof typeof chainIds): NetworkUserConfig {
  const url: string | undefined = infuraApiKey;
  return {
    accounts: {
      count: 10,
      mnemonic,
      path: "m/44'/60'/0'/0",
    },
    chainId: chainIds[network],
    url,
    gas: 32000000000,
  };
}

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
    src: "./contracts",
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic,
      },
      forking: {
        enabled: process.env.FORKING === "true",
        url: `https://matic-mainnet.chainstacklabs.com`,
      },
      chainId: chainIds.hardhat,
    },
    goerli: getChainConfig("goerli"),
    kovan: getChainConfig("kovan"),
    rinkeby: getChainConfig("rinkeby"),
    ropsten: getChainConfig("ropsten"),
    polygon: getChainConfig("polygon"),
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  mocha: {
    timeout: 200000,
  },
  solidity: {
    compilers: [
      {
        version: "0.8.7",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.6.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1500,
          },
        },
      },
    ],
  },
  typechain: {
    outDir: "src/types",
    target: "ethers-v5",
  },
};

export default config;
