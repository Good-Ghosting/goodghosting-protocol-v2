const shell = require("shelljs");

module.exports = {
  istanbulReporter: ["html", "lcov"],
  configureYulOptimizer: true,
  providerOptions: {
    mnemonic: process.env.MNEMONIC,
  },
  skipFiles: ["Migrations.sol", "aave", "curve", "merkle", "mobius", "mock", "polygon"],
};
