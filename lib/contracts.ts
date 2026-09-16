export const ROUTER_ADDRESS = '0x4B33146F2bCc75574534374C85662f9E51C38Aca' as const
export const HUB_ADDRESS = ROUTER_ADDRESS
export const FLIPT_FACTORY_ADDRESS = '0xb9200934941A9010d31733D034b9eAd7a7746d12' as const
export const ORDERS_ADDRESS = '0x41d7F9CF646b70f7a99Cf62C6C456057C47Ef0E3' as const
export const USDC_ADDRESS = '0x4F3b8005d6b3F4994a791D971bcD153E114D20c2' as const
export const ARC_NATIVE_USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const
export const USDC_DECIMALS = 6
export const TOKEN_DECIMALS = 18

// Selectors observed in successful Flipt Hub transactions on Arc Testnet.
export const POOL_BUY_SELECTOR = '0xc3b88b53' as const
export const BUY_SELECTOR = POOL_BUY_SELECTOR
export const SELL_SELECTOR = '0x6a272462' as const
export const CURVE_BUY_SELECTOR = '0xa59ac6dd' as const
export const GRADUATE_SELECTOR = '0xff6d8d05' as const
export const HUB_BUY_EVENT_TOPIC = '0x112dc08c6be44af9aebcd443037a82482908589198e8a4682ba423a81c87202f' as const
export const HUB_SELL_EVENT_TOPIC = '0x3a3fb3844a4a3578d1c660c5d0d81d6a02d050152df03f2a3e732a4b07c1a9e6' as const
export const CORE_PAUSED_ERROR_SELECTOR = '0x8ae7acea' as const
export const POOLS_PAUSED_ERROR_SELECTOR = '0x4b171ae7' as const

export const ROUTER_ABI = [
  {
    name: 'buy', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
    ], outputs: [],
  },
  {
    name: 'sell', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
    ], outputs: [],
  },
  {
    name: 'usdc', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'pausedScopes', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'poolsPaused', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'ordersPaused', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allPairsLength', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allPairs', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'index', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'getPair', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenA', type: 'address' }, { name: 'tokenB', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'launchCount', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'launches', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'index', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'launchOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'exists', type: 'bool' },
      { name: 'graduated', type: 'bool' },
      { name: 'curveUsdc', type: 'uint256' },
      { name: 'curveTokens', type: 'uint256' },
      { name: 'tokenAddress', type: 'address' },
      { name: 'pair', type: 'address' },
      { name: 'creator', type: 'address' },
      { name: 'status', type: 'uint8' },
      { name: 'creatorFees', type: 'uint256' },
    ],
  },
] as const

export const PAIR_ABI = [
  { name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'token1', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  {
    name: 'getReserves', type: 'function', stateMutability: 'view', inputs: [],
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
  },
] as const

export const ERC20_ABI = [
  {
    name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ], outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ], outputs: [{ name: '', type: 'uint256' }],
  },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    name: 'Transfer', type: 'event',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const

export const TOKEN_METADATA_ABI = [
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
] as const
