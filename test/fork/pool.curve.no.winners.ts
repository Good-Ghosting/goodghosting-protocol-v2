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

contract("Pool with Curve Strategy with no winners", accounts => {
  // Only executes this test file for local network fork
  if (!["local-polygon-curve"].includes(process.env.NETWORK ? process.env.NETWORK : "")) return;

  const unlockedDaiAccount = process.env.DAI_ACCOUNT_HOLDER_FORKED_NETWORK;
  let providersConfigs: any;
  let GoodGhostingArtifact: any;
  let curve: any;
  let wmatic: any;
  if (process.env.NETWORK === "local-polygon-curve") {
    GoodGhostingArtifact = Pool;
    providersConfigs = configs.providers["aave"]["polygon-curve"];
  }
  const {
    depositCount,
    segmentLength,
    segmentPayment: segmentPaymentInt,
    adminFee,
    earlyWithdrawFee,
    maxPlayersCount,
  } = configs.deployConfigs;
  // const BN = web3.utils.toBN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
  let token: any;
  let pool: any;
  let gaugeToken: any;
  let curveStrategy: any;
  let admin = accounts[0];
  const players = accounts.slice(1, 6); // 5 players
  const loser = players[0];
  const userWithdrawingAfterLastSegment = players[1];
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
      token = new web3.eth.Contract(wmaticABI.abi, providersConfigs.dai.address);
      curve = new web3.eth.Contract(wmaticABI.abi, providersConfigs.curve);
      wmatic = new web3.eth.Contract(wmaticABI.abi, providersConfigs.wmatic);

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
        // player 1 early withdraws in segment 0 and joins again
        if (i == 1) {
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
        for (let j = 1; j < players.length - 1; j++) {
          const player = players[j];
          let slippageFromContract;
          const userProvidedMinAmount = segmentPayment.sub(
            segmentPayment.mul(web3.utils.toBN(userSlippageOptions[j].toString())).div(web3.utils.toBN(100)),
          );

          if (providersConfigs.poolType == 0) {
            slippageFromContract = await pool.methods.calc_token_amount([segmentPayment.toString(), 0, 0], true).call();
          } else {
            slippageFromContract = await pool.methods
              .calc_token_amount([segmentPayment.toString(), 0, 0, 0, 0], true)
              .call();
          }

          const minAmountWithFees =
            parseInt(userProvidedMinAmount.toString()) > parseInt(slippageFromContract.toString())
              ? web3.utils
                  .toBN(slippageFromContract)
                  .sub(web3.utils.toBN(slippageFromContract).mul(web3.utils.toBN("10")).div(web3.utils.toBN("1000")))
              : userProvidedMinAmount.sub(
                  userProvidedMinAmount.mul(web3.utils.toBN("10")).div(web3.utils.toBN("1000")),
                );
          if (segmentIndex < depositCount - 1) {
            depositResult = await goodGhosting.makeDeposit(minAmountWithFees.toString(), 0, { from: player });

            truffleAssert.eventEmitted(
              depositResult,
              "Deposit",
              (ev: any) => ev.player === player && ev.segment.toNumber() === segmentIndex,
              `player ${j} unable to deposit for segment ${segmentIndex}`,
            );
          }
        }
      }
      await timeMachine.advanceTime(segmentLength);
      const waitingRoundLength = await goodGhosting.waitingRoundSegmentLength();
      await timeMachine.advanceTime(parseInt(waitingRoundLength.toString()));
    });

    it("redeems funds from external pool", async () => {
      const userSlippage = 1;
      let minAmount;
      let mobiBalanceBeforeRedeem, mobiBalanceAfterRedeem, celoBalanceBeforeRedeem, celoBalanceAfterRedeem;
      mobiBalanceBeforeRedeem = await curve.methods.balanceOf(goodGhosting.address).call();
      celoBalanceBeforeRedeem = await wmatic.methods.balanceOf(goodGhosting.address).call();

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

      let eventAmount = web3.utils.toBN(0);
      let result;
      result = await goodGhosting.redeemFromExternalPoolForFixedDepositPool(minAmount.toString(), {
        from: admin,
      });

      mobiBalanceAfterRedeem = await curve.methods.balanceOf(goodGhosting.address).call();
      celoBalanceAfterRedeem = await wmatic.methods.balanceOf(goodGhosting.address).call();

      assert(web3.utils.toBN(mobiBalanceBeforeRedeem).lt(web3.utils.toBN(mobiBalanceAfterRedeem)));
      // for some reason forking mainnet we don't get back wmatic rewards so the before and after balance is equal
      assert(web3.utils.toBN(celoBalanceBeforeRedeem).lte(web3.utils.toBN(celoBalanceAfterRedeem)));

      const contractsDaiBalance = web3.utils.toBN(
        await token.methods.balanceOf(goodGhosting.address).call({ from: admin }),
      );
      console.log("contractsDaiBalance", contractsDaiBalance.toString());
      truffleAssert.eventEmitted(
        result,
        "FundsRedeemedFromExternalPool",
        (ev: any) => {
          console.log("totalContractAmount", ev.totalAmount.toString());
          console.log("totalGamePrincipal", ev.totalGamePrincipal.toString());
          console.log("totalGameInterest", ev.totalGameInterest.toString());
          console.log("interestPerPlayer", ev.totalGameInterest.div(web3.utils.toBN(players.length - 1)).toString());
          const adminFee = web3.utils
            .toBN(configs.deployConfigs.adminFee)
            .mul(ev.totalGameInterest)
            .div(web3.utils.toBN("100"));
          eventAmount = web3.utils.toBN(ev.totalAmount.toString());

          return (
            web3.utils
              .toBN(ev.totalGameInterest)
              .eq(web3.utils.toBN(ev.totalAmount).sub(web3.utils.toBN(ev.totalGamePrincipal))),
            eventAmount.eq(contractsDaiBalance) && adminFee.lt(ev.totalGameInterest)
          );
        },
        `FundsRedeemedFromExternalPool error - event amount: ${eventAmount.toString()}; expectAmount: ${contractsDaiBalance.toString()}`,
      );
    });

    it("players withdraw from contract", async () => {
      // starts from 2, since player1 (loser), requested an early withdraw and player 2 withdrew after the last segment
      for (let i = 2; i < players.length - 1; i++) {
        const player = players[i];
        let mobiRewardBalanceBefore = web3.utils.toBN(0);
        let mobiRewardBalanceAfter = web3.utils.toBN(0);
        let celoRewardBalanceBefore = web3.utils.toBN(0);
        let celoRewardBalanceAfter = web3.utils.toBN(0);

        mobiRewardBalanceBefore = web3.utils.toBN(await curve.methods.balanceOf(player).call({ from: admin }));
        celoRewardBalanceBefore = web3.utils.toBN(await wmatic.methods.balanceOf(player).call({ from: admin }));

        let result;
        // redeem already called hence passing in 0
        result = await goodGhosting.withdraw(0, { from: player });

        mobiRewardBalanceAfter = web3.utils.toBN(await curve.methods.balanceOf(player).call({ from: admin }));
        celoRewardBalanceAfter = web3.utils.toBN(await wmatic.methods.balanceOf(player).call({ from: admin }));

        assert(
          mobiRewardBalanceAfter.eq(mobiRewardBalanceBefore),
          "expected curve balance after withdrawal to be greater than before withdrawal",
        );

        // for some reason forking mainnet we don't get back wmatic rewards
        assert(
          celoRewardBalanceAfter.eq(celoRewardBalanceBefore),
          "expected wmatic balance after withdrawal to be equal to before withdrawal",
        );
      }
    });

    it("admin withdraws admin fee from contract", async () => {
      if (adminFee > 0) {
        const expectedAmount = web3.utils.toBN(await goodGhosting.adminFeeAmount.call({ from: admin }));

        let mobiRewardBalanceBefore = web3.utils.toBN(0);
        let mobiRewardBalanceAfter = web3.utils.toBN(0);
        let celoRewardBalanceBefore = web3.utils.toBN(0);
        let celoRewardBalanceAfter = web3.utils.toBN(0);

        mobiRewardBalanceBefore = web3.utils.toBN(await curve.methods.balanceOf(admin).call({ from: admin }));
        celoRewardBalanceBefore = web3.utils.toBN(await wmatic.methods.balanceOf(admin).call({ from: admin }));

        const result = await goodGhosting.adminFeeWithdraw({
          from: admin,
        });

        mobiRewardBalanceAfter = web3.utils.toBN(await curve.methods.balanceOf(admin).call({ from: admin }));
        celoRewardBalanceAfter = web3.utils.toBN(await wmatic.methods.balanceOf(admin).call({ from: admin }));

        assert(
          mobiRewardBalanceAfter.gt(mobiRewardBalanceBefore),
          "expected curve balance after withdrawal to be greater than before withdrawal",
        );
        // for some reason forking mainnet we don't get back wmatic rewards
        assert(
          celoRewardBalanceAfter.gte(celoRewardBalanceBefore),
          "expected wmatic balance after withdrawal to be equal to before withdrawal",
        );

        truffleAssert.eventEmitted(
          result,
          "AdminWithdrawal",
          (ev: any) => expectedAmount.eq(ev.adminFeeAmount),
          "admin fee withdrawal event failure",
        );
      }
    });
  });
});
export {};