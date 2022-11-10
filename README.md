# GoodGhosting V2 Pool

GoodGhosting is a DeFi Protocol currently live on Polygon & Celo, which is revolutionizing the savings domain by gamifying it and rewarding regular savers.

You can read more about the [V1 Version](https://github.com/Good-Ghosting/goodghosting-protocol-v1#readme) to get a better understanding of the protocol.

With the GoodGhosting V2 Pool, we aim to improve on the protocol and make it more fair, rewarding and more yield generating opportunities for regular savers in addition to the hodl feature.

## Notable Features in V2 Pool

- **Different deposit and waiting round length:** this feature allows deposit segments/rounds to have a different duration than the waiting round. This allows to have "hodl pools", where users can make a few deposits regularly, and then hodl the funds for a longer period of time (the waiting round). The hodl pool aims to reduce the player's interaction with smart contract, and for example, it can have just 1 deposit segment and 3/6 (or more) month waiting period.

- **Flexible Amount Deposit Pools:** this option is enabled/disabled at pool's contract deployment, where each individual player may choose how much they want to deposit regularly in that pool. There's a maximum deposit amount (also set during pool deployment) that limits the maximum a player can deposit, but players can choose any valid amount greater than zero and less or equal to the maximum deposit amount. Once the player chooses the amount and joins the pool, all subsequent deposits made by the player in the pool will have to be of the same amount.

- **Accounting of the interest and rewards distributed to winners considers time and amount of deposit:** To introduce fairness, unlike v1, the share of interest and rewards for winners will be decided by how much the player deposits (in case of a flexible deposit pool) and how early the players deposits in each segment.

- **Multiple Yield Strategies:** the v2 smart contract architecture uses a strategy pattern that allows to have multiple sources for yield strategies, chosen during deployment time. At the moment, v2 offers strategies for AaveV2/Moola, AaveV3, Curve (Aave and Atricrypto pools), Mobius, NoExternalPool strategies. And many more in the future.

- **Withdrawal Mechanism Update for fixed deposit pool** With the amm yield strategies in mind with v2, while withdrawing funds from the pool, the winners/players both will only withdraw the amount of funds they are entitled to, preventing sandwich attacks, large % of pool imbalance on the amm protocols like curve, mobius. This is different than the mechanism used for V1 pools where the first withdrawal would withdraw all pool funds via [redeem method in the smart contract](https://github.com/Good-Ghosting/goodghosting-protocol-v1/blob/master/contracts/GoodGhostingPolygon.sol#L163). This also means if a winners withdraws later, their funds are still earning interests in the external strategy protocols.

## Types of Pools

- **Fixed Deposit Pool with same waiting segment duration:** deposit amount is fixed and equal for each player, and the waiting round duration is equal to the duration of the deposit rounds. This type of pool follows the same principal of V1 Pools.

- **Fixed Deposit Pool with waiting round duration more than deposit rounds duration:** the deposit amount is fixed and equal for each player, but the waiting round length is greater (longer) than the regular deposit rounds. It may require less interactions from the players, in terms of sending transactions, because we may have pools with 1 deposit round of 1 week and a waiting round of 3 months.

- **Flexible Deposit Pool with same waiting segment duration:** the deposit amount is decided by each player while joining the pool. Subsequent deposits for that player will be equal to the amount chosen upon joining. Finally, the duration of the waiting round is the same as the duration of the deposit rounds.

- **Flexible Deposit Pool with waiting round duration more than deposit round duration:** the deposit amount is decided by each player while joining the pool. Subsequent deposits for that player will be equal to the amount chosen upon joining. Finally, the duration of the waiting round is greater than the duration of the deposit rounds - i.e., 1 deposit round with duration of 1 week and a waiting round with duration of 3 months.

- **Transactional Token Pool:** A variation of any of the 4 types of pools mentioned above, where the deposits are made using the network's native token (i.e., MATIC for Polygon network; celo for Celo network), instead of a ERC20 token.

- **Deposit Token same as reward Token:** A variation of any of the 4 types of pools mentioned above, where the deposits are made using the token that is also used for handing out rewards (deposit token is the same as one of the reward tokens). Example: an Aave v2 pool that rewards WMATIC, but also requires deposits in WMATIC.

## Pool Interest Accounting Math

GoodGhosting Protocol v2 introduces better fairness in terms of interest and reward generation for winners.

In V2 there are 2 phases of the game, **deposit rounds** & the **waiting round**, so there are different accounting mechanisms for both phases.

**Accounting for Deposit Rounds**

We compute the deposit amount made by each player and how early does a player pay in each segment (player share % in the pool). Below, there's a brief explanation of the math behind this feature.

In V2 Smart Contract we have a couple of mappings defined: `playerIndex[player_address][segment_number] & cumulativePlayerIndexSum[segment_number]`

As each player starts making the deposits, the mappings are updated as follows:

```
playerIndex = deposit_amount * (MULTIPLIER_CONSTANT) / (segmentLength + block.timestamp - (firstSegmentStart + (currentSegment * segmentLength)))

for (each segment paid by the player) {
  cumulativePlayerIndexSum[current_segment] += playerIndex
}
```

`playerIndex` updates for each player during each deposit.

The MULTIPLIER_CONSTANT is used to mitigate loss of precision during division operations, since solidity cannot handle decimal values. It is defined as a very large constant: `10**6`.

`cumulativePlayerIndexSum` is updated for every new deposit for each segment (reason for updating it in each segment is explained in the next section).

Once the game is completed, the distribution share (per player) of interest, rewards and incentives is calculated as:

```
uint playerIndexSum = 0;
for (each segment paid by the player) {
  playerIndexSum += playerIndex
}

playerSharePercentage = playerIndexSum * 100 / cumulativePlayerIndexSum[last_segment]
```

playerSharePercentage is the % of funds the winners get from the total game interest and total rewards generated by the game.

**Couple of examples**

_Scenario 1: A Game with 2 winners who deposited different amounts and at different times_

There are 2 players in the game with only 1 deposit required. It's a flexible deposit pool, so players can deposit different amounts. Player1 deposits 10 DAI and player2 deposits 100 DAI, but player1 deposits earlier than player2 (player1 deposit happens at time unit 5, while player2 deposit happens at time unit 20).

```
player1Index = 10 / 5 = 2
player2Index = 100 / 20 = 5
```

In this scenario, `cumulativePlayerIndexSum` will be `7` and even though player2 deposits late but the amount is 10x more than player1. At the end get, so player2 gets about 72% of the rewards and player1 gets the remaining 28% of the interest earned in the deposit round phase.

_Scenario 2: A Game with 2 players, 1 early withdrawal_

There are 2 players in the game with only 1 deposit required. It's a flexible deposit pool, where player1 deposits 10 DAI and player2 deposits 100 DAI. Player1 deposits earlier than player2 (player1 deposit happens at time unit 5, while player2 deposit happens at time unit 20). However, player2 early withdraws (before the game ends).

```
player1Index = 10 / 5 = 2
player2Index = 100 / 20 = 5
```

In this scenario, `cumulativePlayerIndexSum` will be `7`. The twist is that player2 early withdrew so `cumulativePlayerIndexSum` became `2`. This means that player 1 gets all the interest and rewards earned by the pool accrued during the deposit phase.

**Accounting for the Waiting Round**
For hodl pools, i.e where we have 1 deposit segment (1 month) and a long waiting round(3 months). We need a different accounting mechanism to calculate the interest accrued in the waiting round.

In V2 we have a new mapping `totalWinnerDepositsPerSegment[segment_no]` which keeps track of all winners' deposit amounts. We also calculate the ratio of the waiting round duration vs. the total game duration, to determine the interest % that was generated during the waiting round.

The % of the winner interest share during the waiting round phase is calculated by:
a) calculate how much the player's deposit amount represents compared to the total deposit amount of all winners:
`% of winner interest accrued during waiting round = total_deposits_made_by_player / totalWinnerDepositsPerSegment[last_segment_pool]`

b) calculate interest amount for the winner earned during the waiting round:
`total_interest * % of winner interest accrued during waiting round / 100`

