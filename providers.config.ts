/**
 * Provider configs for external protocols and networks
 *
 */
exports.providers = {
  polygon: {
    tokens: {
      dai: {
        address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
        decimals: 18,
      },
      wmatic: {
        address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
        decimals: 18,
      },
      curve: {
        address: "0x172370d5cd63279efa6d502dab29171933a610af",
        decimals: 18,
      },
    },
    strategies: {
      aaveV2: {
        lendingPoolAddressProvider: "0xd05e3E715d945B59290df0ae8eF85c1BdB684744",
        dataProvider: "0x7551b5D2763519d4e37e8B81929D336De671d46d",
        incentiveController: "0x357D51124f59836DeD84c8a1730D72B749d8BC23",
        wethGateway: "0xbEadf48d62aCC944a06EEaE0A9054A90E5A7dc97",
      },
      aaveV3: {
        lendingPoolAddressProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
        dataProvider: "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654",
        incentiveController: "0x929EC64c34a17401F460460D4B9390518E5B473e",
        wethGateway: "0x9BdB5fcc80A49640c7872ac089Cc0e00A98451B6",
      },
      "polygon-curve-aave": {
        pool: "0x445FE580eF8d70FF569aB36e80c647af338db351",
        gauge: "0x19793B454D3AfC7b454F206Ffe95aDE26cA6912c",
        poolType: 0, // Aave Pool
        tokenIndex: 0, // 0: DAI; 1: USDC; 2: USDT
      },
      "polygon-curve-atricrypto": {
        pool: "0x1d8b86e3d88cdb2d34688e87e72f388cb541b7c8",
        gauge: "0x3b6b158a76fd8ccc297538f454ce7b4787778c7c",
        poolType: 1, // Aave Pool
        tokenIndex: 0, // 0: DAI; 1: USDC; 2: USDT
      },
    },
  },
  celo: {
    tokens: {
      cusd: {
        address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
        decimals: 18,
      },
      celo: {
        address: "0x471EcE3750Da237f93B8E339c536989b8978a438",
        decimals: 18,
      },
      mobi: {
        address: "0x73a210637f6F6B7005512677Ba6B3C96bb4AA44B",
        decimals: 18,
      },
    },
    strategies: {
      moola: {
        lendingPoolAddressProvider: "0xD1088091A174d33412a968Fa34Cb67131188B332",
        dataProvider: "0x43d067ed784D9DD2ffEda73775e2CC4c560103A1",
      },
      "mobius-cUSD-DAI": {
        pool: "0xF3f65dFe0c8c8f2986da0FEc159ABE6fd4E700B4",
        gauge: "0xE1f9D952EecC07cfEFa69df9fBB0cEF260957119",
        minter: "0x5F0200CA03196D5b817E2044a0Bb0D837e0A7823",
        tokenIndex: 0,
      },
      "mobius-cUSD-USDC": {
        pool: "0x9906589Ea8fd27504974b7e8201DF5bBdE986b03",
        gauge: "0xc96AeeaFF32129da934149F6134Aa7bf291a754E",
        minter: "0x5F0200CA03196D5b817E2044a0Bb0D837e0A7823",
        tokenIndex: 0,
      },
    },
  },
};