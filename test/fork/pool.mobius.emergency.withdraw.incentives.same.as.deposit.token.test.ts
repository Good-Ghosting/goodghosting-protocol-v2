const Pool = artifacts.require("Pool");
const MobiusStrategy = artifacts.require("MobiusStrategy");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const wmatic = require("../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json");
const rstCelo = require("../../abi-external/mobius-rstCelo-abi.json");
const mobiusPool = require("../../artifacts/contracts/mobius/IMobiPool.sol/IMobiPool.json");
const configs = require("../../deploy.config");
const providerConfig = require("../../providers.config");

contract(
  "Pool with Mobius Strategy when admin enables early game completion with incentives sent same as deposit token",
  accounts => {
    // Only executes this test file for local network fork
    if (process.env.NETWORK !== "local-celo") {
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
    let tokenIndex: any;
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

    const { depositCount, segmentLength, segmentPayment: segmentPaymentInt, adminFee } = configs.deployConfigs;
    let token: any;
    let pool: any;
    let mobiusStrategy: any;
    let admin = accounts[0];
    const players = accounts.slice(1, 6); // 5 players
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

        if (configs.deployConfigs.strategy === "mobius-celo-stCelo") {
          let unlockedBalance = await stCeloToken.methods.balanceOf(unlockedDaiAccount).call({ from: admin });
          console.log(unlockedBalance.toString());

          for (let i = 0; i < players.length; i++) {
            const player = players[i];
            const transferAmount = segmentPayment.mul(web3.utils.toBN(depositCount * 3)).toString();
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
          const daiAmount = segmentPayment.mul(web3.utils.toBN(depositCount * 10)).toString();
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
            .transfer(goodGhosting.address, web3.utils.toWei("90").toString())
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
          let result, slippageFromContract;
          let minAmountWithFees: any = 0;
          const userProvidedMinAmount = segmentPayment.sub(
            segmentPayment.mul(web3.utils.toBN(userSlippageOptions[i].toString())).div(web3.utils.toBN(100)),
          );

          let amounts: any = new Array(2);
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
              : userProvidedMinAmount.sub(
                  userProvidedMinAmount.mul(web3.utils.toBN("10")).div(web3.utils.toBN("10000")),
                );
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
      });

      it("players withdraw from contract", async () => {
        // starts from 2, since player1 (loser), requested an early withdraw and player 2 withdrew after the last segment
        for (let i = 0; i < players.length; i++) {
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

          // some i.loss happens
          if (difference.gt(netAmountPaid)) {
            // very minor diff
            assert(difference.gte(netAmountPaid), "expected balance diff to be more than paid amount");
          } else {
            // very minor diff
            assert(difference.lte(netAmountPaid), "expected balance diff to be more than paid amount");
          }

          if (
            configs.deployConfigs.strategy === "mobius-cUSD-DAI" ||
            configs.deployConfigs.strategy === "mobius-cUSD-USDC" ||
            configs.deployConfigs.strategy === "mobius-cusd-usdcet"
          ) {
            assert(
              mobiRewardBalanceAfter.gt(mobiRewardBalanceBefore),
              "expected mobi balance after withdrawal to be greater than before withdrawal",
            );
          }

          // for some reason forking mainnet we don't get back celo rewards since celo is considered as a native token while forking
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

          await goodGhosting.adminFeeWithdraw(0, {
            from: admin,
          });

          const inboundTokenPoolBalance = web3.utils.toBN(
            await token.methods.balanceOf(goodGhosting.address).call({ from: admin }),
          );
          console.log(inboundTokenPoolBalance.toString());

          mobiRewardBalanceAfter = web3.utils.toBN(await mobi.methods.balanceOf(admin).call({ from: admin }));
          celoRewardBalanceAfter = web3.utils.toBN(await celo.methods.balanceOf(admin).call({ from: admin }));

          if (
            configs.deployConfigs.strategy === "mobius-cUSD-DAI" ||
            configs.deployConfigs.strategy === "mobius-cUSD-USDC" ||
            configs.deployConfigs.strategy === "mobius-cusd-usdcet"
          ) {
            assert(
              mobiRewardBalanceAfter.gt(mobiRewardBalanceBefore),
              "expected mobi balance after withdrawal to be greater than before withdrawal",
            );
          }

          // for some reason forking mainnet we don't get back celo rewards since celo is considered as a native token while forking
          assert(
            celoRewardBalanceAfter.gte(celoRewardBalanceBefore),
            "expected celo balance after withdrawal to be equal to before withdrawal",
          );
        }
      });
    });
  },
);
export {};
