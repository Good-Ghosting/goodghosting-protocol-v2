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
  shouldExecuteCurveForkTests,
  subtractWithExpectedSlippage,
  ZERO_ADDRESS,
} from "./pool.curve.utils";

const Pool = artifacts.require("Pool");
const CurveStrategy = artifacts.require("CurveStrategy");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const curveGauge = require("../../artifacts/contracts/curve/ICurveGauge.sol/ICurveGauge.json");
const configs = require("../../deploy.config");

contract("Pool with Curve Strategy with extra reward tokens sent to strategy & winner withdrawing last", accounts => {
  // Only executes this test file for local network fork
  if (shouldExecuteCurveForkTests()) return;

  const unlockedDaiAccount = process.env.WHALE_ADDRESS_FORKED_NETWORK;

  let curve: any;
  let wmatic: any;

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
  let tokenIndex: any;
  let principal: any;

  const admin = accounts[0];
  const players = accounts.slice(1, 6); // 5 players
  const loser = players[0];
  const userWithdrawingAfterLastSegment = players[1];

  const tokenDecimals = getDepositTokenDecimals(providerConfig);
  const segmentPayment = calculateSegmentPayment(tokenDecimals, segmentPaymentInt);
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
        const daiAmount = segmentPayment.mul(web3.utils.toBN(depositCount)).toString();
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
        const daiAmount = segmentPayment.mul(web3.utils.toBN(depositCount * 8)).toString();

        for (let i = 0; i < players.length; i++) {
          const player = players[i];
          await token.methods.deposit().send({ from: player, value: daiAmount });
          const playerBalance = await token.methods.balanceOf(player).call({ from: admin });
          console.log(
            `player${i + 1}DAIBalance`,
            web3.utils.toBN(playerBalance).div(web3.utils.toBN(tokenDecimals)).toString(),
          );
        }
      }
      if (curve) {
        await curve.methods
          .transfer(
            curveStrategy.address,
            tokenDecimals.mul(web3.utils.toBN("3")).div(web3.utils.toBN("10")).toString(),
          )
          .send({ from: unlockedDaiAccount });
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

        result = await goodGhosting.joinGame(minAmountWithFees.toString(), 0, { from: player });
        // player 1 early withdraws in segment 0 and joins again
        if (i == 1) {
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

          minAmount = subtractWithExpectedSlippage(minAmount);

          const userProvidedMinAmount = web3.utils
            .toBN(lpTokenAmount)
            .sub(web3.utils.toBN(lpTokenAmount).mul(web3.utils.toBN("6")).div(web3.utils.toBN(1000)));

          if (parseInt(userProvidedMinAmount.toString()) < parseInt(minAmount.toString())) {
            minAmount = userProvidedMinAmount;
          }

          await goodGhosting.earlyWithdraw(minAmount.toString(), { from: player });

          await token.methods
            .approve(goodGhosting.address, segmentPayment.mul(web3.utils.toBN(depositCount)).toString())
            .send({ from: player });

          await goodGhosting.joinGame(minAmountWithFees.toString(), 0, { from: player });
        }
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

    it("runs the game - 'player1' early withdraws and other players complete game successfully", async () => {
      const userSlippageOptions = [3, 5, 1, 4, 2];
      let depositResult, earlyWithdrawResult;

      // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
      for (let segmentIndex = 1; segmentIndex < depositCount; segmentIndex++) {
        await timeMachine.advanceTime(segmentLength);
        // j must start at 1 - Player1 (index 0) early withdraws after everyone else deposits, so won't continue making deposits
        // only 1 player wins rest all players are ghosts
        for (let j = 2; j < 3; j++) {
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
          depositResult = await goodGhosting.makeDeposit(minAmountWithFees.toString(), 0, { from: player });

          truffleAssert.eventEmitted(
            depositResult,
            "Deposit",
            (ev: any) => ev.player === player && ev.segment.toNumber() === segmentIndex,
            `player ${j} unable to deposit for segment ${segmentIndex}`,
          );
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

          minAmount = subtractWithExpectedSlippage(minAmount);

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
      const winnerCountBeforeEarlyWithdraw = await goodGhosting.winnerCount();
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

      minAmount = subtractWithExpectedSlippage(minAmount);

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

    it("ghosts withdraw from contract", async () => {
      principal = await goodGhosting.netTotalGamePrincipal();

      for (let i = 3; i < players.length; i++) {
        const player = players[i];
        let curveRewardBalanceBefore = web3.utils.toBN(0);
        let curveRewardBalanceAfter = web3.utils.toBN(0);

        let inboundTokenBalanceBeforeRedeem = await token.methods.balanceOf(player).call();

        curveRewardBalanceBefore = await getBalanceOfIfDefined(curve, player, admin);
        const playerInfo = await goodGhosting.players(player);
        const netAmountPaid = playerInfo.netAmountPaid;

        await goodGhosting.withdraw(0, { from: player });

        let inboundTokenBalanceAfterRedeem = await token.methods.balanceOf(player).call();
        curveRewardBalanceAfter = await getBalanceOfIfDefined(curve, player, admin);

        const difference = web3.utils
          .toBN(inboundTokenBalanceAfterRedeem)
          .sub(web3.utils.toBN(inboundTokenBalanceBeforeRedeem));

        assert(difference.lte(netAmountPaid), "expected balance diff to be more than paid amount");
      }
    });

    it("admin withdraws admin fee from contract", async () => {
      if (adminFee > 0) {
        let curveRewardBalanceBefore = web3.utils.toBN(0);
        let curveRewardBalanceAfter = web3.utils.toBN(0);
        let wmaticRewardBalanceBefore = web3.utils.toBN(0);
        let wmaticRewardBalanceAfter = web3.utils.toBN(0);

        let inboundTokenBalanceBefore = web3.utils.toBN(await token.methods.balanceOf(admin).call({ from: admin }));
        curveRewardBalanceBefore = await getBalanceOfIfDefined(curve, admin);
        wmaticRewardBalanceBefore = await getBalanceOfIfDefined(wmatic, admin);

        await goodGhosting.adminFeeWithdraw(0, {
          from: admin,
        });

        let inboundTokenBalanceAfter = web3.utils.toBN(await token.methods.balanceOf(admin).call({ from: admin }));

        assert(inboundTokenBalanceAfter.gt(inboundTokenBalanceBefore));

        curveRewardBalanceAfter = await getBalanceOfIfDefined(curve, admin);
        wmaticRewardBalanceAfter = await getBalanceOfIfDefined(wmatic, admin);

        if (strategyConfig.gauge !== ZERO_ADDRESS && !curveRewardBalanceAfter.isZero()) {
          assert(
            curveRewardBalanceAfter.gt(curveRewardBalanceBefore),
            "expected curve balance after withdrawal to be greater than before withdrawal",
          );
        }
        // since winner withdraws at the end so we don't need the reward balance check here
        // for some reason forking mainnet we don't get back wmatic rewards(wamtic rewards were stopped from curve's end IMO)
        assert(
          wmaticRewardBalanceAfter.gte(wmaticRewardBalanceBefore),
          "expected wmatic balance after withdrawal to be equal to or greater than before withdrawal",
        );
      }
    });

    it("winner withdrawing at the end", async () => {
      const player = players[2];
      let curveRewardBalanceBefore = web3.utils.toBN(0);
      let curveRewardBalanceAfter = web3.utils.toBN(0);

      let inboundTokenBalanceBeforeRedeem = await token.methods.balanceOf(player).call();

      curveRewardBalanceBefore = await getBalanceOfIfDefined(curve, player, admin);
      const playerInfo = await goodGhosting.players(player);
      const netAmountPaid = playerInfo.netAmountPaid;

      await goodGhosting.withdraw(0, { from: player });

      let inboundTokenBalanceAfterRedeem = await token.methods.balanceOf(player).call();
      curveRewardBalanceAfter = await getBalanceOfIfDefined(curve, player, admin);

      const difference = web3.utils
        .toBN(inboundTokenBalanceAfterRedeem)
        .sub(web3.utils.toBN(inboundTokenBalanceBeforeRedeem));

      console.log(curveRewardBalanceAfter.toString());

      if (strategyConfig.gauge !== ZERO_ADDRESS && !curveRewardBalanceAfter.isZero()) {
        assert(
          curveRewardBalanceAfter.gt(curveRewardBalanceBefore),
          "expected curve balance after withdrawal to be greater than before withdrawal",
        );
      }

      assert(difference.gt(netAmountPaid), "expected balance diff to be more than paid amount");

      const inboundcrvTokenPoolBalance = await getBalanceOfIfDefined(curve, goodGhosting.address, admin);

      const inboundTokenPoolBalance = web3.utils.toBN(
        await token.methods.balanceOf(goodGhosting.address).call({ from: admin }),
      );

      const strategyTotalAmount = await curveStrategy.getTotalAmount();

      const gaugeTokenBalance = await getBalanceOfIfDefined(gaugeToken, curveStrategy.address);

      const leftOverPercent = (parseInt(strategyTotalAmount.toString()) * 100) / parseInt(principal.toString());

      console.log("BAL", inboundTokenPoolBalance.toString());
      console.log("NET PRINCIPAL", principal.toString());
      console.log("REWARD BAL", inboundcrvTokenPoolBalance.toString());
      console.log("STRATEGY BAL", strategyTotalAmount.toString());
      console.log("Gauge BAL", gaugeTokenBalance.toString());
      console.log("Left over %", leftOverPercent.toString());

      // due to sol precsiion handling some dust amount is still left in
      assert(inboundcrvTokenPoolBalance.lt(web3.utils.toBN("300000000000000000")));
    });
  });
});
export {};
