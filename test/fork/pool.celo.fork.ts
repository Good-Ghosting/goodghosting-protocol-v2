const Pool = artifacts.require("Pool");
const MobiusStrategy = artifacts.require("MobiusStrategy");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const wmatic = require("../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json");
const mobiusPool = require("../../artifacts/contracts/mobius/IMobiPool.sol/IMobiPool.json");
const mobiusGauge = require("../../artifacts/contracts/mobius/IMobiGauge.sol/IMobiGauge.json");
const ethers = require("ethers");
const configs = require("../../deploy/deploy.config");

contract("Pool with Mobius Strategy", accounts => {
  // Only executes this test file for local network fork
  if (!["local-celo-mobius"].includes(process.env.NETWORK ? process.env.NETWORK : "")) return;

  const unlockedDaiAccount = process.env.DAI_ACCOUNT_HOLDER_FORKED_NETWORK;
  let providersConfigs: any;
  let GoodGhostingArtifact: any;
  let mobi: any;
  if (process.env.NETWORK === "local-celo-mobius") {
    GoodGhostingArtifact = Pool;
    providersConfigs = configs.providers.celo.mobius;
  }
  const {
    segmentCount,
    segmentLength,
    segmentPayment: segmentPaymentInt,
    customFee,
    earlyWithdrawFee,
    maxPlayersCount,
  } = configs.deployConfigs;
  // const BN = web3.utils.toBN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
  let token: any;
  let pool: any;
  let gaugeToken: any;
  let mobiusStrategy: any;
  let admin = accounts[0];
  const players = accounts.slice(1, 6); // 5 players
  const loser = players[0];
  const userWithdrawingAfterLastSegment = players[1];
  const daiDecimals = web3.utils.toBN(1000000000000000000);
  const segmentPayment = daiDecimals.mul(web3.utils.toBN(segmentPaymentInt)); // equivalent to 10 DAI
  let goodGhosting: any;

  describe("simulates a full game with 5 players and 4 of them winning the game and with admin fee % as 0", async () => {
    it("initializes contract instances and transfers DAI to players", async () => {
      pool = new web3.eth.Contract(mobiusPool.abi, providersConfigs.pool);
      token = new web3.eth.Contract(wmatic.abi, providersConfigs.cusd.address);
      mobi = new web3.eth.Contract(wmatic.abi, providersConfigs.mobi);

      goodGhosting = await GoodGhostingArtifact.deployed();
      mobiusStrategy = await MobiusStrategy.deployed();
      gaugeToken = new web3.eth.Contract(mobiusGauge.abi, providersConfigs.gauge);

      const unlockedBalance = await token.methods.balanceOf(unlockedDaiAccount).call({ from: admin });
      const daiAmount = segmentPayment.mul(web3.utils.toBN(segmentCount)).toString();
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

    // it("checks if the contract's variables were properly initialized", async () => {
    //     const inboundCurrencyResult = await goodGhosting.daiToken.call();
    //     const lastSegmentResult = await goodGhosting.lastSegment.call();
    //     const segmentLengthResult = await goodGhosting.segmentLength.call();
    //     const segmentPaymentResult = await goodGhosting.segmentPayment.call();
    //     const expectedSegment = web3.utils.toBN(0);
    //     const currentSegmentResult = await goodGhosting.getCurrentSegment.call();
    //     const maxPlayersCountResult = await goodGhosting.maxPlayersCount.call();
    //     assert(
    //         inboundCurrencyResult === token.options.address,
    //         `Inbound currency doesn't match. expected ${token.options.address}; got ${inboundCurrencyResult}`
    //     );
    //     if (process.env.NETWORK !== "local-polygon-vigil-fork-curve") {
    //         const lendingPoolAddressProviderResult = await goodGhosting.lendingPoolAddressProvider.call();

    //         assert(
    //             lendingPoolAddressProviderResult ===
    //             providersConfigs.lendingPoolAddressProvider,
    //             `LendingPoolAddressesProvider doesn't match. expected ${providersConfigs.dataProvider}; got ${lendingPoolAddressProviderResult}`
    //         );
    //     }

    //     assert(
    //         web3.utils.toBN(lastSegmentResult).eq(web3.utils.toBN(segmentCount)),
    //         `LastSegment info doesn't match. expected ${segmentCount}; got ${lastSegmentResult}`
    //     );
    //     assert(
    //         web3.utils.toBN(segmentLengthResult).eq(web3.utils.toBN(segmentLength)),
    //         `SegmentLength doesn't match. expected ${segmentLength}; got ${segmentLengthResult}`
    //     );
    //     assert(
    //         web3.utils.toBN(segmentPaymentResult).eq(web3.utils.toBN(segmentPayment)),
    //         `SegmentPayment doesn't match. expected ${segmentPayment}; got ${segmentPaymentResult}`
    //     );
    //     assert(
    //         currentSegmentResult.eq(web3.utils.toBN(0)),
    //         `should start at segment ${expectedSegment} but started at ${currentSegmentResult.toNumber()} instead.`
    //     );
    //     assert(
    //         web3.utils.toBN(maxPlayersCountResult).eq(web3.utils.toBN(maxPlayersCount)),
    //         `MaxPlayersCount doesn't match. expected ${maxPlayersCount.toString()}; got ${maxPlayersCountResult}`
    //     );

    // });

    it("players approve DAI to contract and join the game", async () => {
      const userSlippageOptions = [1, 3, 4, 2, 1];
      for (let i = 0; i < players.length; i++) {
        const player = players[i];
        await token.methods
          .approve(goodGhosting.address, segmentPayment.mul(web3.utils.toBN(segmentCount)).toString())
          .send({ from: player });
        let playerEvent = "";
        let paymentEvent = 0;
        let result, slippageFromContract;
        let minAmountWithFees: any = 0;
        const userProvidedMinAmount = segmentPayment.sub(
          segmentPayment.mul(web3.utils.toBN(userSlippageOptions[i].toString())).div(web3.utils.toBN(100)),
        );

        slippageFromContract = await pool.methods
          .calculateTokenAmount(mobiusStrategy.address, [segmentPayment.toString(), 0, 0], true)
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
          let lpTokenAmount;
          lpTokenAmount = await pool.methods
            .calculateTokenAmount(mobiusStrategy.address, [withdrawAmount.toString(), 0, 0], true)
            .call();

          const gaugeTokenBalance = await gaugeToken.methods.balanceOf(mobiusStrategy.address).call();

          if (parseInt(gaugeTokenBalance.toString()) < parseInt(lpTokenAmount.toString())) {
            lpTokenAmount = gaugeTokenBalance;
          }

          let minAmount = await pool.methods
            .calculateRemoveLiquidityOneToken(
              mobiusStrategy.address,
              lpTokenAmount.toString(),
              providersConfigs.tokenIndex,
            )
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
            .approve(goodGhosting.address, segmentPayment.mul(web3.utils.toBN(segmentCount)).toString())
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
      for (let segmentIndex = 1; segmentIndex < segmentCount; segmentIndex++) {
        await timeMachine.advanceTime(segmentLength);
        // j must start at 1 - Player1 (index 0) early withdraws after everyone else deposits, so won't continue making deposits
        for (let j = 1; j < players.length - 1; j++) {
          const player = players[j];
          let slippageFromContract;
          const userProvidedMinAmount = segmentPayment.sub(
            segmentPayment.mul(web3.utils.toBN(userSlippageOptions[j].toString())).div(web3.utils.toBN(100)),
          );
          slippageFromContract = await pool.methods
            .calculateTokenAmount(mobiusStrategy.address, [segmentPayment.toString(), 0, 0], true)
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
          let lpTokenAmount;
          lpTokenAmount = await pool.methods
            .calculateTokenAmount(mobiusStrategy.address, [withdrawAmount.toString(), 0, 0], true)
            .call();

          const gaugeTokenBalance = await gaugeToken.methods.balanceOf(mobiusStrategy.address).call();
          if (parseInt(gaugeTokenBalance.toString()) < parseInt(lpTokenAmount.toString())) {
            lpTokenAmount = gaugeTokenBalance;
          }
          let minAmount = await pool.methods
            .calculateRemoveLiquidityOneToken(
              mobiusStrategy.address,
              lpTokenAmount.toString(),
              providersConfigs.tokenIndex,
            )
            .call();
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
      // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
      // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
      const winnerCountBeforeEarlyWithdraw = await goodGhosting.winnerCount();
      const playerInfo = await goodGhosting.players(userWithdrawingAfterLastSegment);
      const withdrawAmount = playerInfo.amountPaid.sub(
        playerInfo.amountPaid.mul(web3.utils.toBN(earlyWithdrawFee)).div(web3.utils.toBN(100)),
      );
      let lpTokenAmount;
      lpTokenAmount = await pool.methods
        .calculateTokenAmount(mobiusStrategy.address, [withdrawAmount.toString(), 0, 0], true)
        .call();

      const gaugeTokenBalance = await gaugeToken.methods.balanceOf(mobiusStrategy.address).call();
      if (parseInt(gaugeTokenBalance.toString()) < parseInt(lpTokenAmount.toString())) {
        lpTokenAmount = gaugeTokenBalance;
      }
      let minAmount = await pool.methods
        .calculateRemoveLiquidityOneToken(mobiusStrategy.address, lpTokenAmount.toString(), providersConfigs.tokenIndex)
        .call();
      minAmount = web3.utils.toBN(minAmount).sub(web3.utils.toBN(minAmount).div(web3.utils.toBN("1000")));

      const userProvidedMinAmount = web3.utils
        .toBN(lpTokenAmount)
        .sub(web3.utils.toBN(lpTokenAmount).mul(web3.utils.toBN("15")).div(web3.utils.toBN(1000)));
      if (parseInt(userProvidedMinAmount.toString()) < parseInt(minAmount.toString())) {
        minAmount = userProvidedMinAmount;
      }

      await goodGhosting.earlyWithdraw(minAmount.toString(), { from: userWithdrawingAfterLastSegment });

      const winnerCountAfterEarlyWithdraw = await goodGhosting.winnerCount();

      assert(winnerCountBeforeEarlyWithdraw.eq(web3.utils.toBN(3)));
      assert(winnerCountAfterEarlyWithdraw.eq(web3.utils.toBN(2)));
      await timeMachine.advanceTime(segmentLength);
      const waitingRoundLength = await goodGhosting.waitingRoundSegmentLength();
      await timeMachine.advanceTime(parseInt(waitingRoundLength.toString()));
    });

    it("redeems funds from external pool", async () => {
      const userSlippage = 1;
      let minAmount;
      let mobiBalanceBeforeRedeem, mobiBalanceAfterRedeem;
      mobiBalanceBeforeRedeem = await mobi.methods.balanceOf(goodGhosting.address).call();

      const gaugeTokenBalance = await gaugeToken.methods.balanceOf(mobiusStrategy.address).call();
      minAmount = await pool.methods
        .calculateRemoveLiquidityOneToken(
          mobiusStrategy.address,
          gaugeTokenBalance.toString(),
          providersConfigs.tokenIndex,
        )
        .call();
      const userProvidedMinAmount = web3.utils
        .toBN(gaugeTokenBalance)
        .sub(web3.utils.toBN(gaugeTokenBalance).mul(web3.utils.toBN(userSlippage)).div(web3.utils.toBN(100)));

      if (parseInt(userProvidedMinAmount.toString()) < parseInt(minAmount.toString())) {
        minAmount = userProvidedMinAmount;
      }

      let eventAmount = web3.utils.toBN(0);
      let result;
      result = await goodGhosting.redeemFromExternalPool(minAmount.toString(), {
        from: admin,
      });

      mobiBalanceAfterRedeem = await mobi.methods.balanceOf(goodGhosting.address).call();
      assert(web3.utils.toBN(mobiBalanceBeforeRedeem).lte(web3.utils.toBN(mobiBalanceAfterRedeem)));

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
            .toBN(configs.deployConfigs.customFee)
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

        mobiRewardBalanceBefore = web3.utils.toBN(await mobi.methods.balanceOf(player).call({ from: admin }));

        let result;
        // redeem already called hence passing in 0
        result = await goodGhosting.withdraw(0, { from: player });

        mobiRewardBalanceAfter = web3.utils.toBN(await mobi.methods.balanceOf(player).call({ from: admin }));
        // curve rewards accrue slowly
        assert(
          mobiRewardBalanceAfter.gte(mobiRewardBalanceBefore),
          "expected curve balance after withdrawal to be greater than before withdrawal",
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
      if (customFee > 0) {
        const expectedAmount = web3.utils.toBN(await goodGhosting.adminFeeAmount.call({ from: admin }));

        let mobiRewardBalanceBefore = web3.utils.toBN(0);
        let mobiRewardBalanceAfter = web3.utils.toBN(0);

        mobiRewardBalanceBefore = web3.utils.toBN(await mobi.methods.balanceOf(admin).call({ from: admin }));

        const result = await goodGhosting.adminFeeWithdraw({
          from: admin,
        });

        mobiRewardBalanceAfter = web3.utils.toBN(await mobi.methods.balanceOf(admin).call({ from: admin }));
        assert(
          mobiRewardBalanceAfter.eq(mobiRewardBalanceBefore),
          "expected curve balance after withdrawal to be greater than before withdrawal",
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