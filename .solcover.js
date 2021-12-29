const shell = require("shelljs");

module.exports = {
  istanbulReporter: ["html", "lcov"],
  configureYulOptimizer: true,
  providerOptions: {
    mnemonic: process.env.MNEMONIC,
  },
  skipFiles: ["test"],
};