**Considering an example**

```
If there are 2 players who deposit 20 & 40 DAI each in a pool which is 1 week long.

Assume the waiting round dominance in the pool is 75%.
Assume the total interest is 100 DAI, so the interest accrued during the waiting round is 75 DAI.

interest share of player 1 = 20 / 60 * 100 = 33.3 %

now for player 1 the waiting round interest share would be 33.3 / 100 * 100 = 33.3 DAI, hence for player 2, because they deposited more, the interest would be 66.6 DAI.
```

Once we have the interest/incentive/reward accrued for both deposit & waiting round for each player we just add both values to calculate the total amount of interest a player should receive, ensuring the accounting is fair for all types of pools and for all winners.

## Emergency Scenario

By transferring funds to an external protocol pool (depending on the strategy used in the pool) as part of the interest generation strategy, there's always a risk of funds being locked in the external protocol in case something happens or if the external protocol used by the ongoing pool migrates to a new contract in the middle of a game. To handle this scenario, the v2 smart contracts introduced a new function named [enableEmergencyWithdraw](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/contracts/Pool.sol#L676) which can only be called by the contract deployer, a.k.a the admin.

Once this function is called, it updates the last segment value to current segment and sets the emergency flag to `true` in the smart contract. Players who have deposited in the prev. segment, i.e `current segment - 1`, are all considered as winners and they can withdraw their funds immediately after the emergency flag is enabled.

