import { ContractVersion } from "@celo/contractkit/lib/versions";

const Pool = artifacts.require("Pool");
const CurveStrategy = artifacts.require("CurveStrategy");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const wmaticABI = require("../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json");
const curvePool = require("../../artifacts/contracts/curve/ICurvePool.sol/ICurvePool.json");
const curveGauge = require("../../artifacts/contracts/curve/ICurveGauge.sol/ICurveGauge.json");
const aavepoolABI = require("../../abi-external/curve-aave-pool-abi.json");
const atricryptopoolABI = require("../../abi-external/curve-atricrypto-pool-abi.json");
const configs = require("../../deploy.config");

contract("Pool with Curve Strategy when admin enables early game completion", accounts => {
  // Only executes this test file for local network fork
  if (
    !["local-polygon-curve-aave", "local-polygon-curve-atricrypto"].includes(
      process.env.NETWORK ? process.env.NETWORK : "",
    )
  )
    return;

  const unlockedDaiAccount = process.env.WHALE_ADDRESS_FORKED_NETWORK;
  let providersConfigs: any;
  let GoodGhostingArtifact: any;
  let curve: any;
  let wmatic: any;
  GoodGhostingArtifact = Pool;

  if (process.env.NETWORK === "local-polygon-curve-aave") {
    providersConfigs = configs.providers["polygon"]["polygon-curve-aave"];
  } else {
    providersConfigs = configs.providers["polygon"]["polygon-curve-atricrypto"];
  }

  const { depositCount, segmentLength, segmentPayment: segmentPaymentInt, adminFee } = configs.deployConfigs;
  let token: any;
  let pool: any;
  let gaugeToken: any;
  let curveStrategy: any;
  let admin = accounts[0];
  const players = accounts.slice(1, 6); // 5 players
  const daiDecimals = web3.utils.toBN(1000000000000000000);
  const segmentPayment = daiDecimals.mul(web3.utils.toBN(segmentPaymentInt)); // equivalent to 10 Inbound Token
  let goodGhosting: any;

  describe("simulates a full game with 5 players and 4 of them winning the game and with admin fee % as 0", async () => {
    it("initializes contract instances and transfers Inbound Token to players", async () => {
      pool = new web3.eth.Contract(curvePool.abi, providersConfigs.pool);
      if (providersConfigs.poolType == 0) {
        pool = new web3.eth.Contract(aavepoolABI, providersConfigs.pool);
      } else {
        pool = new web3.eth.Contract(atricryptopoolABI, providersConfigs.pool);
      }
      token = new web3.eth.Contract(
        wmaticABI.abi,
        configs.providers["polygon"][configs.deployConfigs.inboundCurrencySymbol].address,
      );
      curve = new web3.eth.Contract(wmaticABI.abi, configs.providers["polygon"]["curve"].address);
      wmatic = new web3.eth.Contract(wmaticABI.abi, configs.providers["polygon"]["wmatic"].address);

      goodGhosting = await GoodGhostingArtifact.deployed();
      curveStrategy = await CurveStrategy.deployed();
      gaugeToken = new web3.eth.Contract(curveGauge.abi, providersConfigs.gauge);

      const unlockedBalance = await token.methods.balanceOf(unlockedDaiAccount).call({ from: admin });
      const daiAmount = segmentPayment.mul(web3.utils.toBN(depositCount)).toString();
      console.log("unlockedBalance: ", web3.utils.fromWei(unlockedBalance));
      console.log("daiAmountToTransfer", web3.utils.fromWei(daiAmount));
      for (let i = 0; i < players.length; i++) {
        const player = players[i];
        let transferAmount = daiAmount;
        if (i === 1) {
          // Player 1 needs additional funds to rejoin
          transferAmount = web3.utils.toBN(daiAmount).add(segmentPayment).toString();
        }
        await token.methods.transfer(player, transferAmount).send({ from: unlockedDaiAccount });
        const playerBalance = await token.methods.balanceOf(player).call({ from: admin });
        console.log(`player${i + 1}DAIBalance`, web3.utils.fromWei(playerBalance));
      }
    });

    it("players approve Inbound Token to contract and join the game", async () => {
      const userSlippageOptions = [1, 3, 4, 2, 1];
      for (let i = 0; i < players.length; i++) {
        const player = players[i];
        await token.methods
          .approve(goodGhosting.address, segmentPayment.mul(web3.utils.toBN(depositCount)).toString())
          .send({ from: player });
        let playerEvent = "";
        let paymentEvent = 0;
        let result, slippageFromContract;
        let minAmountWithFees: any = 0;
        const userProvidedMinAmount = segmentPayment.sub(
          segmentPayment.mul(web3.utils.toBN(userSlippageOptions[i].toString())).div(web3.utils.toBN(100)),
        );

        if (providersConfigs.poolType == 0) {
          slippageFromContract = await pool.methods.calc_token_amount([segmentPayment.toString(), 0, 0], true).call();
        } else {
          slippageFromContract = await pool.methods
            .calc_token_amount([segmentPayment.toString(), 0, 0, 0, 0], true)
            .call();
        }

        minAmountWithFees =
          parseInt(userProvidedMinAmount.toString()) > parseInt(slippageFromContract.toString())
            ? web3.utils
                .toBN(slippageFromContract)
                .sub(web3.utils.toBN(slippageFromContract).mul(web3.utils.toBN("10")).div(web3.utils.toBN("10000")))
            : userProvidedMinAmount.sub(userProvidedMinAmount.mul(web3.utils.toBN("10")).div(web3.utils.toBN("10000")));

        result = await goodGhosting.joinGame(minAmountWithFees.toString(), 0, { from: player });
        // got logs not defined error when keep the event assertion check outside of the if-else
        truffleAssert.eventEmitted(
          result,
          "JoinedGame",
          (ev: any) => {
            playerEvent = ev.player;
            paymentEvent = ev.amount;
            return (
              playerEvent === player && web3.utils.toBN(paymentEvent).eq(web3.utils.toBN(segmentPayment.toString()))
            );
          },
          `JoinedGame event should be emitted when an user joins the game with params\n
                            player: expected ${player}; got ${playerEvent}\n
                            paymentAmount: expected ${segmentPayment}; got ${paymentEvent}`,
        );
      }
    });

    it("admin enables emergency withdraw before game completeion and redeems the funds", async () => {
      await goodGhosting.enableEmergencyWithdraw({ from: admin });
      // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
      for (let segmentIndex = 1; segmentIndex < depositCount; segmentIndex++) {
        await timeMachine.advanceTime(segmentLength);
      }
      const userSlippage = 1;
      let minAmount;
      let curveBalanceBeforeRedeem, curveBalanceAfterRedeem, wmaticBalanceBeforeRedeem, wmaticBalanceAfterRedeem;
      curveBalanceBeforeRedeem = await curve.methods.balanceOf(goodGhosting.address).call();
      wmaticBalanceBeforeRedeem = await wmatic.methods.balanceOf(goodGhosting.address).call();

      const gaugeTokenBalance = await gaugeToken.methods.balanceOf(curveStrategy.address).call();
      minAmount = await pool.methods
        .calc_withdraw_one_coin(gaugeTokenBalance.toString(), providersConfigs.tokenIndex)
        .call();

      const userProvidedMinAmount = web3.utils
        .toBN(gaugeTokenBalance)
        .sub(web3.utils.toBN(gaugeTokenBalance).mul(web3.utils.toBN(userSlippage)).div(web3.utils.toBN(100)));

      if (parseInt(userProvidedMinAmount.toString()) < parseInt(minAmount.toString())) {
        minAmount = userProvidedMinAmount;
      }

      await timeMachine.advanceTime(segmentLength);
      const waitingRoundLength = await goodGhosting.waitingRoundSegmentLength();
      await timeMachine.advanceTime(parseInt(waitingRoundLength.toString()));

      await goodGhosting.redeemFromExternalPoolForFixedDepositPool(minAmount.toString(), {
        from: admin,
      });

      curveBalanceAfterRedeem = await curve.methods.balanceOf(goodGhosting.address).call();
      wmaticBalanceAfterRedeem = await wmatic.methods.balanceOf(goodGhosting.address).call();

      assert(web3.utils.toBN(curveBalanceBeforeRedeem).lte(web3.utils.toBN(curveBalanceAfterRedeem)));
      // for some reason forking mainnet we don't get back wmatic rewards so the before and after balance is equal
      assert(web3.utils.toBN(wmaticBalanceBeforeRedeem).lte(web3.utils.toBN(wmaticBalanceAfterRedeem)));
    });

    it("players withdraw from contract", async () => {
      // starts from 2, since player1 (loser), requested an early withdraw and player 2 withdrew after the last segment
      for (let i = 2; i < players.length - 1; i++) {
        const player = players[i];
        let curveRewardBalanceBefore = web3.utils.toBN(0);
        let curveRewardBalanceAfter = web3.utils.toBN(0);
        let wmaticRewardBalanceBefore = web3.utils.toBN(0);
        let wmaticRewardBalanceAfter = web3.utils.toBN(0);
        let inboundBalanceBefore = web3.utils.toBN(0);
        let inboundBalanceAfter = web3.utils.toBN(0);

        curveRewardBalanceBefore = web3.utils.toBN(await curve.methods.balanceOf(player).call({ from: admin }));
        wmaticRewardBalanceBefore = web3.utils.toBN(await wmatic.methods.balanceOf(player).call({ from: admin }));
        inboundBalanceBefore = web3.utils.toBN(await token.methods.balanceOf(player).call({ from: admin }));
        const playerInfo = await goodGhosting.players(player);
        const netAmountPaid = playerInfo.netAmountPaid;

        let result;
        // redeem already called hence passing in 0
        result = await goodGhosting.withdraw(0, { from: player });

        curveRewardBalanceAfter = web3.utils.toBN(await curve.methods.balanceOf(player).call({ from: admin }));
        wmaticRewardBalanceAfter = web3.utils.toBN(await wmatic.methods.balanceOf(player).call({ from: admin }));
        inboundBalanceAfter = web3.utils.toBN(await token.methods.balanceOf(player).call({ from: admin }));
        const difference = inboundBalanceAfter.sub(inboundBalanceBefore);

        assert(difference.gt(netAmountPaid), "expected balance diff to be more than paid amount");

        assert(
          curveRewardBalanceAfter.gte(curveRewardBalanceBefore),
          "expected curve balance after withdrawal to be greater than before withdrawal",
        );

        // for some reason forking mainnet we don't get back wmatic rewards(wamtic rewards were stopped from curve's end IMO)
        assert(
          wmaticRewardBalanceAfter.lte(wmaticRewardBalanceBefore),
          "expected wmatic balance after withdrawal to be equal to or less than before withdrawal",
        );

        truffleAssert.eventEmitted(
          result,
          "Withdrawal",
          async (ev: any) => {
            console.log(`player${i} withdraw amount: ${ev.amount.toString()}`);

            return ev.player === player;
          },
          "withdrawal event failure",
        );
      }
    });

    it("admin withdraws admin fee from contract", async () => {
      if (adminFee > 0) {
        let curveRewardBalanceBefore = web3.utils.toBN(0);
        let curveRewardBalanceAfter = web3.utils.toBN(0);
        let wmaticRewardBalanceBefore = web3.utils.toBN(0);
        let wmaticRewardBalanceAfter = web3.utils.toBN(0);

        curveRewardBalanceBefore = web3.utils.toBN(await curve.methods.balanceOf(admin).call({ from: admin }));
        wmaticRewardBalanceBefore = web3.utils.toBN(await wmatic.methods.balanceOf(admin).call({ from: admin }));

        await goodGhosting.adminFeeWithdraw({
          from: admin,
        });
        curveRewardBalanceAfter = web3.utils.toBN(await curve.methods.balanceOf(admin).call({ from: admin }));
        wmaticRewardBalanceAfter = web3.utils.toBN(await wmatic.methods.balanceOf(admin).call({ from: admin }));
        assert(
          curveRewardBalanceAfter.gte(curveRewardBalanceBefore),
          "expected curve balance after withdrawal to be greater than before withdrawal",
        );
        // for some reason forking mainnet we don't get back wmatic rewards(wamtic rewards were stopped from curve's end IMO)
        assert(
          wmaticRewardBalanceAfter.gte(wmaticRewardBalanceBefore),
          "expected wmatic balance after withdrawal to be equal to or greater than before withdrawal",
        );
      }
    });
  });
});
export {};
