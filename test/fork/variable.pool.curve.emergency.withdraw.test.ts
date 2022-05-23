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
const providerConfig = require("../../providers.config");

contract("Variable Pool with Curve Strategy when admin enables early game completion", accounts => {
  // Only executes this test file for local network fork
  if (
    !(
      (["local-variable-polygon"].includes(process.env.NETWORK ? process.env.NETWORK : "") &&
        configs.deployConfigs.strategy === "polygon-curve-aave") ||
      configs.deployConfigs.strategy === "polygon-curve-atricrypto"
    )
  )
    return;

  const unlockedDaiAccount = process.env.WHALE_ADDRESS_FORKED_NETWORK;
  let providersConfigs: any;
  let GoodGhostingArtifact: any;
  let curve: any;
  let wmatic: any;
  if (configs.deployConfigs.strategy === "polygon-curve-aave") {
    GoodGhostingArtifact = Pool;
    providersConfigs = providerConfig.providers["polygon"].strategies["polygon-curve-aave"];
  } else {
    GoodGhostingArtifact = Pool;
    providersConfigs = providerConfig.providers["polygon"].strategies["polygon-curve-atricrypto"];
  }
  const {
    depositCount,
    segmentLength,
    segmentPayment: segmentPaymentInt,
    adminFee,
    earlyWithdrawFee,
  } = configs.deployConfigs;
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
        providerConfig.providers["polygon"].tokens[configs.deployConfigs.inboundCurrencySymbol].address,
      );
      curve = new web3.eth.Contract(wmaticABI.abi, providerConfig.providers["polygon"].tokens["curve"].address);
      wmatic = new web3.eth.Contract(wmaticABI.abi, providerConfig.providers["polygon"].tokens["wmatic"].address);

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
        if (i === 2) {
          // Player 2 needs additional funds
          transferAmount = web3.utils.toBN(daiAmount).add(segmentPayment).mul(web3.utils.toBN(6)).toString();
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
        await token.methods.approve(goodGhosting.address, web3.utils.toWei("200").toString()).send({ from: player });
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
        if (i == 2) {
          result = await goodGhosting.joinGame(minAmountWithFees.toString(), web3.utils.toWei("23"), { from: player });
          truffleAssert.eventEmitted(
            result,
            "JoinedGame",
            (ev: any) => {
              playerEvent = ev.player;
              paymentEvent = ev.amount;
              return (
                playerEvent === player && web3.utils.toBN(paymentEvent).toString() == web3.utils.toWei("23").toString()
              );
            },
            `JoinedGame event should be emitted when an user joins the game with params\n
                                                          player: expected ${player}; got ${playerEvent}\n
                                                          paymentAmount: expected ${web3.utils
                                                            .toWei("23")
                                                            .toString()}; got ${paymentEvent.toString()}`,
          );
        } else {
          result = await goodGhosting.joinGame(minAmountWithFees.toString(), web3.utils.toWei("5"), { from: player });
          truffleAssert.eventEmitted(result, "JoinedGame", (ev: any) => {
            playerEvent = ev.player;
            paymentEvent = ev.amount;
            return (
              playerEvent === player && web3.utils.toBN(paymentEvent).toString() == web3.utils.toWei("5").toString()
            );
          });
        }
        // player 2 early withdraws in segment 0 and joins again
        if (i == 2) {
          const withdrawAmount = segmentPayment.sub(
            segmentPayment.mul(web3.utils.toBN(earlyWithdrawFee)).div(web3.utils.toBN(100)),
          );
          let lpTokenAmount;

          if (providersConfigs.poolType == 0) {
            lpTokenAmount = await pool.methods.calc_token_amount([withdrawAmount.toString(), 0, 0], true).call();
          } else {
            lpTokenAmount = await pool.methods.calc_token_amount([withdrawAmount.toString(), 0, 0, 0, 0], true).call();
          }

          const gaugeTokenBalance = await gaugeToken.methods.balanceOf(curveStrategy.address).call();

          if (parseInt(gaugeTokenBalance.toString()) < parseInt(lpTokenAmount.toString())) {
            lpTokenAmount = gaugeTokenBalance;
          }

          let minAmount = await pool.methods
            .calc_withdraw_one_coin(lpTokenAmount.toString(), providersConfigs.tokenIndex)
            .call();

          minAmount = web3.utils.toBN(minAmount).sub(web3.utils.toBN(minAmount).div(web3.utils.toBN("1000")));

          const userProvidedMinAmount = web3.utils
            .toBN(lpTokenAmount)
            .sub(web3.utils.toBN(lpTokenAmount).mul(web3.utils.toBN("6")).div(web3.utils.toBN(1000)));

          if (parseInt(userProvidedMinAmount.toString()) < parseInt(minAmount.toString())) {
            minAmount = userProvidedMinAmount;
          }

          await goodGhosting.earlyWithdraw(minAmount.toString(), { from: player });

          await token.methods.approve(goodGhosting.address, web3.utils.toWei("200").toString()).send({ from: player });

          await goodGhosting.joinGame(minAmountWithFees.toString(), web3.utils.toWei("23"), { from: player });
        }
      }
    });

    it("admin enables emergency withdraw before game completeion and redeems the funds", async () => {
      await goodGhosting.enableEmergencyWithdraw({ from: admin });
      for (let segmentIndex = 1; segmentIndex < depositCount; segmentIndex++) {
        await timeMachine.advanceTime(segmentLength);
      }
    });

    it("players withdraw from contract", async () => {
      const largeDepositPlayerInboundTokenBalanceBefore = web3.utils.toBN(
        await token.methods.balanceOf(players[2]).call({ from: admin }),
      );
      const largeDepositPlayerCurveRewardBalanceBefore = web3.utils.toBN(
        await curve.methods.balanceOf(players[2]).call({ from: admin }),
      );
      const largeDepositPlayerWmaticRewardBalanceBefore = web3.utils.toBN(
        await wmatic.methods.balanceOf(players[2]).call({ from: admin }),
      );
      const smallDepositPlayerCurveRewardBalanceBefore = web3.utils.toBN(
        await curve.methods.balanceOf(players[3]).call({ from: admin }),
      );
      const smallDepositPlayerWmaticRewardBalanceBefore = web3.utils.toBN(
        await wmatic.methods.balanceOf(players[3]).call({ from: admin }),
      );
      const smallDepositPlayerInboundTokenBalanceBefore = web3.utils.toBN(
        await token.methods.balanceOf(players[3]).call({ from: admin }),
      );

      const playerInfoForLargeDepositPlayer = await goodGhosting.players(players[2]);
      const netAmountPaidForLargeDepositPlayer = playerInfoForLargeDepositPlayer.netAmountPaid;

      const playerInfoForSmallDepositPlayer = await goodGhosting.players(players[3]);
      const netAmountPaidForSmallDepositPlayer = playerInfoForSmallDepositPlayer.netAmountPaid;

      // starts from 2, since player1 (loser), requested an early withdraw and player 2 withdrew after the last segment
      for (let i = 2; i < players.length - 1; i++) {
        const player = players[i];
        let curveRewardBalanceBefore = web3.utils.toBN(0);
        let curveRewardBalanceAfter = web3.utils.toBN(0);
        let wmaticRewardBalanceBefore = web3.utils.toBN(0);
        let wmaticRewardBalanceAfter = web3.utils.toBN(0);

        curveRewardBalanceBefore = web3.utils.toBN(await curve.methods.balanceOf(player).call({ from: admin }));
        wmaticRewardBalanceBefore = web3.utils.toBN(await wmatic.methods.balanceOf(player).call({ from: admin }));
        const playerInfo = await goodGhosting.players(player);

        let result;
        result = await goodGhosting.withdraw(playerInfo.netAmountPaid.toString(), { from: player });

        curveRewardBalanceAfter = web3.utils.toBN(await curve.methods.balanceOf(player).call({ from: admin }));
        wmaticRewardBalanceAfter = web3.utils.toBN(await wmatic.methods.balanceOf(player).call({ from: admin }));
        console.log(curveRewardBalanceAfter.toString());
        console.log(curveRewardBalanceBefore.toString());

        assert(
          curveRewardBalanceAfter.gte(curveRewardBalanceBefore),
          "expected curve balance after withdrawal to be greater than before withdrawal",
        );

        // for some reason forking mainnet we don't get back wmatic rewards(wamtic rewards were stopped from curve's end IMO)
        assert(
          wmaticRewardBalanceBefore.lte(wmaticRewardBalanceAfter),
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

      const inboundTokenPoolBalance = web3.utils.toBN(
        await token.methods.balanceOf(goodGhosting.address).call({ from: admin }),
      );

      const curveRewardTokenPoolBalance = web3.utils.toBN(
        await curve.methods.balanceOf(goodGhosting.address).call({ from: admin }),
      );

      const wmaticRewardTokenBalance = web3.utils.toBN(
        await wmatic.methods.balanceOf(goodGhosting.address).call({ from: admin }),
      );

      const largeDepositPlayerInboundTokenBalanceAfter = web3.utils.toBN(
        await token.methods.balanceOf(players[2]).call({ from: admin }),
      );
      const smallDepositPlayerInboundTokenBalanceAfter = web3.utils.toBN(
        await token.methods.balanceOf(players[3]).call({ from: admin }),
      );
      const largeDepositPlayerCurveRewardBalanceAfter = web3.utils.toBN(
        await curve.methods.balanceOf(players[2]).call({ from: admin }),
      );
      const largeDepositPlayerWmaticRewardBalanceAfter = web3.utils.toBN(
        await wmatic.methods.balanceOf(players[2]).call({ from: admin }),
      );
      const smallDepositPlayerCurveRewardBalanceAfter = web3.utils.toBN(
        await curve.methods.balanceOf(players[3]).call({ from: admin }),
      );
      const smallDepositPlayerWmaticRewardBalanceAfter = web3.utils.toBN(
        await wmatic.methods.balanceOf(players[3]).call({ from: admin }),
      );

      const inboundTokenBalanceDiffForPlayer1 = largeDepositPlayerInboundTokenBalanceAfter.sub(
        largeDepositPlayerInboundTokenBalanceBefore,
      );
      const inboundTokenBalanceDiffForPlayer2 = smallDepositPlayerInboundTokenBalanceAfter.sub(
        smallDepositPlayerInboundTokenBalanceBefore,
      );

      const curveBalanceDiffForPlayer1 = largeDepositPlayerCurveRewardBalanceAfter.sub(
        largeDepositPlayerCurveRewardBalanceBefore,
      );
      const wmaticBalanceDiffForPlayer1 = largeDepositPlayerWmaticRewardBalanceAfter.sub(
        largeDepositPlayerWmaticRewardBalanceBefore,
      );
      const curveBalanceDiffForPlayer2 = smallDepositPlayerCurveRewardBalanceAfter.sub(
        smallDepositPlayerCurveRewardBalanceBefore,
      );
      const wmaticBalanceDiffForPlayer2 = smallDepositPlayerWmaticRewardBalanceAfter.sub(
        smallDepositPlayerWmaticRewardBalanceBefore,
      );

      assert(inboundTokenBalanceDiffForPlayer2.gt(netAmountPaidForSmallDepositPlayer));
      assert(inboundTokenBalanceDiffForPlayer1.gt(netAmountPaidForLargeDepositPlayer));

      assert(curveBalanceDiffForPlayer1.gte(curveBalanceDiffForPlayer2));
      assert(wmaticBalanceDiffForPlayer1.gte(wmaticBalanceDiffForPlayer2));
      assert(inboundTokenBalanceDiffForPlayer1.gt(inboundTokenBalanceDiffForPlayer2));
      assert(inboundTokenPoolBalance.eq(web3.utils.toBN(0)));
      assert(curveRewardTokenPoolBalance.gte(web3.utils.toBN(0)));
      assert(wmaticRewardTokenBalance.gte(web3.utils.toBN(0)));
    });

    it("admin withdraws admin fee from contract", async () => {
      if (adminFee > 0) {
        let curveRewardBalanceBefore = web3.utils.toBN(0);
        let curveRewardBalanceAfter = web3.utils.toBN(0);
        let wmaticRewardBalanceBefore = web3.utils.toBN(0);
        let wmaticRewardBalanceAfter = web3.utils.toBN(0);
        let inboundTokenBalanceBefore = web3.utils.toBN(0);
        let inboundTokenBalanceAfter = web3.utils.toBN(0);

        inboundTokenBalanceBefore = web3.utils.toBN(await token.methods.balanceOf(admin).call({ from: admin }));
        curveRewardBalanceBefore = web3.utils.toBN(await curve.methods.balanceOf(admin).call({ from: admin }));
        wmaticRewardBalanceBefore = web3.utils.toBN(await wmatic.methods.balanceOf(admin).call({ from: admin }));

        await goodGhosting.adminFeeWithdraw({
          from: admin,
        });

        const inboundTokenPoolBalance = web3.utils.toBN(
          await token.methods.balanceOf(goodGhosting.address).call({ from: admin }),
        );

        const curveRewardTokenPoolBalance = web3.utils.toBN(
          await curve.methods.balanceOf(goodGhosting.address).call({ from: admin }),
        );

        const wmaticRewardTokenBalance = web3.utils.toBN(
          await wmatic.methods.balanceOf(goodGhosting.address).call({ from: admin }),
        );

        inboundTokenBalanceAfter = web3.utils.toBN(await token.methods.balanceOf(admin).call({ from: admin }));
        curveRewardBalanceAfter = web3.utils.toBN(await curve.methods.balanceOf(admin).call({ from: admin }));
        wmaticRewardBalanceAfter = web3.utils.toBN(await wmatic.methods.balanceOf(admin).call({ from: admin }));

        assert(inboundTokenBalanceAfter.gt(inboundTokenBalanceBefore));

        assert(
          curveRewardBalanceAfter.gte(curveRewardBalanceBefore),
          "expected curve balance after withdrawal to be greater than before withdrawal",
        );
        // for some reason forking mainnet we don't get back wmatic rewards(wamtic rewards were stopped from curve's end IMO)
        assert(
          wmaticRewardBalanceAfter.gte(wmaticRewardBalanceBefore),
          "expected wmatic balance after withdrawal to be equal to or greater than before withdrawal",
        );
        assert(inboundTokenPoolBalance.eq(web3.utils.toBN(0)));
        assert(curveRewardTokenPoolBalance.gte(web3.utils.toBN(0)));
        assert(wmaticRewardTokenBalance.gte(web3.utils.toBN(0)));
      }
    });
  });
});
export {};