The withdrawal mechanism for each player withdrawal remains the same in case of emergency withdrawal too - players only redeem their portion of the funds (principal, and the interest, rewards & incentives in case of winners).

**NOTE** - Handling this emergency exit scenario is the reason why `cumulativePlayerIndexSum` is a mapping.

# Smart Contract Overview

<img width="1368" alt="Screenshot 2022-03-10 at 9 34 58 AM" src="https://user-images.githubusercontent.com/26670962/157606809-2df36e2f-9c71-4bed-b291-d37377095ef2.png">

In order to make the contracts modular, the contracts are divided into two types: (i) the pool contract that holds all the core game/pool logic; and (ii) the yield strategy contracts that holds the logic to integrate with the external protocols. The pool contract, during the execution of the deployment script, is set as the owner of the strategy contract. Players (or any other external actors) cannot directly interact with the strategy contracts, only the pool contract. During the deployment of the pool + strategy, the following steps are executed:

1. deploy the strategy contract
2. deploy the pool contract
3. transfer strategy's contract ownership to the pool contract
4. initialize the pool contract. At this moment, a validation is made to make sure the pool contract is the owner of the strategy. If not, the pool contract cannot be initialized.

An in-depth explanation of each contract is provided below.

<br/>

- **[Pool](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/contracts/Pool.sol)** is the core contract with only the game logic in it. It's the main contract through which players are able to make deposits into the underlying yield strategy contract and withdraw funds.

- **[IStrategy](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/contracts/strategies/IStrategy.sol)** is the interface that all strategy contracts inherit from, so it becomes straightforward to plug and play any strategy in the pool contract.

- **[AaveStrategyV3](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/contracts/strategies/AaveStrategyV3.sol)** is responsible for depositing funds from the pool contract into aave v3 contracts, and withdraw the funds from the external protocol and send them back to the pool contract.

- **[AaveStrategy](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/contracts/strategies/AaveStrategy.sol)** is responsible for depositing funds from the pool contract into aave v2/moola, and withdraw the funds from the external protocol and send them back to the pool contract.

- **[CurveStrategy](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/contracts/strategies/CurveStrategy.sol)** is responsible for depositing funds from the pool contract into curve stable/volatile pools, and withdraw the funds from curve stable/volatile pools and send them back to the pool contract. Current pools supported are AAVE Stable Pool `0x445FE580eF8d70FF569aB36e80c647af338db351` and Atricrypto Volatile Pool `0x1d8b86e3d88cdb2d34688e87e72f388cb541b7c8`.

- **[MobiusStrategy](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/contracts/strategies/MobiusStrategy.sol)**: is responsible for depositing funds from the pool contract into any mobius liquidity pool, and withdraw the funds from mobius liquidity pool and send them back to the pool contract. Current pools that were tested with are cUSD/DAI Pool `0xF3f65dFe0c8c8f2986da0FEc159ABE6fd4E700B4` and cUSD/USDC Pool `0x9906589Ea8fd27504974b7e8201DF5bBdE986b03`

- **[NoExternalStrategy](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/contracts/strategies/NoExternalStrategy.sol)**: works like an escrow for pool funds. Funds deposited into the strategy do not get invested anywhere externally, but just sit in the contract. It does supports multiple reward tokens that can be used to reward users.

# Development

The repository uses both hardhat and truffle.
**Hardhat**

- Unit Tests
- Aave Strategy Pools Fork Tests

**Truffle**

- Curve, Mobius and Moola Fork Tests
- All deployments

