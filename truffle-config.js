const HDWalletProvider = require("@truffle/hdwallet-provider");
const Web3 = require("web3");
require("dotenv").config();
require("ts-node/register");

const ContractKit = require("@celo/contractkit");
const getAccount = require("./getAccount").getAccount;
// use mainnet rpc as default
const web3 = new Web3("https://forno.celo.org/");

const kit = ContractKit.newKitFromWeb3(web3);

async function awaitWrapper() {
  let account = await getAccount();
  if (account) {
    kit.connection.addAccount(account.privateKey);
  }
  return kit.connection.web3.currentProvider;
}

awaitWrapper();

module.exports = {
  test_file_extension_regexp: /.*\.ts$/,

  // See <http://truffleframework.com/docs/advanced/configuration>
  // to customize your Truffle configuration!

  plugins: [
    //"truffle-security",
    "solidity-coverage",
    "truffle-plugin-verify",
  ],

  // Set default mocha options here, use special reporters etc.
  mocha: {
    reporter: "eth-gas-reporter",
    reporterOptions: {
      currency: "USD",
      showTimeSpent: true,
      coinmarketcap: process.env.COINMARKETCAP_API_KEY,
      excludeContracts: ["Migrations", "ForceSend"],
    },
  },

  networks: {
    celo: {
      provider: kit.connection.web3.currentProvider, // CeloProvider
      network_id: 42220,
    },
    "local-polygon": {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
    },
    "local-variable-polygon": {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
    },
    "local-celo": {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
    },
    "local-variable-celo": {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
    },
    polygon: {
      provider: () =>
        new HDWalletProvider(
          process.env.MNEMONIC,
          process.env.RPC,
          0, //address_index
          10, // num_addresses
          true, // shareNonce
        ),
      network_id: 137, // Polygon mainnet id
      networkCheckTimeout: 60000,
      gasPrice: 200000000000, // 200 Gwei
      confirmations: 2, // # of confs to wait between deployments. (default: 0)
      timeoutBlocks: 50, // # of blocks before a deployment times out  (minimum/default: 50)
      skipDryRun: false, // Skip dry run before migrations? (default: false for public nets )
    },
  },

  compilers: {
    solc: {
      version: "0.8.7",
      settings: {
        optimizer: {
          enabled: true,
          runs: 1500,
        },
      },
      // A version or constraint - Ex. "^0.5.0"
      // Can also be set to "native" to use a native solc
      //docker: false, // Use a version obtained through docker
      // parser: "solcjs",  // Leverages solc-js purely for speedy parsing
    },
  },
  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY,
    polygonscan: process.env.POLYGONSCAN_API_KEY,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
