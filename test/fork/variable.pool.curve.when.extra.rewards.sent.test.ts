import {
  buildCalcTokenAmountParameters,
  calculateSegmentPayment,
  getBalanceOfIfDefined,
  getCurveAndWMaticTokensContract,
  getCurvePool,
  getDepositTokenContract,
  getDepositTokenDecimals,
  getProvidersConfigCurrentNetwork,
  selectWithdrawAmount,
  shouldExecuteCurveForkVariableDepositTests,
  ZERO_ADDRESS,
} from "./pool.curve.utils";

const Pool = artifacts.require("Pool");
const CurveStrategy = artifacts.require("CurveStrategy");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const curveGauge = require("../../artifacts/contracts/curve/ICurveGauge.sol/ICurveGauge.json");
const configs = require("../../deploy.config");

contract("Variale Deposit Pool with Curve Strategy with extra reward tokens sent to strategy", accounts => {
  if (shouldExecuteCurveForkVariableDepositTests()) return;

  const unlockedDaiAccount = process.env.WHALE_ADDRESS_FORKED_NETWORK;

  let curve: any;
  let wmatic: any;
  let principal: any;

  const GoodGhostingArtifact = Pool;
  const { strategyConfig, providerConfig } = getProvidersConfigCurrentNetwork();

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
  const admin = accounts[0];
  let tokenIndex: any;
  const players = accounts.slice(1, 6); // 5 players
  const loser = players[0];
  const userWithdrawingAfterLastSegment = players[1];

  const tokenDecimals = getDepositTokenDecimals(providerConfig);
  const segmentPayment = calculateSegmentPayment(tokenDecimals, segmentPaymentInt);
  const player2DepositValue = segmentPayment.mul(web3.utils.toBN(3));

  let goodGhosting: any;

  describe("simulates a full game with 5 players and 4 of them winning the game and with admin fee % as 0", async () => {
    it("initializes contract instances and transfers Inbound Token to players", async () => {
      pool = getCurvePool(strategyConfig);
      token = getDepositTokenContract(providerConfig);

      ({ curveContract: curve, wmaticContract: wmatic } = getCurveAndWMaticTokensContract());

      goodGhosting = await GoodGhostingArtifact.deployed();
      curveStrategy = await CurveStrategy.deployed();
      tokenIndex = await curveStrategy.inboundTokenIndex();
      tokenIndex = tokenIndex.toString();
      if (gaugeToken) {
        gaugeToken = new web3.eth.Contract(curveGauge.abi, strategyConfig.gauge);
      }

      if (configs.deployConfigs.strategy !== "polygon-curve-stmatic-matic") {
        const unlockedBalance = await token.methods.balanceOf(unlockedDaiAccount).call({ from: admin });
        const daiAmount = segmentPayment.mul(web3.utils.toBN(depositCount * 17)).toString();
        console.log(
          "unlockedBalance: ",
          web3.utils.toBN(unlockedBalance).div(web3.utils.toBN(tokenDecimals)).toString(),
        );
        console.log("daiAmountToTransfer", web3.utils.toBN(daiAmount).div(web3.utils.toBN(tokenDecimals)).toString());
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
            web3.utils.toBN(playerBalance).div(web3.utils.toBN(tokenDecimals)).toString(),
          );
        }
      } else {
        const daiAmount = segmentPayment.mul(web3.utils.toBN(depositCount * 17)).toString();
        await token.methods.deposit().send({ from: accounts[5], value: daiAmount });
        await token.methods.deposit().send({ from: accounts[6], value: daiAmount });
        await token.methods.deposit().send({ from: accounts[7], value: daiAmount });
        await token.methods.deposit().send({ from: accounts[8], value: daiAmount });
        await token.methods.deposit().send({ from: accounts[9], value: daiAmount });
        await token.methods.transfer(players[0], daiAmount.toString()).send({ from: accounts[5] });
        await token.methods.transfer(players[1], daiAmount.toString()).send({ from: accounts[6] });
        await token.methods.transfer(players[2], daiAmount.toString()).send({ from: accounts[7] });
        await token.methods.transfer(players[3], daiAmount.toString()).send({ from: accounts[8] });
        await token.methods.transfer(players[4], daiAmount.toString()).send({ from: accounts[9] });

        for (let i = 0; i < players.length; i++) {
          const player = players[i];
          // await token.methods.deposit().send({ from: player, value: daiAmount });
          const playerBalance = await token.methods.balanceOf(player).call({ from: admin });
          console.log(
            `player${i + 1}DAIBalance`,
            web3.utils.toBN(playerBalance).div(web3.utils.toBN(tokenDecimals)).toString(),
          );
        }
      }

      if (curve) {
        await curve.methods
          .transfer(curveStrategy.address, web3.utils.toWei("0.2").toString())
          .send({ from: unlockedDaiAccount });
      }
    });

    it("players approve Inbound Token to contract and join the game", async () => {
      const userSlippageOptions = [1, 3, 4, 2, 1];
      for (let i = 0; i < players.length; i++) {
        const player = players[i];
        await token.methods
          .approve(goodGhosting.address, web3.utils.toWei("200000000000000000").toString())
          .send({ from: player });
        let playerEvent = "";
        let paymentEvent = 0;
        let result;
        let minAmountWithFees: any = 0;
        const userProvidedMinAmount = segmentPayment.sub(
          segmentPayment.mul(web3.utils.toBN(userSlippageOptions[i].toString())).div(web3.utils.toBN(100)),
        );

        const slippageFromContract = await pool.methods
          .calc_token_amount(...buildCalcTokenAmountParameters(segmentPayment, tokenIndex, strategyConfig.poolType))
          .call();

        minAmountWithFees =
          parseInt(userProvidedMinAmount.toString()) > parseInt(slippageFromContract.toString())
            ? web3.utils
                .toBN(slippageFromContract)
                .sub(web3.utils.toBN(slippageFromContract).mul(web3.utils.toBN("10")).div(web3.utils.toBN("10000")))
            : userProvidedMinAmount.sub(userProvidedMinAmount.mul(web3.utils.toBN("10")).div(web3.utils.toBN("10000")));
        if (i == 2) {
          result = await goodGhosting.joinGame(minAmountWithFees.toString(), player2DepositValue, { from: player });
          truffleAssert.eventEmitted(
            result,
            "JoinedGame",
            (ev: any) => {
              playerEvent = ev.player;
              paymentEvent = ev.amount;
              return (
                playerEvent === player && web3.utils.toBN(paymentEvent).toString() == player2DepositValue.toString()
              );
            },
            `JoinedGame event should be emitted when an user joins the game with params\n
                                                        player: expected ${player}; got ${playerEvent}\n
                                                        paymentAmount: expected ${player2DepositValue.toString()}; got ${paymentEvent.toString()}`,
          );
        } else {
          result = await goodGhosting.joinGame(minAmountWithFees.toString(), segmentPayment, { from: player });
          truffleAssert.eventEmitted(result, "JoinedGame", (ev: any) => {
            playerEvent = ev.player;
            paymentEvent = ev.amount;
            return playerEvent === player && web3.utils.toBN(paymentEvent).toString() == segmentPayment.toString();
          });
        }
        // player 2 early withdraws in segment 0 and joins again
        if (i == 2) {
          const withdrawAmount = segmentPayment.sub(
            segmentPayment.mul(web3.utils.toBN(earlyWithdrawFee)).div(web3.utils.toBN(100)),
          );
          const toLpValue = selectWithdrawAmount(strategyConfig.poolType, withdrawAmount, segmentPayment);
          let lpTokenAmount = await pool.methods
            .calc_token_amount(...buildCalcTokenAmountParameters(toLpValue, tokenIndex, strategyConfig.poolType))
            .call();

          const gaugeTokenBalance = await getBalanceOfIfDefined(gaugeToken, curveStrategy.address);

          if (
            !gaugeTokenBalance.isZero() &&
            parseInt(gaugeTokenBalance.toString()) < parseInt(lpTokenAmount.toString())
          ) {
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
            .approve(goodGhosting.address, web3.utils.toWei("200000000000000000").toString())
            .send({ from: player });

          await goodGhosting.joinGame(minAmountWithFees.toString(), player2DepositValue, { from: player });
        }
      }
    });

    it("runs the game - 'player1' early withdraws and other players complete game successfully", async () => {
      const userSlippageOptions = [3, 5, 1, 4, 2];
      let depositResult, earlyWithdrawResult;

      // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
      for (let segmentIndex = 1; segmentIndex < depositCount; segmentIndex++) {
        await timeMachine.advanceTime(segmentLength);
        // j must start at 1 - Player1 (index 0) early withdraws after everyone else deposits, so won't continue making deposits
        for (let j = 2; j < players.length; j++) {
          const player = players[j];
          const userProvidedMinAmount = segmentPayment.sub(
            segmentPayment.mul(web3.utils.toBN(userSlippageOptions[j].toString())).div(web3.utils.toBN(100)),
          );

          const slippageFromContract = await pool.methods
            .calc_token_amount(...buildCalcTokenAmountParameters(segmentPayment, tokenIndex, strategyConfig.poolType))
            .call();

          const minAmountWithFees =
            parseInt(userProvidedMinAmount.toString()) > parseInt(slippageFromContract.toString())
              ? web3.utils
                  .toBN(slippageFromContract)
                  .sub(web3.utils.toBN(slippageFromContract).mul(web3.utils.toBN("10")).div(web3.utils.toBN("1000")))
              : userProvidedMinAmount.sub(
                  userProvidedMinAmount.mul(web3.utils.toBN("10")).div(web3.utils.toBN("1000")),
                );
          if (j == 2) {
            depositResult = await goodGhosting.makeDeposit(minAmountWithFees.toString(), player2DepositValue, {
              from: player,
            });
            truffleAssert.eventEmitted(
              depositResult,
              "Deposit",
              (ev: any) => ev.player === player && ev.segment.toNumber() === segmentIndex,
              `player ${j} unable to deposit for segment ${segmentIndex}`,
            );
          } else {
            depositResult = await goodGhosting.makeDeposit(minAmountWithFees.toString(), segmentPayment, {
              from: player,
            });
            truffleAssert.eventEmitted(
              depositResult,
              "Deposit",
              (ev: any) => ev.player === player && ev.segment.toNumber() === segmentIndex,
              `player ${j} unable to deposit for segment ${segmentIndex}`,
            );
          }
        }

        // Player 1 (index 0 - loser), performs an early withdraw on first segment.
        if (segmentIndex === 1) {
          const playerInfo = await goodGhosting.players(loser);

          // const playerInfo = await goodGhosting.methods.players(loser).call()
          const withdrawAmount = playerInfo.amountPaid.sub(
            playerInfo.amountPaid.mul(web3.utils.toBN(earlyWithdrawFee)).div(web3.utils.toBN(100)),
          );
          const toLpValue = selectWithdrawAmount(strategyConfig.poolType, withdrawAmount, segmentPayment);
          let lpTokenAmount = await pool.methods
            .calc_token_amount(...buildCalcTokenAmountParameters(toLpValue, tokenIndex, strategyConfig.poolType))
            .call();

          const gaugeTokenBalance = await getBalanceOfIfDefined(gaugeToken, curveStrategy.address);
          if (
            !gaugeTokenBalance.isZero() &&
            parseInt(gaugeTokenBalance.toString()) < parseInt(lpTokenAmount.toString())
          ) {
            lpTokenAmount = gaugeTokenBalance;
          }
          let minAmount = await pool.methods.calc_withdraw_one_coin(lpTokenAmount.toString(), tokenIndex).call();

          minAmount = web3.utils.toBN(minAmount).sub(web3.utils.toBN(minAmount).div(web3.utils.toBN("1000")));

          const userProvidedMinAmount = web3.utils
            .toBN(lpTokenAmount)
            .sub(web3.utils.toBN(lpTokenAmount).mul(web3.utils.toBN("2")).div(web3.utils.toBN(1000)));
          if (parseInt(userProvidedMinAmount.toString()) < parseInt(minAmount.toString())) {
            minAmount = userProvidedMinAmount;
          }

          earlyWithdrawResult = await goodGhosting.earlyWithdraw(minAmount.toString(), { from: loser });

          truffleAssert.eventEmitted(
            earlyWithdrawResult,
            "EarlyWithdrawal",
            (ev: any) => ev.player === loser,
            "loser unable to early withdraw from game",
          );
        }
      }
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      const playerInfo = await goodGhosting.players(userWithdrawingAfterLastSegment);
      const withdrawAmount = playerInfo.amountPaid.sub(
        playerInfo.amountPaid.mul(web3.utils.toBN(earlyWithdrawFee)).div(web3.utils.toBN(100)),
      );
      const toLpValue = selectWithdrawAmount(strategyConfig.poolType, withdrawAmount, segmentPayment);
      let lpTokenAmount = await pool.methods
        .calc_token_amount(...buildCalcTokenAmountParameters(toLpValue, tokenIndex, strategyConfig.poolType))
        .call();

      const gaugeTokenBalance = await getBalanceOfIfDefined(gaugeToken, curveStrategy.address);
      if (!gaugeTokenBalance.isZero() && parseInt(gaugeTokenBalance.toString()) < parseInt(lpTokenAmount.toString())) {
        lpTokenAmount = gaugeTokenBalance;
      }
      let minAmount = await pool.methods.calc_withdraw_one_coin(lpTokenAmount.toString(), tokenIndex).call();

      minAmount = web3.utils.toBN(minAmount).sub(web3.utils.toBN(minAmount).div(web3.utils.toBN("1000")));

      const userProvidedMinAmount = web3.utils
        .toBN(lpTokenAmount)
        .sub(web3.utils.toBN(lpTokenAmount).mul(web3.utils.toBN("15")).div(web3.utils.toBN(1000)));
      if (parseInt(userProvidedMinAmount.toString()) < parseInt(minAmount.toString())) {
        minAmount = userProvidedMinAmount;
      }

      await goodGhosting.earlyWithdraw(minAmount.toString(), { from: userWithdrawingAfterLastSegment });
      await timeMachine.advanceTime(segmentLength);
      const waitingRoundLength = await goodGhosting.waitingRoundSegmentLength();
      await timeMachine.advanceTime(parseInt(waitingRoundLength.toString()));
    });

    it("players withdraw from contract", async () => {
      principal = await goodGhosting.netTotalGamePrincipal();

      const largeDepositPlayerInboundTokenBalanceBefore = web3.utils.toBN(
        await getBalanceOfIfDefined(token, players[2], admin),
      );
      const largeDepositPlayerCurveRewardBalanceBefore = web3.utils.toBN(
        await getBalanceOfIfDefined(curve, players[2], admin),
      );
      const largeDepositPlayerWmaticRewardBalanceBefore = web3.utils.toBN(
        await getBalanceOfIfDefined(wmatic, players[2], admin),
      );
      const smallDepositPlayerCurveRewardBalanceBefore = web3.utils.toBN(
        await getBalanceOfIfDefined(curve, players[3], admin),
      );
      const smallDepositPlayerWmaticRewardBalanceBefore = web3.utils.toBN(
        await getBalanceOfIfDefined(wmatic, players[3], admin),
      );
      const smallDepositPlayerInboundTokenBalanceBefore = web3.utils.toBN(
        await getBalanceOfIfDefined(token, players[3], admin),
      );

      const playerInfoForLargeDepositPlayer = await goodGhosting.players(players[2]);
      const netAmountPaidForLargeDepositPlayer = playerInfoForLargeDepositPlayer.netAmountPaid;

      const playerInfoForSmallDepositPlayer = await goodGhosting.players(players[3]);
      const netAmountPaidForSmallDepositPlayer = playerInfoForSmallDepositPlayer.netAmountPaid;

      // starts from 2, since player1 (loser), requested an early withdraw and player 2 withdrew after the last segment
      for (let i = 2; i < players.length; i++) {
        const player = players[i];
        let curveRewardBalanceBefore = web3.utils.toBN(0);
        let curveRewardBalanceAfter = web3.utils.toBN(0);
        let wmaticRewardBalanceBefore = web3.utils.toBN(0);
        let wmaticRewardBalanceAfter = web3.utils.toBN(0);

        curveRewardBalanceBefore = web3.utils.toBN(await getBalanceOfIfDefined(curve, player, admin));
        wmaticRewardBalanceBefore = web3.utils.toBN(await getBalanceOfIfDefined(wmatic, player, admin));
        const playerInfo = await goodGhosting.players(player);

        await goodGhosting.withdraw("0", { from: player });

        curveRewardBalanceAfter = web3.utils.toBN(await getBalanceOfIfDefined(curve, player, admin));
        wmaticRewardBalanceAfter = web3.utils.toBN(await getBalanceOfIfDefined(wmatic, player, admin));

        console.log("BALL", curveRewardBalanceAfter.toString());

        if (strategyConfig.gauge !== ZERO_ADDRESS && !curveRewardBalanceAfter.isZero()) {
          assert(
            curveRewardBalanceAfter.gt(curveRewardBalanceBefore),
            "expected curve balance after withdrawal to be greater than before withdrawal",
          );
        }

        // for some reason forking mainnet we don't get back wmatic rewards(wamtic rewards were stopped from curve's end IMO)
        assert(
          wmaticRewardBalanceBefore.lte(wmaticRewardBalanceAfter),
          "expected wmatic balance after withdrawal to be equal to or less than before withdrawal",
        );
      }

      const largeDepositPlayerInboundTokenBalanceAfter = web3.utils.toBN(
        await getBalanceOfIfDefined(token, players[2], admin),
      );
      const smallDepositPlayerInboundTokenBalanceAfter = web3.utils.toBN(
        await getBalanceOfIfDefined(token, players[3], admin),
      );
      const largeDepositPlayerCurveRewardBalanceAfter = web3.utils.toBN(
        await getBalanceOfIfDefined(curve, players[2], admin),
      );
      const largeDepositPlayerWmaticRewardBalanceAfter = web3.utils.toBN(
        await getBalanceOfIfDefined(wmatic, players[2], admin),
      );
      const smallDepositPlayerCurveRewardBalanceAfter = web3.utils.toBN(
        await getBalanceOfIfDefined(curve, players[3], admin),
      );
      const smallDepositPlayerWmaticRewardBalanceAfter = web3.utils.toBN(
        await getBalanceOfIfDefined(wmatic, players[3], admin),
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
        curveRewardBalanceBefore = web3.utils.toBN(await getBalanceOfIfDefined(curve, admin));
        wmaticRewardBalanceBefore = web3.utils.toBN(await getBalanceOfIfDefined(wmatic, admin));

        await goodGhosting.adminFeeWithdraw(0, {
          from: admin,
        });

        const inboundTokenPoolBalance = web3.utils.toBN(
          await token.methods.balanceOf(goodGhosting.address).call({ from: admin }),
        );

        const rewardokenPoolBalance = web3.utils.toBN(await getBalanceOfIfDefined(curve, goodGhosting.address, admin));

        const strategyTotalAmount = await curveStrategy.getTotalAmount();

        const gaugeTokenBalance = await getBalanceOfIfDefined(gaugeToken, curveStrategy.address);

        const leftOverPercent = (parseInt(strategyTotalAmount.toString()) * 100) / parseInt(principal.toString());

        console.log("BAL", inboundTokenPoolBalance.toString());
        console.log("REWARD BAL", rewardokenPoolBalance.toString());
        console.log("NET PRINCIPAL", principal.toString());
        console.log("STRATEGY BAL", strategyTotalAmount.toString());
        console.log("Gauge BAL", gaugeTokenBalance.toString());
        console.log("Left over %", leftOverPercent.toString());

        inboundTokenBalanceAfter = web3.utils.toBN(await token.methods.balanceOf(admin).call({ from: admin }));
        curveRewardBalanceAfter = web3.utils.toBN(await getBalanceOfIfDefined(curve, admin));
        wmaticRewardBalanceAfter = web3.utils.toBN(await getBalanceOfIfDefined(wmatic, admin));

        assert(inboundTokenBalanceAfter.gt(inboundTokenBalanceBefore));

        if (strategyConfig.gauge !== ZERO_ADDRESS && !curveRewardBalanceAfter.isZero()) {
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
        assert(inboundTokenPoolBalance.eq(web3.utils.toBN(0)));
        // accounting for some dust amount checks the balance is less than the extra amount we added i.e 0.5
        assert(rewardokenPoolBalance.lt(web3.utils.toBN("500000000000000000")));
      }
    });
  });
});
export {};