## Setup

Install Truffle.

```bash
yarn add global truffle
```

Install Hardhat.

```bash
yarn add global hardhat
```

Install Ganache for having a local dev Ethereum network.

```bash
yarn add global ganache ganache-cli
```

Create a local `.env` file by copying the sample `.env.sample` file available in the root folder (`cp .env.sample .env`). After your `.env` file is created, edit it with appropriate values for the variables.

Install Project dependencies

```bash
yarn install
```

## Common Development Commands

Compile contracts

```bash
yarn compile
```

# Tests

## Unit Tests

**Requirements** :

- Make sure the `FORKING` var in .env is set `false` before running the unit test suite.
- Make sure the `MNEMONIC` var in .env is set as "here is where your twelve words mnemonic should be put my friend" (this is the real mnemonic that should be used - not a placeholder) before running the unit test suite.

To run the unit tests use:
`yarn test`

To run test coverage use:
`yarn coverage`

NOTE - If you run any test command after `yarn coverage` you will see an error similar to:

```
An unexpected error occurred:

test/fork/pool.aave.emergency.withdraw.test.ts:5:34 - error TS2307: Cannot find module '../../artifacts/contracts/aave/ILendingPoolAddressesProvider.sol/ILendingPoolAddressesProvider.json' or its corresponding type declarations.

5 import * as lendingProvider from "../../artifacts/contracts/aave/ILendingPoolAddressesProvider.sol/ILendingPoolAddressesProvider.json";
                                   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
test/fork/pool.aave.emergency.withdraw.test.ts:6:38 - error TS2307: Cannot find module '../../artifacts/contracts/aave/IncentiveController.sol/IncentiveController.json' or its corresponding type declarations.

6 import * as incentiveController from "../../artifacts/contracts/aave/IncentiveController.sol/IncentiveController.json";
                                       ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
test/fork/pool.aave.emergency.withdraw.test.ts:7:25 - error TS2307: Cannot find module '../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json' or its corresponding type declarations.

7 import * as wmatic from "../../artifacts/contracts/mock/MintableERC20.sol/MintableERC20.json";
                          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
test/fork/pool.aave.emergency.withdraw.test.ts:8:31 - error TS2307: Cannot find module '../../artifacts/contracts/mock/LendingPoolAddressesProviderMock.sol/LendingPoolAddressesProviderMock.json' or its corresponding type declarations.

8 import * as dataProvider from "../../artifacts/contracts/mock/LendingPoolAddressesProviderMock.sol/LendingPoolAddressesProviderMock.json";
```

**just ignore this error and run the command again**

## Integration Tests Using Forked Networks

### Setup

Before you start, make sure you ran:

- `yarn install`
- `yarn compile`
- `npx truffle compile --all`

Tests were ran using Node 17.8.x and 17.9.x

To run the integrated test scenarios forking from Mainnet (Polygon or Celo) you'll have to:

- Configure `WHALE_ADDRESS_FORKED_NETWORK` in your `.env` file. The file [.env.example](./.env.example) have sample whale addresses that can be used: `0x075e72a5edf65f0a5f44699c7654c1a76941ddc8` for polygon and `0x5776b4893faca32A9224F18950406c9599f3B013` for celo.

- Update the strategy type in the deployment config and the inboundCurrencySymbol value according to the type of strategy you want to deploy.

- Review the deployment configs ([deploy-config.js file](./deploy-config.js)) prior to executing the test on the forked network.

- You'll also need a rpc provider. The best option for polygon is infura and for celo you can use their public rpc `https://forno.celo.org/`

### Steps

#### Polygon

