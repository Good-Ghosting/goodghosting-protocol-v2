require("dotenv").config();

module.exports = {
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
    "local-celo-mobius": {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
    },
  },

  compilers: {
    solc: {
      version: "0.8.9",
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
