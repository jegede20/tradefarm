export const ROUTER_ADDRESS = '0x2c7c1dA8aC860077009Ec5bEA5821E372b0026D5' as const
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
export const USDC_DECIMALS = 6
export const TOKEN_DECIMALS = 18
export const SWAP_SELECTOR = '0xc3b88b53' as const
export const SELL_SELECTOR = '0xcf6bc454' as const

export const ROUTER_ABI = [
  {
    name: 'swap', type: 'function', stateMutability: 'nonpayable',
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
    name: 'getAmountOut', type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'isBuy', type: 'bool' },
    ], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalTokens', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getTokenByIndex', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'index', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'getBondingCurveState', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'reserve', type: 'uint256' },
      { name: 'supply', type: 'uint256' },
      { name: 'graduated', type: 'bool' },
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
