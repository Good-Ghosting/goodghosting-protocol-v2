const Pool = artifacts.require("Pool");
const MobiusStrategy = artifacts.require("MobiusStrategy");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const wmatic = require("../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json");
const mobiusPool = require("../../artifacts/contracts/mobius/IMobiPool.sol/IMobiPool.json");
const mobiusGauge = require("../../artifacts/contracts/mobius/IMobiGauge.sol/IMobiGauge.json");
const configs = require("../../deploy.config");
const providerConfig = require("../../providers.config");

contract("Pool with Mobius Strategy when admin enables early game completion", accounts => {
  // Only executes this test file for local network fork
  if (process.env.NETWORK !== "local-celo") {
    return;
  }

  if (configs.deployConfigs.strategy !== "mobius-cUSD-DAI" && configs.deployConfigs.strategy !== "mobius-cUSD-USD") {
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
  const { depositCount, segmentLength, segmentPayment: segmentPaymentInt, adminFee } = configs.deployConfigs;
  let token: any;
  let pool: any;
  let gaugeToken: any;
  let mobiusStrategy: any;
  let admin = accounts[0];
  const players = accounts.slice(1, 6); // 5 players
  const daiDecimals = web3.utils.toBN(1000000000000000000);
  const segmentPayment = daiDecimals.mul(web3.utils.toBN(segmentPaymentInt)); // equivalent to 10 Inbound Token
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
      let mobiBalanceBeforeRedeem,
        mobiBalanceAfterRedeem,
        celoBalanceBeforeRedeem,
        celoBalanceAfterRedeem,
        inboundTokenBalanceBeforeRedeem,
        inboundTokenBalanceAfterRedeem;
      mobiBalanceBeforeRedeem = await mobi.methods.balanceOf(goodGhosting.address).call();
      celoBalanceBeforeRedeem = await celo.methods.balanceOf(goodGhosting.address).call();
      inboundTokenBalanceBeforeRedeem = await token.methods.balanceOf(goodGhosting.address).call();

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
      await timeMachine.advanceTime(segmentLength);
      const waitingRoundLength = await goodGhosting.waitingRoundSegmentLength();
      await timeMachine.advanceTime(parseInt(waitingRoundLength.toString()));

      let result;
      result = await goodGhosting.redeemFromExternalPoolForFixedDepositPool(minAmount.toString(), {
        from: admin,
      });

      mobiBalanceAfterRedeem = await mobi.methods.balanceOf(goodGhosting.address).call();
      celoBalanceAfterRedeem = await celo.methods.balanceOf(goodGhosting.address).call();
      inboundTokenBalanceAfterRedeem = await token.methods.balanceOf(goodGhosting.address).call();

      assert(web3.utils.toBN(mobiBalanceBeforeRedeem).lt(web3.utils.toBN(mobiBalanceAfterRedeem)));
      // for some reason forking mainnet we don't get back celo rewards so the before and after balance is equal
      assert(web3.utils.toBN(celoBalanceBeforeRedeem).lte(web3.utils.toBN(celoBalanceAfterRedeem)));

      assert(web3.utils.toBN(inboundTokenBalanceBeforeRedeem).lt(web3.utils.toBN(inboundTokenBalanceAfterRedeem)));
    });

    it("players withdraw from contract", async () => {
      // starts from 2, since player1 (loser), requested an early withdraw and player 2 withdrew after the last segment
      for (let i = 0; i < players.length - 1; i++) {
        const player = players[i];
        let mobiRewardBalanceBefore = web3.utils.toBN(0);
        let mobiRewardBalanceAfter = web3.utils.toBN(0);
        let celoRewardBalanceBefore = web3.utils.toBN(0);
        let celoRewardBalanceAfter = web3.utils.toBN(0);

        let inboundTokenBalanceBeforeRedeem = await token.methods.balanceOf(player).call();
        mobiRewardBalanceBefore = web3.utils.toBN(await mobi.methods.balanceOf(player).call({ from: admin }));
        celoRewardBalanceBefore = web3.utils.toBN(await celo.methods.balanceOf(player).call({ from: admin }));
        const playerInfo = await goodGhosting.players(player);
        const netAmountPaid = playerInfo.netAmountPaid;

        // redeem already called hence passing in 0
        await goodGhosting.withdraw(0, { from: player });

        let inboundTokenBalanceAfterRedeem = await token.methods.balanceOf(player).call();
        mobiRewardBalanceAfter = web3.utils.toBN(await mobi.methods.balanceOf(player).call({ from: admin }));
        celoRewardBalanceAfter = web3.utils.toBN(await celo.methods.balanceOf(player).call({ from: admin }));
        assert(web3.utils.toBN(inboundTokenBalanceBeforeRedeem).lt(web3.utils.toBN(inboundTokenBalanceAfterRedeem)));

        const difference = web3.utils
          .toBN(inboundTokenBalanceAfterRedeem)
          .sub(web3.utils.toBN(inboundTokenBalanceBeforeRedeem));

        assert(difference.lte(netAmountPaid), "expected balance diff to be more than paid amount");

        assert(
          mobiRewardBalanceAfter.gt(mobiRewardBalanceBefore),
          "expected mobi balance after withdrawal to be greater than before withdrawal",
        );

        // for some reason forking mainnet we don't get back celo rewards
        assert(
          celoRewardBalanceAfter.lte(celoRewardBalanceBefore),
          "expected celo balance after withdrawal to be equal to before withdrawal",
        );
      }
    });

    it("admin withdraws admin fee from contract", async () => {
      if (adminFee > 0) {
        let mobiRewardBalanceBefore = web3.utils.toBN(0);
        let mobiRewardBalanceAfter = web3.utils.toBN(0);
        let celoRewardBalanceBefore = web3.utils.toBN(0);
        let celoRewardBalanceAfter = web3.utils.toBN(0);

        mobiRewardBalanceBefore = web3.utils.toBN(await mobi.methods.balanceOf(admin).call({ from: admin }));
        celoRewardBalanceBefore = web3.utils.toBN(await celo.methods.balanceOf(admin).call({ from: admin }));

        await goodGhosting.adminFeeWithdraw({
          from: admin,
        });

        mobiRewardBalanceAfter = web3.utils.toBN(await mobi.methods.balanceOf(admin).call({ from: admin }));
        celoRewardBalanceAfter = web3.utils.toBN(await celo.methods.balanceOf(admin).call({ from: admin }));

        assert(
          mobiRewardBalanceAfter.gt(mobiRewardBalanceBefore),
          "expected mobi balance after withdrawal to be greater than before withdrawal",
        );
        // for some reason forking mainnet we don't get back celo rewards
        assert(
          celoRewardBalanceAfter.gt(celoRewardBalanceBefore),
          "expected celo balance after withdrawal to be equal to before withdrawal",
        );
      }
    });
  });
});
export {};
