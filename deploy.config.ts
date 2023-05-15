/**
 * Pool Deployment Config
 *
 */
const providers = require("./providers.config").providers;

const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_PLAYER_COUNT = "18446744073709551615";

exports.deployConfigs = {
  strategy: "aaveV3",
  inboundCurrencySymbol: "dai", // name of the inbound currency symbol. Must be defined in the object {providers.network} above.
  owner: ZERO_ADDRESS, //dummy address,
  depositCount: 2, // integer number of segments
  segmentLength: WEEK, // in seconds
  waitingRoundSegmentLength: WEEK, // in seconds
  flexibleSegmentPayment: false,
  isTransactionalToken: false,
  maxFlexibleSegmentPaymentAmount: 0,
  segmentPayment: 1, // amount of tokens - i.e. 10 equals to 10 TOKENS (DAI, ETH, etc.);
  earlyWithdrawFee: 1, // i.e. 10 equals to 10%
  adminFee: 5, // i.e. 5 equals to 5%
  maxPlayersCount: MAX_PLAYER_COUNT, // max quantity of players allowed.
  // merkleroot: "0xd566243e283f1357e5e97dd0c9ab0d78177583074b440cb07815e05f615178bf", // merkle root for 1st 4 player addresses in the fork tests
  isWhitelisted: false,
  incentiveToken: ZERO_ADDRESS, // for fork tests, polygon incentive token 0x430EF9263E76DAE63c84292C3409D61c598E9682, 0x1c954e8fe737f99f68fa1ccda3e51ebdb291948c(matic) & celo incentive token 0x46c9757c5497c5b1f2eb73ae79b6b67d119b0b58, st celo(0x84c4e1f2965235f60073e3029788888252c4557e)
  initialize: false,
  rewardTokens: [
    // providers.celo.tokens.symm.address,
    // providers.celo.tokens.ethix.address,
  ], // ONLY USED IF STRATEGY IS "NO_EXTERNAL_STRATEGY"
  addToRegistry: true, // true/false - when true, adds deployed contracts to registry if possible (registry address and deployer's permission also verified before adding to registry)
};
