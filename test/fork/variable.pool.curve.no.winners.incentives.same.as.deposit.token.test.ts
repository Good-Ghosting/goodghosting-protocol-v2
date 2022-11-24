const Pool = artifacts.require("Pool");
const CurveStrategy = artifacts.require("CurveStrategy");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const wmaticABI = require("../../abi-external/wmatic.abi.json");
const curveGauge = require("../../artifacts/contracts/curve/ICurveGauge.sol/ICurveGauge.json");
const aavepoolABI = require("../../abi-external/curve-aave-pool-abi.json");
const atricryptopoolABI = require("../../abi-external/curve-atricrypto-pool-abi.json");
const configs = require("../../deploy.config");
const providerConfig = require("../../providers.config");
const maticpoolABI = require("../../abi-external/curve-matic-pool-abi.json");

contract(
  "Variale Deposit Pool with Curve Strategy with no winners with incentives sent same as deposit token",
  accounts => {
    // Only executes this test file for local network fork
    if (!["local-variable-polygon"].includes(process.env.NETWORK ? process.env.NETWORK : "")) return;

    const unlockedDaiAccount = process.env.WHALE_ADDRESS_FORKED_NETWORK;
    let providersConfigs: any;
    let GoodGhostingArtifact: any;
    let curve: any;
    let wmatic: any;
    if (configs.deployConfigs.strategy === "polygon-curve-aave") {
      GoodGhostingArtifact = Pool;
      providersConfigs = providerConfig.providers["polygon"].strategies["polygon-curve-aave"];
    } else if (configs.deployConfigs.strategy === "polygon-curve-atricrypto") {
      GoodGhostingArtifact = Pool;
      providersConfigs = providerConfig.providers["polygon"].strategies["polygon-curve-atricrypto"];
    } else {
      GoodGhostingArtifact = Pool;
      providersConfigs = providerConfig.providers["polygon"].strategies["polygon-curve-stmatic-matic"];
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
    let tokenIndex: any;
    let admin = accounts[0];
    const players = accounts.slice(1, 6); // 5 players
    const daiDecimals = web3.utils.toBN(
      10 ** providerConfig.providers["polygon"].tokens[configs.deployConfigs.inboundCurrencySymbol].decimals,
    );
    const segmentPayment = daiDecimals.mul(web3.utils.toBN(segmentPaymentInt)); // equivalent to 10 Inbound Token
    const daiAmount = segmentPayment.mul(web3.utils.toBN(depositCount * 5)).toString();
    let goodGhosting: any;

    describe("simulates a full game with 5 players and 4 of them winning the game and with admin fee % as 0", async () => {
      it("initializes contract instances and transfers Inbound Token to players", async () => {
        if (providersConfigs.poolType == 0) {
          pool = new web3.eth.Contract(aavepoolABI, providersConfigs.pool);
        } else if (providersConfigs.poolType == 1) {
          pool = new web3.eth.Contract(atricryptopoolABI, providersConfigs.pool);
        } else {
          pool = new web3.eth.Contract(maticpoolABI, providersConfigs.pool);
        }

        token = new web3.eth.Contract(
          wmaticABI,
          providerConfig.providers["polygon"].tokens[configs.deployConfigs.inboundCurrencySymbol].address,
        );
        if (configs.deployConfigs.strategy === "polygon-curve-stmatic-matic") {
          curve = new web3.eth.Contract(wmaticABI, providerConfig.providers["polygon"].tokens["ldo"].address);
        } else {
          curve = new web3.eth.Contract(wmaticABI, providerConfig.providers["polygon"].tokens["curve"].address);
        }
        wmatic = new web3.eth.Contract(wmaticABI, providerConfig.providers["polygon"].tokens["wmatic"].address);

        goodGhosting = await GoodGhostingArtifact.deployed();
        curveStrategy = await CurveStrategy.deployed();
        tokenIndex = await curveStrategy.inboundTokenIndex();
        tokenIndex = tokenIndex.toString();
        gaugeToken = new web3.eth.Contract(curveGauge.abi, providersConfigs.gauge);

        if (configs.deployConfigs.strategy !== "polygon-curve-stmatic-matic") {
          const unlockedBalance = await token.methods.balanceOf(unlockedDaiAccount).call({ from: admin });
          const daiAmount = segmentPayment.mul(web3.utils.toBN(depositCount * 17)).toString();
          console.log(
            "unlockedBalance: ",
            web3.utils.toBN(unlockedBalance).div(web3.utils.toBN(daiDecimals)).toString(),
          );
          console.log("daiAmountToTransfer", web3.utils.toBN(daiAmount).div(web3.utils.toBN(daiDecimals)).toString());
          for (let i = 0; i < players.length; i++) {
            const player = players[i];
            let transferAmount = daiAmount;
            if (i === 1) {
              // Player 1 needs additional funds to rejoin
              transferAmount = web3.utils.toBN(daiAmount).add(segmentPayment).toString();
            }
            await token.methods.transfer(player, transferAmount).send({ from: unlockedDaiAccount });
            const playerBalance = await token.methods.balanceOf(player).call({ from: admin });
            console.log(
              `player${i + 1}DAIBalance`,
              web3.utils.toBN(playerBalance).div(web3.utils.toBN(daiDecimals)).toString(),
            );
          }
          await token.methods
            .transfer(goodGhosting.address, web3.utils.toWei("100").toString())
            .send({ from: unlockedDaiAccount });
        } else {
          const daiAmount = segmentPayment.mul(web3.utils.toBN(depositCount * 17)).toString();

          for (let i = 0; i < players.length; i++) {
            const player = players[i];
            await token.methods.deposit().send({ from: player, value: daiAmount });
            const playerBalance = await token.methods.balanceOf(player).call({ from: admin });
            console.log(
              `player${i + 1}DAIBalance`,
              web3.utils.toBN(playerBalance).div(web3.utils.toBN(daiDecimals)).toString(),
            );
          }

          await token.methods.deposit().send({ from: unlockedDaiAccount, value: web3.utils.toWei("100").toString() });

          await token.methods
            .transfer(goodGhosting.address, web3.utils.toWei("100").toString())
            .send({ from: unlockedDaiAccount });
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
          } else if (providersConfigs.poolType == 1) {
            slippageFromContract = await pool.methods
              .calc_token_amount([segmentPayment.toString(), 0, 0, 0, 0], true)
              .call();
          } else {
            slippageFromContract = await pool.methods.calc_token_amount([0, segmentPayment.toString()]).call();
          }

          minAmountWithFees =
            parseInt(userProvidedMinAmount.toString()) > parseInt(slippageFromContract.toString())
              ? web3.utils
                  .toBN(slippageFromContract)
                  .sub(web3.utils.toBN(slippageFromContract).mul(web3.utils.toBN("10")).div(web3.utils.toBN("10000")))
              : userProvidedMinAmount.sub(
                  userProvidedMinAmount.mul(web3.utils.toBN("10")).div(web3.utils.toBN("10000")),
                );
          if (i == 2) {
            result = await goodGhosting.joinGame(minAmountWithFees.toString(), web3.utils.toWei("15"), {
              from: player,
            });
            truffleAssert.eventEmitted(
              result,
              "JoinedGame",
              (ev: any) => {
                playerEvent = ev.player;
                paymentEvent = ev.amount;
                return (
                  playerEvent === player &&
                  web3.utils.toBN(paymentEvent).toString() == web3.utils.toWei("15").toString()
                );
              },
              `JoinedGame event should be emitted when an user joins the game with params\n
                                                        player: expected ${player}; got ${playerEvent}\n
                                                        paymentAmount: expected ${web3.utils
                                                          .toWei("15")
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
            } else if (providersConfigs.poolType == 1) {
              lpTokenAmount = await pool.methods
                .calc_token_amount([withdrawAmount.toString(), 0, 0, 0, 0], true)
                .call();
            } else {
              lpTokenAmount = await pool.methods.calc_token_amount([0, segmentPayment.toString()]).call();
            }

            const gaugeTokenBalance = await gaugeToken.methods.balanceOf(curveStrategy.address).call();

            if (parseInt(gaugeTokenBalance.toString()) < parseInt(lpTokenAmount.toString())) {
              lpTokenAmount = gaugeTokenBalance;
            }

            let minAmount = await pool.methods.calc_withdraw_one_coin(lpTokenAmount.toString(), tokenIndex).call();

            minAmount = web3.utils.toBN(minAmount).sub(web3.utils.toBN(minAmount).div(web3.utils.toBN("1000")));

            const userProvidedMinAmount = web3.utils
              .toBN(lpTokenAmount)
              .sub(web3.utils.toBN(lpTokenAmount).mul(web3.utils.toBN("6")).div(web3.utils.toBN(1000)));

            if (parseInt(userProvidedMinAmount.toString()) < parseInt(minAmount.toString())) {
              minAmount = userProvidedMinAmount;
            }

            await goodGhosting.earlyWithdraw(minAmount.toString(), { from: player });

            await token.methods
              .approve(goodGhosting.address, web3.utils.toWei("200").toString())
              .send({ from: player });

            await goodGhosting.joinGame(minAmountWithFees.toString(), web3.utils.toWei("15"), { from: player });
          }
        }
      });

      it("fast forward the game", async () => {
        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let segmentIndex = 1; segmentIndex < depositCount; segmentIndex++) {
          await timeMachine.advanceTime(segmentLength);
        }

        await timeMachine.advanceTime(segmentLength);
        const waitingRoundLength = await goodGhosting.waitingRoundSegmentLength();
        await timeMachine.advanceTime(parseInt(waitingRoundLength.toString()));
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
        for (let i = 0; i < players.length; i++) {
          const player = players[i];
          let curveRewardBalanceBefore = web3.utils.toBN(0);
          let curveRewardBalanceAfter = web3.utils.toBN(0);
          let wmaticRewardBalanceBefore = web3.utils.toBN(0);
          let wmaticRewardBalanceAfter = web3.utils.toBN(0);

          curveRewardBalanceBefore = web3.utils.toBN(await curve.methods.balanceOf(player).call({ from: admin }));
          wmaticRewardBalanceBefore = web3.utils.toBN(await wmatic.methods.balanceOf(player).call({ from: admin }));

          await goodGhosting.withdraw(0, { from: player });

          curveRewardBalanceAfter = web3.utils.toBN(await curve.methods.balanceOf(player).call({ from: admin }));
          wmaticRewardBalanceAfter = web3.utils.toBN(await wmatic.methods.balanceOf(player).call({ from: admin }));

          assert(
            curveRewardBalanceAfter.eq(curveRewardBalanceBefore),
            "expected curve balance after withdrawal to be equal than before withdrawal",
          );

          // for some reason forking mainnet we don't get back wmatic rewards(wamtic rewards were stopped from curve's end IMO)
          assert(
            wmaticRewardBalanceBefore.lte(wmaticRewardBalanceAfter),
            "expected wmatic balance after withdrawal to be equal to before withdrawal",
          );
        }
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

        const curveBalanceDiffForPlayer2 = smallDepositPlayerCurveRewardBalanceAfter.sub(
          smallDepositPlayerCurveRewardBalanceBefore,
        );

        assert(inboundTokenBalanceDiffForPlayer2.lte(netAmountPaidForSmallDepositPlayer));
        assert(inboundTokenBalanceDiffForPlayer1.lte(netAmountPaidForLargeDepositPlayer));
        assert(curveBalanceDiffForPlayer1.eq(curveBalanceDiffForPlayer2));
        assert(inboundTokenBalanceDiffForPlayer1.gt(inboundTokenBalanceDiffForPlayer2));
      });

      it("admin withdraws admin fee from contract", async () => {
        if (adminFee > 0) {
          let curveRewardBalanceBefore = web3.utils.toBN(0);
          let curveRewardBalanceAfter = web3.utils.toBN(0);
          let wmaticRewardBalanceBefore = web3.utils.toBN(0);
          let wmaticRewardBalanceAfter = web3.utils.toBN(0);

          curveRewardBalanceBefore = web3.utils.toBN(await curve.methods.balanceOf(admin).call({ from: admin }));
          wmaticRewardBalanceBefore = web3.utils.toBN(await wmatic.methods.balanceOf(admin).call({ from: admin }));
          let inboundTokenBalanceBefore = web3.utils.toBN(await token.methods.balanceOf(admin).call({ from: admin }));

          await goodGhosting.adminFeeWithdraw(0, {
            from: admin,
          });

          let inboundTokenBalanceAfter = web3.utils.toBN(await token.methods.balanceOf(admin).call({ from: admin }));

          assert(inboundTokenBalanceAfter.gt(inboundTokenBalanceBefore));

          const inboundTokenPoolBalance = web3.utils.toBN(
            await token.methods.balanceOf(goodGhosting.address).call({ from: admin }),
          );

          const rewardokenPoolBalance = web3.utils.toBN(
            await curve.methods.balanceOf(goodGhosting.address).call({ from: admin }),
          );

          const strategyTotalAmount = await curveStrategy.getTotalAmount();

          const gaugeTokenBalance = await gaugeToken.methods.balanceOf(curveStrategy.address).call();

          console.log("POOL BAL", inboundTokenPoolBalance.toString());
          console.log("REWARD BAL", rewardokenPoolBalance.toString());
          console.log("STRATEGY BAL", strategyTotalAmount.toString());
          console.log("GAUGE BAL", gaugeTokenBalance.toString());

          curveRewardBalanceAfter = web3.utils.toBN(await curve.methods.balanceOf(admin).call({ from: admin }));
          wmaticRewardBalanceAfter = web3.utils.toBN(await wmatic.methods.balanceOf(admin).call({ from: admin }));

          if (providersConfigs.gauge !== ZERO_ADDRESS) {
            assert(
              curveRewardBalanceAfter.gt(curveRewardBalanceBefore),
              "expected curve balance after withdrawal to be greater than before withdrawal",
            );
          }
          // for some reason forking mainnet we don't get back wmatic rewards(wamtic rewards were stopped from curve's end IMO)
          assert(
            wmaticRewardBalanceAfter.gte(wmaticRewardBalanceBefore),
            "expected wmatic balance after withdrawal to be equal to or greater than before withdrawal",
          );
          // dust amount
          assert(inboundTokenPoolBalance.gte(web3.utils.toBN(0)));
        }
      });
    });
  },
);
export {};
