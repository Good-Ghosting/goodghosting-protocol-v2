const Pool = artifacts.require("Pool");
const MobiusStrategy = artifacts.require("MobiusStrategy");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const wmatic = require("../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json");
const mobiusPool = require("../../artifacts/contracts/mobius/IMobiPool.sol/IMobiPool.json");
const mobiusGauge = require("../../artifacts/contracts/mobius/IMobiGauge.sol/IMobiGauge.json");
const configs = require("../../deploy.config");
const providerConfig = require("../../providers.config");

contract("Deposit Pool with Mobius Strategy with no winners", accounts => {
  // Only executes this test file for local network fork
  if (process.env.NETWORK !== "local-celo") {
    return;
  }

  if (configs.deployConfigs.strategy !== "mobius-cUSD-DAI" && configs.deployConfigs.strategy !== "mobius-cUSD-USDC") {
    return;
  }

  const unlockedDaiAccount = process.env.WHALE_ADDRESS_FORKED_NETWORK;
  let providersConfigs: any;
  let GoodGhostingArtifact: any;
  let mobi: any;
  let celo: any;
  GoodGhostingArtifact = Pool;

  if (configs.deployConfigs.strategy === "mobius-cUSD-DAI") {
    providersConfigs = providerConfig.providers.celo.strategies["mobius-cUSD-DAI"];
  } else {
    providersConfigs = providerConfig.providers.celo.strategies["mobius-cUSD-USDC"];
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
  let admin = accounts[0];
  const players = accounts.slice(1, 6); // 5 players
  const daiDecimals = web3.utils.toBN(1000000000000000000);
  const segmentPayment = daiDecimals.mul(web3.utils.toBN(segmentPaymentInt)); // equivalent to 10 Inbound Token
  const daiAmount = segmentPayment.mul(web3.utils.toBN(depositCount * 5)).toString();

  let goodGhosting: any;

  describe("simulates a full game with 5 players and 4 of them winning the game and with admin fee % as 0", async () => {
    it("initializes contract instances and transfers Inbound Token to players", async () => {
      pool = new web3.eth.Contract(mobiusPool.abi, providersConfigs.pool);
      token = new web3.eth.Contract(
        wmatic.abi,
        providerConfig.providers["celo"].tokens[configs.deployConfigs.inboundCurrencySymbol].address,
      );
      mobi = new web3.eth.Contract(wmatic.abi, providerConfig.providers["celo"].tokens["mobi"].address);
      celo = new web3.eth.Contract(wmatic.abi, providerConfig.providers["celo"].tokens["celo"].address);

      goodGhosting = await GoodGhostingArtifact.deployed();
      mobiusStrategy = await MobiusStrategy.deployed();
      gaugeToken = new web3.eth.Contract(mobiusGauge.abi, providersConfigs.gauge);

      const unlockedBalance = await token.methods.balanceOf(unlockedDaiAccount).call({ from: admin });
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

        slippageFromContract = await pool.methods
          .calculateTokenAmount(mobiusStrategy.address, [segmentPayment.toString(), 0, 0], true)
          .call();

        minAmountWithFees =
          parseInt(userProvidedMinAmount.toString()) > parseInt(slippageFromContract.toString())
            ? web3.utils
                .toBN(slippageFromContract)
                .sub(web3.utils.toBN(slippageFromContract).mul(web3.utils.toBN("10")).div(web3.utils.toBN("10000")))
            : userProvidedMinAmount.sub(userProvidedMinAmount.mul(web3.utils.toBN("10")).div(web3.utils.toBN("10000")));
        //if (i == 2) {
        result = await goodGhosting.joinGame(minAmountWithFees.toString(), 0, { from: player });
        truffleAssert.eventEmitted(
          result,
          "JoinedGame",
          (ev: any) => {
            playerEvent = ev.player;
            paymentEvent = ev.amount;
            return playerEvent === player && web3.utils.toBN(paymentEvent).toString() == segmentPayment.toString();
          },
          `JoinedGame event should be emitted when an user joins the game with params\n
                                      player: expected ${player}; got ${playerEvent}\n
                                      paymentAmount: expected ${segmentPayment.toString()}; got ${paymentEvent.toString()}`,
        );
        // player 2 early withdraws in segment 0 and joins again
        if (i == 2) {
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
            .approve(goodGhosting.address, web3.utils.toWei("200").toString().toString())
            .send({ from: player });

          await goodGhosting.joinGame(minAmountWithFees.toString(), 0, { from: player });
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
        // to avoid tx revert due to slippage passing in 0
        result = await goodGhosting.withdraw(0, { from: player });
        mobiRewardBalanceAfter = web3.utils.toBN(await mobi.methods.balanceOf(player).call({ from: admin }));
        celoRewardBalanceAfter = web3.utils.toBN(await celo.methods.balanceOf(player).call({ from: admin }));

        inboundBalanceAfter = web3.utils.toBN(await token.methods.balanceOf(player).call({ from: admin }));
        const difference = inboundBalanceAfter.sub(inboundBalanceBefore);

        assert(difference.lte(netAmountPaid), "expected balance diff to be more than paid amount");

        assert(
          mobiRewardBalanceAfter.eq(mobiRewardBalanceBefore),
          "expected mobi balance after withdrawal to be greater than before withdrawal",
        );

        // for some reason forking mainnet we don't get back celo rewards (does not happen on mainnet)
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
      assert(mobiRewardBalanceAfter.gt(web3.utils.toBN(0)));
      assert(celoRewardBalanceAfter.gte(web3.utils.toBN(0)));
    });

    it("admin withdraws admin fee from contract", async () => {
      if (adminFee > 0) {
        let mobiRewardBalanceBefore = web3.utils.toBN(0);
        let mobiRewardBalanceAfter = web3.utils.toBN(0);
        let celoRewardBalanceBefore = web3.utils.toBN(0);
        let celoRewardBalanceAfter = web3.utils.toBN(0);

        mobiRewardBalanceBefore = web3.utils.toBN(await mobi.methods.balanceOf(admin).call({ from: admin }));
        celoRewardBalanceBefore = web3.utils.toBN(await celo.methods.balanceOf(admin).call({ from: admin }));

        await goodGhosting.adminFeeWithdraw(0, {
          from: admin,
        });

        mobiRewardBalanceAfter = web3.utils.toBN(await mobi.methods.balanceOf(admin).call({ from: admin }));
        celoRewardBalanceAfter = web3.utils.toBN(await celo.methods.balanceOf(admin).call({ from: admin }));

        assert(
          mobiRewardBalanceAfter.gt(mobiRewardBalanceBefore),
          "expected mobi balance after withdrawal to be greater than before withdrawal",
        );
        // for some reason forking mainnet we don't get back celo rewards (does not happen on mainnet)
        assert(
          celoRewardBalanceAfter.gte(celoRewardBalanceBefore),
          "expected celo balance after withdrawal to be equal to or greater than before withdrawal",
        );

        const mobiPoolRewardBalanceAfter = web3.utils.toBN(
          await mobi.methods.balanceOf(goodGhosting.address).call({ from: admin }),
        );
        const celoPoolRewardBalanceAfter = web3.utils.toBN(
          await celo.methods.balanceOf(goodGhosting.address).call({ from: admin }),
        );
        assert(mobiPoolRewardBalanceAfter.gte(web3.utils.toBN(0)));
        assert(celoPoolRewardBalanceAfter.eq(web3.utils.toBN(0)));
      }
    });
  });
});
export {};