- **Aave V2/V3 Strategy Based Pool** As mentioned above, we use hardhat for these tests. After doing the setup mentioned above, the next step is to set the `FORKING` var in your .env file to `true`. Next, in your [hardhat.config.ts](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/hardhat.config.ts#L63) file, you have to set your desired rpc url - currently a public rpc is set. Then you have to run `yarn test`.

- **Curve Strategy Based Pool** As mentioned above, we use truffle for these tests. Open a new terminal window and run `npx ganache-cli -f <Your Polygon RPC> -m "clutchaptain shoe salt awake harvest setup primary inmate ugly among become" -i 999 --unlock {WHALE_ADDRESS_FORKED_NETWORK}`. Then, in the second window, run `yarn test:fork:polygon` for fixed deposit pool & `yarn test:fork:variable:polygon` for variable deposit pools.

#### Celo

Since hardhat currently does not support celo, we use truffle for celo fork tests. To start open a terminal window and run
`npx ganache-cli -f https://forno.celo.org/ -m "clutchaptain shoe salt awake harvest setup primary inmate ugly among become" -i 999 --unlock {WHALE_ADDRESS_FORKED_NETWORK}`. In a second terminal window run
`yarn test:fork:celo` for fixed deposit pool or `yarn test:fork:variable:celo` for variable deposit pool/

# Security Tools

There's a few automated security tools that could be integrated with the development process. Currently, we use [Slither](https://github.com/crytic/slither) to help identify well-known issues via static analysis. Other tools may be added in the near future as part of the continuous improvement process.

## Slither

Make sure you install Slither by following the instructions available on [Slither's](https://github.com/crytic/slither) github page. Note: it requires Python, so you may need to install it before you're able to use Slither.

Slither can be executed with the following command:

```bash
slither . --filter-path "aave|Migrations.sol|merkle|mock|openzeppelin|polygon|aaveV3|curve|mobius"
```

# Contract Deployment

- You'll need a rpc provider. The best option for polygon is infura and for celo you can use their public rpc `https://forno.celo.org/`

- Update the `strategy` value and the `inboundCurrencySymbol` value according to the type of strategy you want to deploy in the deployment config.

- The results of the deployment (output) willbe written in the [deployment-result.json](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/deployment-result.json) log file.

## Polygon

After setting the required configs mentioned above, start by setting the `MNEMONIC` var (which is the 12 word seed phrase in your wallet) and the `RPC` var in the `.env` file. Then, make sure you have the correct [deployment configs ](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/deploy.config.ts) are set. If a **whitelisted pool** needs to be deployed, make sure the merkle root is set and the [isWhitelisted var](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/deploy.config.ts#L20) is `true`. If everything is ok, then just run `yarn deploy:polygon`.

The [strategy value](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/deploy.config.ts#L6) options in deploy config are: `"aaveV2", "aaveV3", "polygon-curve-aave", "polygon-curve-atricrypto" & "no-external-strategy"`.

Here is a sample deployment log:

```
Starting migrations...
======================
> Network name:    'polygon'
> Network id:      137
> Block gas limit: 30000000 (0x1c9c380)


2_deploy_contracts.js
=====================

   Deploying 'AaveStrategyV3'
   ------------------------
   > transaction hash:    0x3d0445201814629cf0eea2e68f0c034a288708ec62e5c50ef558f3fdff30b873
   > Blocks: 2            Seconds: 9
   > contract address:    0x7f8bA69d2D7bD4490AB0aa35B92e29B845aaB7fA
   > block number:        26186433
   > block timestamp:     1647862592
   > account:             0xf88b0247e611eE5af8Cf98f5303769Cba8e7177C
   > balance:             12.653319168891911123
   > gas used:            2004678 (0x1e96c6)
   > gas price:           32 gwei
   > value sent:          0 ETH
   > total cost:          0.064149696 ETH

   Pausing for 2 confirmations...
   ------------------------------
   > confirmation number: 3 (block: 26186439)

   Replacing 'Pool'
   ----------------
   > transaction hash:    0xb16d515ed33d945d1c38be20c384d314ab0e129a602fc08eb44b4963f6bfcca1
   > Blocks: 5            Seconds: 10
   > contract address:    0x43a84D3BC0Fb6CFC93c7F9D08d8Be46a500bd9f3
   > block number:        26186454
   > block timestamp:     1647862634
   > account:             0xf88b0247e611eE5af8Cf98f5303769Cba8e7177C
   > balance:             12.504153056891911123
   > gas used:            4589224 (0x4606a8)
   > gas price:           32 gwei
   > value sent:          0 ETH
   > total cost:          0.146855168 ETH

   Pausing for 2 confirmations...
   ------------------------------
   > confirmation number: 2 (block: 26186461)


   > Saving artifacts
   -------------------------------------
   > Total cost:         0.213315808 ETH


Summary
=======
> Total deployments:   3
> Final cost:          0.213315808 ETH
```

## Celo

After setting the required configs mentioned above, start by setting the `CELO_PRIVATE_KEY` var (which is a 8-24 word seed phrase for your wallet) & the `RPC` var in the `.env` file. Then, make sure you have the correct [deployment configs](./deploy.config.ts) set. If a **whitelisted pool** needs to be deployed, make sure the `merkle root` is properly set, and the [isWhitelisted var](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/deploy.config.ts#L20) is `true`. Then, just run `yarn deploy:celo`.

The [strategy value](https://github.com/Good-Ghosting/goodghosting-protocol-v2/blob/master/deploy.config.ts#L6) options in deploy config are: "aaveV2", "moola", "mobius-cUSD-DAI", "mobius-cUSD-USDC" & "no-external-strategy".

Here is a sample deployment log:

```
Starting migrations...
======================
> Network name:    'celo'
> Network id:      42220
> Block gas limit: 0 (0x0)


2_deploy_contracts.js
=====================

Replacing 'MobiusStrategy'
--------------------------
> transaction hash:    0x258fd6b7586f385c8c9b0506a0a38b31411a88a9d5377375addb171399215093
> Blocks: 1            Seconds: 4
> contract address:    0x422Bf01090c47E0A5222A740433Eb6D7AEA4c328
> block number:        11985352
> block timestamp:     1647505428
> account:             0xf88b0247e611eE5af8Cf98f5303769Cba8e7177C
> balance:             2.110748391676738485
> gas used:            1856790 (0x1c5516)
> gas price:           0.5 gwei
> value sent:          0 ETH
> total cost:          0.000928395 ETH


Replacing 'Pool'
----------------
> transaction hash:    0x16194fe3dda5f6fe40f98a36a4bbca24656c38853e7210fb57c2551e1e26df7f
> Blocks: 0            Seconds: 0
> contract address:    0x99E91F09991966aBe0DC59555a5C1e25a78E08B7
> block number:        11985354
> block timestamp:     1647505438
> account:             0xf88b0247e611eE5af8Cf98f5303769Cba8e7177C
> balance:             2.108424171176738485
> gas used:            4576224 (0x45d3e0)
> gas price:           0.5 gwei
> value sent:          0 ETH
> total cost:          0.002288112 ETH


> Saving artifacts
-------------------------------------
> Total cost:        0.0032526155 ETH


Summary
=======
> Total deployments:   3
> Final cost:          0.0032526155 ETH
```

# Contract Verification

## Polygon

To verify contracts on polygon we use the [truffle-plugin-verify](https://github.com/rkalis/truffle-plugin-verify#usage) package. The only requirement is to have a Polygonscan API Key, which can be created on polygonscan. Once created, set the API KEY value to the key `POLYGONSCAN_API_KEY` in your `.env` file. Based on the strategy that was deployed, run any of these commands:
`yarn verify:polygon:curve` or `yarn verify:polygon:aaveV2` or `yarn verify:polygon:aaveV3` or `yarn verify:polygon:no-external-strategy`.

## Celo

Due to the ipfs provider rate limitations to verifying the smart contracts through sourcify, contracts deployed to celo have to be verified manually on celo explorer.

# Merkle Root Generation for Whitelisted Contracts

To deploy the `WhitelistedPool` contract, a merkle root is required, introduced for the purpose of whitelisting users. The merkle root can be created by using the repo below:

Clone this [repository](https://github.com/Good-Ghosting/Whitelisting)

Install Dependencies: `yarn install`

Edit this [file](https://github.com/Good-Ghosting/goodghosting-whitelisting/blob/master/scripts/input.csv) with the addresses you want to whitelist, keeping the JSON format same.

Run: `yarn generate-merkle-root`

You should see an output similar to this:

`{ "merkleRoot": "0xc65049d2040e43b130c923276515ed14d241ac88d28f0c03384d5b5f7197be82", "claims": { "0xBE73748446811eBC2a4DDdDcd55867d013D6136e": { "index": 0, "exists": "true", "proof": ["0x1f122d8c45929e68268031d8ce59ea362ab716d6b93f3b226c4cdcf459c766b3"] }, "0xb9a28ce32dcA69AD25E17212bC6D3D753E795aAe": { "index": 1, "exists": "true", "proof": ["0xdbab8c7f829217c06dc0a73baaefdbfd9e15c463a255e1b3947b27f7792462de"] } } }`

Copy the value of the `merkleRoot` field, and replace the merkle root parameter in the [deploy.config.ts](./deploy.config.ts) file. Once this step is done, the contract can be deployed using the deployment instructions provided above.
