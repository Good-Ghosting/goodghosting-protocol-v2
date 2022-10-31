const Pool = artifacts.require("Pool");
const MobiusStrategy = artifacts.require("MobiusStrategy");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const wmatic = require("../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json");
const rstCelo = require("../../abi-external/mobius-rstCelo-abi.json");
const mobiusPool = require("../../artifacts/contracts/mobius/IMobiPool.sol/IMobiPool.json");
const mobiusGauge = require("../../artifacts/contracts/mobius/IMobiGauge.sol/IMobiGauge.json");
const configs = require("../../deploy.config");
const providerConfig = require("../../providers.config");

contract("Variable Deposit Pool with Mobius Strategy", accounts => {
  // Only executes this test file for local network fork
  if (process.env.NETWORK !== "local-variable-celo") {
    return;
  }

  if (
    configs.deployConfigs.strategy !== "mobius-cUSD-DAI" &&
    configs.deployConfigs.strategy !== "mobius-cUSD-USDC" &&
    configs.deployConfigs.strategy !== "mobius-celo-stCelo" &&
    configs.deployConfigs.strategy !== "mobius-cusd-usdcet"
  ) {
    return;
  }

  const unlockedDaiAccount = process.env.WHALE_ADDRESS_FORKED_NETWORK;
  let providersConfigs: any;
  let GoodGhostingArtifact: any;
  let mobi: any;
  let celo: any;
  let stCeloToken: any;
  GoodGhostingArtifact = Pool;

  if (configs.deployConfigs.strategy === "mobius-cUSD-DAI") {
    providersConfigs = providerConfig.providers.celo.strategies["mobius-cUSD-DAI"];
  } else if (configs.deployConfigs.strategy === "mobius-cUSD-USDC") {
    providersConfigs = providerConfig.providers.celo.strategies["mobius-cUSD-USDC"];
  } else if (configs.deployConfigs.strategy !== "mobius-celo-stCelo") {
    providersConfigs = providerConfig.providers.celo.strategies["mobius-celo-stCelo"];
  } else {
    providersConfigs = providerConfig.providers.celo.strategies["mobius-cusd-usdcet"];
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
  let mobiusStrategy: any;
  let tokenIndex: any;
  let admin = accounts[0];
  const players = accounts.slice(1, 6); // 5 players
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const loser = players[0];
  const userWithdrawingAfterLastSegment = players[1];
  const daiDecimals = web3.utils.toBN(
    10 ** providerConfig.providers["celo"].tokens[configs.deployConfigs.inboundCurrencySymbol].decimals,
  );
  const segmentPayment = daiDecimals.mul(web3.utils.toBN(segmentPaymentInt)); // equivalent to 10 Inbound Token

  let goodGhosting: any;

  describe("simulates a full game with 5 players and 4 of them winning the game and with admin fee % as 0", async () => {
    it("initializes contract instances and transfers Inbound Token to players", async () => {
      pool = new web3.eth.Contract(mobiusPool.abi, providersConfigs.pool);
      let tokenAbi;
      if (configs.deployConfigs.strategy === "mobius-celo-stCelo") {
        tokenAbi = rstCelo;
      } else {
        tokenAbi = wmatic.abi;
      }
      token = new web3.eth.Contract(
        tokenAbi,
        providerConfig.providers["celo"].tokens[configs.deployConfigs.inboundCurrencySymbol].address,
      );
      mobi = new web3.eth.Contract(wmatic.abi, providerConfig.providers["celo"].tokens["mobi"].address);
      celo = new web3.eth.Contract(wmatic.abi, providerConfig.providers["celo"].tokens["celo"].address);
      stCeloToken = new web3.eth.Contract(wmatic.abi, providerConfig.providers["celo"].tokens["stCelo"].address);

      goodGhosting = await GoodGhostingArtifact.deployed();
      mobiusStrategy = await MobiusStrategy.deployed();

      tokenIndex = await mobiusStrategy.inboundTokenIndex();
      tokenIndex = tokenIndex.toString();
      if (providersConfigs.gauge !== ZERO_ADDRESS) {
        gaugeToken = new web3.eth.Contract(mobiusGauge.abi, providersConfigs.gauge);
      }

      if (configs.deployConfigs.strategy === "mobius-celo-stCelo") {
        let unlockedBalance = await stCeloToken.methods.balanceOf(unlockedDaiAccount).call({ from: admin });
        console.log(unlockedBalance.toString());

        for (let i = 0; i < players.length; i++) {
          const player = players[i];
          const transferAmount = segmentPayment.mul(web3.utils.toBN(depositCount * 40)).toString();
          await stCeloToken.methods.transfer(player, transferAmount).send({ from: unlockedDaiAccount });
          await stCeloToken.methods
            .approve(
              providerConfig.providers["celo"].tokens[configs.deployConfigs.inboundCurrencySymbol].address,
              unlockedBalance,
            )
            .send({ from: player });
          await token.methods.deposit(transferAmount).send({ from: player });
          const playerBalance = await token.methods.balanceOf(player).call({ from: admin });
          console.log(
            `player${i + 1}DAIBalance`,
            web3.utils.toBN(playerBalance).div(web3.utils.toBN(daiDecimals)).toString(),
          );
        }
      } else {
        const unlockedBalance = await token.methods.balanceOf(unlockedDaiAccount).call({ from: admin });
        const daiAmount = segmentPayment.mul(web3.utils.toBN(depositCount * 20)).toString();
        console.log("unlockedBalance: ", web3.utils.toBN(unlockedBalance).div(web3.utils.toBN(daiDecimals)).toString());
        console.log("daiAmountToTransfer", web3.utils.toBN(daiAmount).div(web3.utils.toBN(daiDecimals)).toString());
        for (let i = 0; i < players.length; i++) {
          const player = players[i];
          let transferAmount = daiAmount;
          if (i === 2) {
            // Player 2 needs additional funds
            transferAmount = web3.utils.toBN(daiAmount).add(segmentPayment).mul(web3.utils.toBN(6)).toString();
          }
          await token.methods.transfer(player, transferAmount).send({ from: unlockedDaiAccount });
          const playerBalance = await token.methods.balanceOf(player).call({ from: admin });
          console.log(
            `player${i + 1}DAIBalance`,
            web3.utils.toBN(playerBalance).div(web3.utils.toBN(daiDecimals)).toString(),
          );
        }
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

        let amounts = new Array(2);
        if (configs.deployConfigs.strategy === "mobius-celo-stCelo") {
          amounts[0] = "0";
          amounts[tokenIndex] = segmentPayment.toString();
        } else {
          amounts[tokenIndex] = segmentPayment.toString();
          amounts[1] = "0";
        }
        slippageFromContract = await pool.methods.calculateTokenAmount(mobiusStrategy.address, amounts, true).call();

        minAmountWithFees =
          parseInt(userProvidedMinAmount.toString()) > parseInt(slippageFromContract.toString())
            ? web3.utils
                .toBN(slippageFromContract)
                .sub(web3.utils.toBN(slippageFromContract).mul(web3.utils.toBN("10")).div(web3.utils.toBN("10000")))
            : userProvidedMinAmount.sub(userProvidedMinAmount.mul(web3.utils.toBN("10")).div(web3.utils.toBN("10000")));
        if (i == 2) {
          result = await goodGhosting.joinGame(minAmountWithFees.toString(), web3.utils.toWei("23"), { from: player });
          // got logs not defined error when keep the event assertion check outside of the if-else
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

          let amounts = new Array(2);
          if (configs.deployConfigs.strategy === "mobius-celo-stCelo") {
            amounts[0] = "0";
            amounts[tokenIndex] = withdrawAmount.toString();
          } else {
            amounts[tokenIndex] = withdrawAmount.toString();
            amounts[1] = "0";
          }
          let lpTokenAmount;
          lpTokenAmount = await pool.methods.calculateTokenAmount(mobiusStrategy.address, amounts, true).call();

          if (gaugeToken) {
            const gaugeTokenBalance = await gaugeToken.methods.balanceOf(mobiusStrategy.address).call();

            if (parseInt(gaugeTokenBalance.toString()) < parseInt(lpTokenAmount.toString())) {
              lpTokenAmount = gaugeTokenBalance;
            }
          }

          let minAmount = await pool.methods
            .calculateRemoveLiquidityOneToken(mobiusStrategy.address, lpTokenAmount.toString(), tokenIndex)
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
            .approve(goodGhosting.address, web3.utils.toWei("200").toString().toString())
            .send({ from: player });

          await goodGhosting.joinGame(minAmountWithFees.toString(), web3.utils.toWei("23"), { from: player });
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
        for (let j = 1; j < players.length; j++) {
          const player = players[j];
          let slippageFromContract;
          const userProvidedMinAmount = segmentPayment.sub(
            segmentPayment.mul(web3.utils.toBN(userSlippageOptions[j].toString())).div(web3.utils.toBN(100)),
          );

          let amounts = new Array(2);
          if (configs.deployConfigs.strategy === "mobius-celo-stCelo") {
            amounts[0] = "0";
            amounts[tokenIndex] = segmentPayment.toString();
          } else {
            amounts[tokenIndex] = segmentPayment.toString();
            amounts[1] = "0";
          }
          slippageFromContract = await pool.methods.calculateTokenAmount(mobiusStrategy.address, amounts, true).call();

          const minAmountWithFees =
            parseInt(userProvidedMinAmount.toString()) > parseInt(slippageFromContract.toString())
              ? web3.utils
                  .toBN(slippageFromContract)
                  .sub(web3.utils.toBN(slippageFromContract).mul(web3.utils.toBN("10")).div(web3.utils.toBN("1000")))
              : userProvidedMinAmount.sub(
                  userProvidedMinAmount.mul(web3.utils.toBN("10")).div(web3.utils.toBN("1000")),
                );

          if (j == 2) {
            depositResult = await goodGhosting.makeDeposit(minAmountWithFees.toString(), web3.utils.toWei("23"), {
              from: player,
            });
            // got logs not defined error when keep the event assertion check outside of the if-else
            truffleAssert.eventEmitted(
              depositResult,
              "Deposit",
              (ev: any) => ev.player === player && ev.segment.toNumber() === segmentIndex,
              `player ${j} unable to deposit for segment ${segmentIndex}`,
            );
          } else {
            depositResult = await goodGhosting.makeDeposit(minAmountWithFees.toString(), web3.utils.toWei("5"), {
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

          let amounts = new Array(2);
          if (configs.deployConfigs.strategy === "mobius-celo-stCelo") {
            amounts[0] = "0";
            amounts[tokenIndex] = withdrawAmount.toString();
          } else {
            amounts[tokenIndex] = withdrawAmount.toString();
            amounts[1] = "0";
          }
          let lpTokenAmount;
          lpTokenAmount = await pool.methods.calculateTokenAmount(mobiusStrategy.address, amounts, true).call();

          if (gaugeToken) {
            const gaugeTokenBalance = await gaugeToken.methods.balanceOf(mobiusStrategy.address).call();

            if (parseInt(gaugeTokenBalance.toString()) < parseInt(lpTokenAmount.toString())) {
              lpTokenAmount = gaugeTokenBalance;
            }
          }
          let minAmount = await pool.methods
            .calculateRemoveLiquidityOneToken(mobiusStrategy.address, lpTokenAmount.toString(), tokenIndex)
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
      // above, it accounted for 1st deposit window, and then the loop runs till depositCount - 1.
      // now, we move 2 more segments (depositCount-1 and depositCount) to complete the game.
      const winnerCountBeforeEarlyWithdraw = await goodGhosting.winnerCount();
      const playerInfo = await goodGhosting.players(userWithdrawingAfterLastSegment);
      const withdrawAmount = playerInfo.amountPaid.sub(
        playerInfo.amountPaid.mul(web3.utils.toBN(earlyWithdrawFee)).div(web3.utils.toBN(100)),
      );

      let amounts = new Array(2);
      if (configs.deployConfigs.strategy === "mobius-celo-stCelo") {
        amounts[0] = "0";
        amounts[tokenIndex] = withdrawAmount.toString();
      } else {
        amounts[tokenIndex] = withdrawAmount.toString();
        amounts[1] = "0";
      }
      let lpTokenAmount;
      lpTokenAmount = await pool.methods.calculateTokenAmount(mobiusStrategy.address, amounts, true).call();

      if (gaugeToken) {
        const gaugeTokenBalance = await gaugeToken.methods.balanceOf(mobiusStrategy.address).call();

        if (parseInt(gaugeTokenBalance.toString()) < parseInt(lpTokenAmount.toString())) {
          lpTokenAmount = gaugeTokenBalance;
        }
      }
      let minAmount = await pool.methods
        .calculateRemoveLiquidityOneToken(mobiusStrategy.address, lpTokenAmount.toString(), tokenIndex)
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

      assert(winnerCountBeforeEarlyWithdraw.eq(web3.utils.toBN(4)));
      assert(winnerCountAfterEarlyWithdraw.eq(web3.utils.toBN(3)));
      await timeMachine.advanceTime(segmentLength);
      const waitingRoundLength = await goodGhosting.waitingRoundSegmentLength();
      await timeMachine.advanceTime(parseInt(waitingRoundLength.toString()));
    });

    it("admin withdraws admin fee from contract", async () => {
      if (adminFee > 0) {
        let mobiRewardBalanceBefore = web3.utils.toBN(0);
        let mobiRewardBalanceAfter = web3.utils.toBN(0);
        let celoRewardBalanceBefore = web3.utils.toBN(0);
        let celoRewardBalanceAfter = web3.utils.toBN(0);
        let inboundTokenBalanceBefore = web3.utils.toBN(0);
        let inboundTokenBalanceAfter = web3.utils.toBN(0);

        inboundTokenBalanceBefore = web3.utils.toBN(await token.methods.balanceOf(admin).call({ from: admin }));
        mobiRewardBalanceBefore = web3.utils.toBN(await mobi.methods.balanceOf(admin).call({ from: admin }));
        celoRewardBalanceBefore = web3.utils.toBN(await celo.methods.balanceOf(admin).call({ from: admin }));

        await goodGhosting.adminFeeWithdraw(0, {
          from: admin,
        });

        inboundTokenBalanceAfter = web3.utils.toBN(await token.methods.balanceOf(admin).call({ from: admin }));
        mobiRewardBalanceAfter = web3.utils.toBN(await mobi.methods.balanceOf(admin).call({ from: admin }));
        celoRewardBalanceAfter = web3.utils.toBN(await celo.methods.balanceOf(admin).call({ from: admin }));

        assert(inboundTokenBalanceAfter.gt(inboundTokenBalanceBefore));

        assert(
          mobiRewardBalanceAfter.gt(mobiRewardBalanceBefore),
          "expected mobi balance after withdrawal to be greater than before withdrawal",
        );

        // for some reason forking mainnet we don't get back celo rewards since celo is considered as a native token while forking
        assert(
          celoRewardBalanceAfter.gte(celoRewardBalanceBefore),
          "expected celo balance after withdrawal to be greater than or equal to before withdrawal",
        );
      }
    });

    it("players withdraw from contract", async () => {
      // starts from 2, since player1 (loser), requested an early withdraw and player 2 withdrew after the last segment
      for (let i = 2; i < players.length - 1; i++) {
        const player = players[i];
        let mobiRewardBalanceBefore = web3.utils.toBN(0);
        let mobiRewardBalanceAfter = web3.utils.toBN(0);
        let celoRewardBalanceBefore = web3.utils.toBN(0);
        let celoRewardBalanceAfter = web3.utils.toBN(0);
        let inboundBalanceBefore = web3.utils.toBN(0);
        let inboundBalanceAfter = web3.utils.toBN(0);

        mobiRewardBalanceBefore = web3.utils.toBN(await mobi.methods.balanceOf(player).call({ from: admin }));
        celoRewardBalanceBefore = web3.utils.toBN(await celo.methods.balanceOf(player).call({ from: admin }));
        inboundBalanceBefore = web3.utils.toBN(await token.methods.balanceOf(player).call({ from: admin }));
        const playerInfo = await goodGhosting.players(player);
        const netAmountPaid = playerInfo.netAmountPaid;

        let result;
        result = await goodGhosting.withdraw(netAmountPaid.toString(), { from: player });
        mobiRewardBalanceAfter = web3.utils.toBN(await mobi.methods.balanceOf(player).call({ from: admin }));
        celoRewardBalanceAfter = web3.utils.toBN(await celo.methods.balanceOf(player).call({ from: admin }));
        inboundBalanceAfter = web3.utils.toBN(await token.methods.balanceOf(player).call({ from: admin }));
        const difference = inboundBalanceAfter.sub(inboundBalanceBefore);

        assert(difference.gt(netAmountPaid), "expected balance diff to be more than paid amount");

        assert(
          mobiRewardBalanceAfter.gt(mobiRewardBalanceBefore),
          "expected mobi balance after withdrawal to be greater than before withdrawal",
        );

        // for some reason forking mainnet we don't get back celo rewards since celo is considered as a native token while forking
        assert(
          celoRewardBalanceAfter.lte(celoRewardBalanceBefore),
          "expected celo balance after withdrawal to be equal to or less than before withdrawal",
        );
      }
      const mobiRewardBalanceAfter = web3.utils.toBN(
        await mobi.methods.balanceOf(goodGhosting.address).call({ from: admin }),
      );
      const celoRewardBalanceAfter = web3.utils.toBN(
        await celo.methods.balanceOf(goodGhosting.address).call({ from: admin }),
      );
      assert(mobiRewardBalanceAfter.gte(web3.utils.toBN(0)));
      assert(celoRewardBalanceAfter.eq(web3.utils.toBN(0)));
    });
  });
});
export {};
