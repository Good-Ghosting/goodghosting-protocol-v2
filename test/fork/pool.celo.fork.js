const Pool = artifacts.require("Pool");
const config = require("../../deploy/deploy.config");
const wmatic = require("../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json");
const mobiusPool = require("../../artifacts/contracts/mobius/IMobiPool.sol/IMobiPool.json");
const mobiusGauge = require("../../artifacts/contracts/mobius/IMobiGauge.sol/IMobiGauge.json");
const ethers = require("ethers");

contract("GoodGhostingGasEstimate", accounts => {
  // Only executes this test file for local network fork
  if (!["local-celo-mobius"].includes(process.env.NETWORK)) return;

  global.web3 = web3;
  const unlockedDaiAccount = "0x699EaB8444e2ff85Ec9F426673eE1Fff193334f4";
  let providersConfigs;
  let GoodGhostingArtifact;
  let mobi;
  if (process.env.NETWORK === "local-celo-mobius") {
    GoodGhostingArtifact = Pool;
    providersConfigs = config.providers.celo.mobius;
  }

  const {
    segmentCount,
    segmentLength,
    segmentPayment: segmentPaymentInt,
    customFee,
    earlyWithdrawFee,
    maxPlayersCount,
  } = config.deployConfigs;
  let token;
  let pool;
  let gaugeToken;
  let admin = accounts[0];
  const players = accounts.slice(1, 6); // 5 players
  const loser = players[0];
  const userWithdrawingAfterLastSegment = players[1];
  const daiDecimals = ethers.BigNumber.from("1000000000000000000");
  const segmentPayment = daiDecimals.mul(ethers.BigNumber.from(segmentPaymentInt)); // equivalent to 10 DAI
  let goodGhosting;

  describe("simulates a full game with 5 players and 4 of them winning the game and with admin fee % as 0", async () => {
    it("initializes contract instances and transfers DAI to players", async () => {
      // if (providersConfigs.poolType == 0) {
      //     pool = new web3.eth.Contract(aavepoolABI, providersConfigs.pool)
      // } else {
      //     pool = new web3.eth.Contract(atricryptopoolABI, providersConfigs.pool)
      // }
      token = new web3.eth.Contract(wmatic.abi, providersConfigs.cusd.address);
      // rewardToken = new web3.eth.Contract(
      //     daiABI,
      //     providersConfigs.wmatic
      // );

      goodGhosting = await GoodGhostingArtifact.deployed();
      console.log(goodGhosting.address);
      // gaugeToken = new web3.eth.Contract(daiABI, providersConfigs.gauge);

      // Send 1 eth to token address to have gas to transfer DAI.
      // Uses ForceSend contract, otherwise just sending a normal tx will revert.
      // const forceSend = await ForceSend.new();
      // await forceSend.go(token.options.address, {
      //     value: web3.utils.toWei("1", "Ether"),
      //     from: admin,
      // });
      const unlockedBalance = await token.methods.balanceOf(unlockedDaiAccount).call({ from: admin });
      const daiAmount = segmentPayment.mul(ethers.BigNumber.from(segmentCount)).toString();
      console.log("unlockedBalance: ", ethers.utils.formatEther(unlockedBalance));
      console.log("daiAmountToTransfer", ethers.utils.formatEther(daiAmount));
      for (let i = 0; i < players.length; i++) {
        const player = players[i];
        let transferAmount = daiAmount;
        if (i === 1) {
          // Player 1 needs additional funds to rejoin
          transferAmount = ethers.BigNumber.from(daiAmount).add(segmentPayment).toString();
        }
        await token.methods.transfer(player, transferAmount).send({ from: unlockedDaiAccount });
        const playerBalance = await token.methods.balanceOf(player).call({ from: admin });
        console.log(`player${i + 1}DAIBalance`, ethers.utils.formatEther(playerBalance));
      }
    });
  });
});
