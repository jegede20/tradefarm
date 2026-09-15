export type BotStatus = 'running' | 'stopped' | 'error'
export type LogLevel = 'INFO' | 'SCAN' | 'BUY' | 'SELL' | 'HOLD' | 'WAIT' | 'ERROR' | 'QUOTE' | 'WARN'
export type TxState = 'idle' | 'approving' | 'pending' | 'success' | 'failed'

export interface Token {
  address: `0x${string}`
  symbol: string
  name: string
  price: number
  priceChange24h: number
  volume: number
  reserve: number
  supply: number
  poolTokenReserve: number
  pair: `0x${string}`
  graduated: boolean
  discoveredAt: number
}

export interface Position {
  token: `0x${string}`
  symbol: string
  amount: number
  entryPrice: number
  currentPrice: number
  entryUSDC: number
  openedAt: number
}

export interface PricePoint {
  time: number
  price: number
}

export interface RecentTrade {
  id: string
  timestamp: number
  type: 'BUY' | 'SELL'
  symbol: string
  token: `0x${string}`
  amount: number
  price: number
  wallet: `0x${string}`
}

export interface TradeHistoryItem {
  id: string
  timestamp: number
  type: 'BUY' | 'SELL'
  token: `0x${string}`
  symbol: string
  amountIn: string
  amountOut: string
  price: number
  hash: `0x${string}`
}

export interface BotLog {
  id: string
  timestamp: number
  level: LogLevel
  message: string
}

export interface BotPosition {
  token: `0x${string}`
  symbol: string
  amount: number
  amountRaw: string
  entryUSDC: number
  entryPrice: number
  currentPrice: number
  entryBlock: string
  openedAt: number
  peakPnlPct: number
  stagnantChecks: number
  lastCheckPrice: number
}

export interface BotConfig {
  tradeSize: number
  takeProfitPct: number
  stopLossPct: number
  slippagePct: number
  delaySeconds: number
  mode: 'auto' | 'manual'
  manualToken: string
  objectiveMode: 'reach' | 'defend'
  targetRank: number
  sessionProfitTarget: number
  maxSessionLoss: number
  maxHoldSeconds: number
  stagnantChecksLimit: number
  stagnationThresholdPct: number
  trailingActivationPct: number
  trailingDistancePct: number
  maxPriceImpactPct: number
  maxLiquiditySharePct: number
  minLiquidityUSDC: number
  minRecentTrades: number
  minBuyPressurePct: number
  minLiquidityLockPct: number
  maxCreatorHoldingPct: number
  maxWalletFlowPct: number
  maxMomentumPct: number
  maxVolatilityPct: number
  maxConsecutiveLosses: number
  deadline: number | null
}

export interface LeaderboardRow {
  wallet: `0x${string}`
  volume: number
  trades: number
  estimatedPnl: number
}
