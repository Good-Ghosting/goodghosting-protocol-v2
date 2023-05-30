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
      usdc: {
        address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        decimals: 6,
      },
      wmatic: {
        address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
        decimals: 18,
      },
      curve: {
        address: "0x172370d5cd63279efa6d502dab29171933a610af",
        decimals: 18,
      },
      ldo: {
        address: "0xc3c7d422809852031b44ab29eec9f1eff2a58756",
        decimals: 18,
      },
      weth: {
        address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
        decimals: 18,
      },
      wbtc: {
        address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
        decimals: 8,
      },
      ghst: {
        address: "0x385eeac5cb85a38a9a07a70c73e0a3271cfb54a7",
        decimals: 18,
      },
      link: {
        address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
        decimals: 18,
      },
      cmt: {
        address: "0x9Bc0abf87F9350cDE55b2CDA219871726d620Bf9",
        decimals: 18,
      },
      usdt: {
        address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        decimals: 6,
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
        // no rewards now for aave pool
        gauge: "0x0000000000000000000000000000000000000000",
        poolType: 0, // Aave Pool
        // no rewards now for aave pool
        gaugeMinter: "0x0000000000000000000000000000000000000000",
        rewardTokens: ["0x172370d5cd63279efa6d502dab29171933a610af"],
      },
      "polygon-curve-atricrypto": {
        pool: "0x1d8b86e3d88cdb2d34688e87e72f388cb541b7c8",
        gauge: "0xBb1B19495B8FE7C402427479B9aC14886cbbaaeE",
        poolType: 1, // Atricrypto Pool
        gaugeMinter: "0xabC000d88f23Bb45525E447528DBF656A9D55bf5",
        rewardTokens: ["0x172370d5cd63279efa6d502dab29171933a610af"],
      },
      "polygon-curve-stmatic-matic": {
        pool: "0xfb6fe7802ba9290ef8b00ca16af4bc26eb663a28",
        gauge: "0x9633e0749faa6ec6d992265368b88698d6a93ac0",
        poolType: 2, // Stmatic-Matic Pool
        gaugeMinter: "0x0000000000000000000000000000000000000000",
        rewardTokens: ["0xc3c7d422809852031b44ab29eec9f1eff2a58756"],
      },
      //"open": {}, // REWARD TOKENS MUST BE CONFIGURED IN `deploy.configs.js` file
    },
  },
  mumbai: {
    tokens: {
      dai: {
        address: "0x9A753f0F7886C9fbF63cF59D0D4423C5eFaCE95B",
        decimals: 18,
      },
      wmatic: {
        address: "0xb685400156cF3CBE8725958DeAA61436727A30c3",
        decimals: 18,
      },
      curve: {
        address: "0x3e4b51076d7e9B844B92F8c6377087f9cf8C8696",
        decimals: 18,
      },
    },
    strategies: {
      aaveV3: {
        lendingPoolAddressProvider: "0x5343b5bA672Ae99d627A1C87866b8E53F47Db2E6",
        dataProvider: "0x8f57153F18b7273f9A814b93b31Cb3f9b035e7C2",
        incentiveController: "0xa982Aef90A37675C0E321e3e2f3aDC959fB89351",
        wethGateway: "0x2a58E9bbb5434FdA7FF78051a4B82cb0EF669C17",
      },
    },
  },
  alfajores: {
    tokens: {
      cusd: {
        address: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
        decimals: 18,
      },
      celo: {
        address: "0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9",
        decimals: 18,
      },
      mobi: {
        address: "0x4B0BdD00F9b944fdaaAa3938647E3a9166B4532c",
        decimals: 18,
      },
    },
    strategies: {
      moola: {
        lendingPoolAddressProvider: "0xb3072f5F0d5e8B9036aEC29F37baB70E86EA0018",
        dataProvider: "0x31ccB9dC068058672D96E92BAf96B1607855822E",
      },
    },
  },
  celo: {
    tokens: {
      cusd: {
        address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
        decimals: 18,
      },
      usdc: {
        address: "0x37f750B7cC259A2f741AF45294f6a16572CF5cAd",
        decimals: 6,
      },
      usdt: {
        address: "0x617f3112bf5397D0467D315cC709EF968D9ba546",
        decimals: 6,
      },
      celo: {
        address: "0x471EcE3750Da237f93B8E339c536989b8978a438",
        decimals: 18,
      },
      stCelo: {
        address: "0xC668583dcbDc9ae6FA3CE46462758188adfdfC24",
        decimals: 18,
      },
      rstCelo: {
        address: "0xDc5762753043327d74e0a538199c1488FC1F44cf",
        decimals: 18,
      },
      creal: {
        address: "0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787",
        decimals: 18,
      },
      ceur: {
        address: "0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73",
        decimals: 18,
      },
      mobi: {
        address: "0x73a210637f6F6B7005512677Ba6B3C96bb4AA44B",
        decimals: 18,
      },
      ari: {
        address: "0x20677d4f3d0f08e735ab512393524a3cfceb250c",
        decimals: 18,
      },
      moo: {
        address: "0x17700282592D6917F6A73D0bF8AcCf4D578c131e",
        decimals: 18,
      },
      "s-celo20-ethix80-lp": {
        address: "0xaD2F9f4CD2Ae4f2dD2841EB1ea7e162fb4767D4D",
        decimals: 18,
      },
      symm: {
        address: "0x8427bD503dd3169cCC9aFF7326c15258Bc305478",
        decimals: 18,
      },
      ethix: {
        address: "0x9995cc8F20Db5896943Afc8eE0ba463259c931ed",
        decimals: 18,
      },
      curve: {
        address: "0x173fd7434B8B50dF08e3298f173487ebDB35FD14",
        decimals: 18,
      },
      gd: {
        address: "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A",
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
        lpToken: "0x0000000000000000000000000000000000000000",
        rewardTokens: ["0x73a210637f6F6B7005512677Ba6B3C96bb4AA44B"],
      },
      "mobius-cUSD-USDC": {
        pool: "0x9906589Ea8fd27504974b7e8201DF5bBdE986b03",
        gauge: "0xc96AeeaFF32129da934149F6134Aa7bf291a754E",
        minter: "0x5F0200CA03196D5b817E2044a0Bb0D837e0A7823",
        lpToken: "0x0000000000000000000000000000000000000000",
        rewardTokens: ["0x73a210637f6F6B7005512677Ba6B3C96bb4AA44B"],
      },
      "mobius-celo-stCelo": {
        pool: "0xEBf0536356256f8FF2a5Eb6C65800839801d8B95",
        gauge: "0x70AE7265545f001cb015399D672B85D8f2CaCA72",
        minter: "0x5F0200CA03196D5b817E2044a0Bb0D837e0A7823",
        lpToken: "0x4730ff6bC3008a40cf74D660D3f20d5b51646dA3",
        rewardTokens: ["0x73a210637f6F6B7005512677Ba6B3C96bb4AA44B"],
      },
      "mobius-mento": {
        pool: "0xFa3df877F98ac5ecd87456a7AcCaa948462412f0",
        gauge: "0x0000000000000000000000000000000000000000",
        minter: "0x0000000000000000000000000000000000000000",
        lpToken: "0x552b9AA0eEe500c60f09456e49FBc1096322714C",
        rewardTokens: [],
      },
      "mobius-cusd-usdcet": {
        pool: "0xc0ba93d4aaf90d39924402162ee4a213300d1d60",
        gauge: "0x7ed927E685d7196Ff2e7Bc48c5cB5e8af88c9332",
        minter: "0x5F0200CA03196D5b817E2044a0Bb0D837e0A7823",
        lpToken: "0x0000000000000000000000000000000000000000",
        rewardTokens: ["0x73a210637f6F6B7005512677Ba6B3C96bb4AA44B"],
      },
      "celo-curve-tripool": {
        pool: "0x32fd7e563c6521ab4d59ce3277bcfbe3317cfd63",
        gauge: "0x18c45c10a0f41bc3ed8d6324c687335179a40b28",
        poolType: 3,
        gaugeMinter: "0xabC000d88f23Bb45525E447528DBF656A9D55bf5",
        rewardTokens: ["0x173fd7434B8B50dF08e3298f173487ebDB35FD14"],
      },
      //"open": {}, // REWARD TOKENS MUST BE CONFIGURED IN `deploy.configs.js` file
    },
  },
};
