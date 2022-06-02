const Pool = artifacts.require("Pool");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const wmatic = require("../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json");
const configs = require("../../deploy.config");
const providerConfig = require("../../providers.config");

contract("Pool with Moola Strategy", accounts => {
  // Only executes this test file for local network fork
  if (
    !["local-celo"].includes(process.env.NETWORK ? process.env.NETWORK : "") ||
    configs.deployConfigs.strategy !== "moola"
  )
    return;

  const unlockedDaiAccount = process.env.WHALE_ADDRESS_FORKED_NETWORK;
  let providersConfigs: any;
  let GoodGhostingArtifact: any;
  if (configs.deployConfigs.strategy === "moola") {
    GoodGhostingArtifact = Pool;
    providersConfigs = providerConfig.providers.celo.strategies.moola;
  }
  const { depositCount, segmentLength, segmentPayment: segmentPaymentInt, adminFee } = configs.deployConfigs;
  // const BN = web3.utils.toBN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
  let token: any;
  let admin = accounts[0];
  const players = accounts.slice(1, 6); // 5 players
  const loser = players[0];
  const userWithdrawingAfterLastSegment = players[1];
  const daiDecimals = web3.utils.toBN(1000000000000000000);
  const segmentPayment = daiDecimals.mul(web3.utils.toBN(segmentPaymentInt)); // equivalent to 10 Inbound Token
  let goodGhosting: any;

  describe("simulates a full game with 5 players and 4 of them winning the game and with admin fee % as 0", async () => {
    it("initializes contract instances and transfers Inbound Token to players", async () => {
      token = new web3.eth.Contract(
        wmatic.abi,
        providerConfig.providers["celo"].tokens[configs.deployConfigs.inboundCurrencySymbol].address,
      );

      goodGhosting = await GoodGhostingArtifact.deployed();

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
      for (let i = 0; i < players.length; i++) {
        const player = players[i];
        await token.methods
          .approve(goodGhosting.address, segmentPayment.mul(web3.utils.toBN(depositCount)).toString())
          .send({ from: player });
        let playerEvent = "";
        let paymentEvent = 0;
        let result;

        result = await goodGhosting.joinGame(0, 0, { from: player });
        // player 1 early withdraws in segment 0 and joins again
        if (i == 1) {
          await goodGhosting.earlyWithdraw(0, { from: player });

          await token.methods
            .approve(goodGhosting.address, segmentPayment.mul(web3.utils.toBN(depositCount)).toString())
            .send({ from: player });

          await goodGhosting.joinGame(0, 0, { from: player });
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
      let depositResult, earlyWithdrawResult;

      // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
      for (let segmentIndex = 1; segmentIndex < depositCount; segmentIndex++) {
        await timeMachine.advanceTime(segmentLength);
        // j must start at 1 - Player1 (index 0) early withdraws after everyone else deposits, so won't continue making deposits
        for (let j = 1; j < players.length - 1; j++) {
          const player = players[j];

          depositResult = await goodGhosting.makeDeposit(0, 0, { from: player });

          truffleAssert.eventEmitted(
            depositResult,
            "Deposit",
            (ev: any) => ev.player === player && ev.segment.toNumber() === segmentIndex,
            `player ${j} unable to deposit for segment ${segmentIndex}`,
          );
        }

        // Player 1 (index 0 - loser), performs an early withdraw on first segment.
        if (segmentIndex === 1) {
          earlyWithdrawResult = await goodGhosting.earlyWithdraw(0, { from: loser });

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

      await goodGhosting.earlyWithdraw(0, { from: userWithdrawingAfterLastSegment });

      const winnerCountAfterEarlyWithdraw = await goodGhosting.winnerCount();

      assert(winnerCountBeforeEarlyWithdraw.eq(web3.utils.toBN(3)));
      assert(winnerCountAfterEarlyWithdraw.eq(web3.utils.toBN(2)));
      await timeMachine.advanceTime(segmentLength);
      const waitingRoundLength = await goodGhosting.waitingRoundSegmentLength();
      await timeMachine.advanceTime(parseInt(waitingRoundLength.toString()));
    });

    it("redeems funds from external pool", async () => {
      let eventAmount = web3.utils.toBN(0);
      let result;
      result = await goodGhosting.redeemFromExternalPoolForFixedDepositPool(0, {
        from: admin,
      });

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

        let inboundTokenBalanceBeforeWithdraw = web3.utils.toBN(0);
        let inboundTokenBalanceAfterWithdraw = web3.utils.toBN(0);

        inboundTokenBalanceBeforeWithdraw = web3.utils.toBN(
          await token.methods.balanceOf(player).call({ from: admin }),
        );

        let result;
        // redeem already called hence passing in 0
        result = await goodGhosting.withdraw(0, { from: player });
        inboundTokenBalanceAfterWithdraw = web3.utils.toBN(await token.methods.balanceOf(player).call({ from: admin }));
        assert(inboundTokenBalanceAfterWithdraw.gt(inboundTokenBalanceBeforeWithdraw));

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
        let inboundTokenBalanceBeforeWithdraw = web3.utils.toBN(0);
        let inboundTokenBalanceAfterWithdraw = web3.utils.toBN(0);

        inboundTokenBalanceBeforeWithdraw = web3.utils.toBN(await token.methods.balanceOf(admin).call({ from: admin }));

        await goodGhosting.adminFeeWithdraw(0, {
          from: admin,
        });
        inboundTokenBalanceAfterWithdraw = web3.utils.toBN(await token.methods.balanceOf(admin).call({ from: admin }));
        assert(inboundTokenBalanceAfterWithdraw.gt(inboundTokenBalanceBeforeWithdraw));
      }
    });
  });
});
export {};
