const Web3 = require("web3");

require("dotenv").config();
require("ts-node/register");

const ContractKit = require("@celo/contractkit");
const getAccount = require("./getAccount").getAccount;
// use mainnet rpc as default
const web3 = new Web3(process.env.CELO_RPC || "https://forno.celo.org/");

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
    // timeout: 100000
    reporter: "eth-gas-reporter",
    reporterOptions: {
      currency: "USD",
      showTimeSpent: true,
      coinmarketcap: process.env.COINMARKETCAP_API_KEY,
      excludeContracts: ["Migrations", "ForceSend"],
    },
  },

  networks: {
    "celo-moola": {
      provider: kit.connection.web3.currentProvider, // CeloProvider
      network_id: 42220,
      gas: 5000000,
    },
    "celo-mobius": {
      provider: kit.connection.web3.currentProvider, // CeloProvider
      network_id: 42220,
      gas: 5000000,
    },
    "local-celo-mobius": {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
      gas: 5000000,
    },

    "local-moola": {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
      gas: 5000000,
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
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
