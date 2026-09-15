'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { formatUnits, isAddress, parseUnits, type Address } from 'viem'
import type {
  BotConfig,
  BotLog,
  BotPosition,
  BotStatus,
  Position,
  PricePoint,
  RecentTrade,
  Token,
  TradeHistoryItem,
} from '@/types/trading'

const SEED_TIME = Date.UTC(2026, 8, 15, 15, 39, 12)

// Real graduated Flipt pools. The WebSocket runtime replaces these snapshots
// with current reserves immediately after the app connects to Arc.
export const seedTokens: Token[] = [
  {
    address: '0x676de1124d715c1b7374a9a8038d1f80d70d69d2', pair: '0x2c7c1da8ac860077009ec5bea5821e372b0026d5',
    symbol: 'ZAX', name: 'ZAX', price: 0.0227727663, priceChange24h: 0,
    volume: 1000, reserve: 1_914_114.238509, poolTokenReserve: 84_052_776.6969681, supply: 1_000_000_000, graduated: true, discoveredAt: SEED_TIME - 3_000_000,
  },
  {
    address: '0x654250f45b74ba1363a63fb61f29ce194af469d2', pair: '0xbdf29167eafa7e4cfd5b73a662ed97775f5ec593',
    symbol: 'BGAQSB', name: 'Breezy Grape Aurora', price: 0.0000539773, priceChange24h: 0,
    volume: 0, reserve: 8_438.001188, poolTokenReserve: 156_325_013.80579534, supply: 1_000_000_000, graduated: true, discoveredAt: SEED_TIME - 120_000,
  },
  {
    address: '0x6e4bc520d616ea9c81a111b6cde0031dd36a69d2', pair: '0x4a3f043db14594aee438babf6fd2f6fc2c9009c9',
    symbol: 'DMOON1', name: 'dogemoon 三', price: 0.000030810044, priceChange24h: 0,
    volume: 0, reserve: 6_375, poolTokenReserve: 206_913_043.47826087, supply: 1_000_000_000, graduated: true, discoveredAt: SEED_TIME - 180_000,
  },
  {
    address: '0x56b3ee1b6b819e7d8d9c9faf1d3d8737d22a69d2', pair: '0x673f61c86cc3d2b12ebf873f44ecaca5747cea62',
    symbol: '$FLIPT', name: 'Flipt', price: 0.000030810044, priceChange24h: 0,
    volume: 0, reserve: 6_375, poolTokenReserve: 206_913_043.47826087, supply: 1_000_000_000, graduated: true, discoveredAt: SEED_TIME - 210_000,
  },
  {
    address: '0x86c03fe16b12f09fa1844979ddac7650d21f69d2', pair: '0xb3448bade37e22f45a00187814327733b2ec5e90',
    symbol: 'ARCAT', name: 'Arcat', price: 0.000030810044, priceChange24h: 0,
    volume: 0, reserve: 6_375, poolTokenReserve: 206_913_043.47826087, supply: 1_000_000_000, graduated: true, discoveredAt: SEED_TIME - 240_000,
  },
]

const seedTrades: RecentTrade[] = [
  {
    id: '0xcac590d51c7695e5def437765ccd776fe4206d7055d14914c7584e58e32863cf',
    timestamp: SEED_TIME,
    type: 'BUY', symbol: 'ZAX', token: seedTokens[0].address,
    amount: 43_495.64626926552, price: 0.0229908,
    wallet: '0x13cedf04eb99c03a49f3e9d27b89eeb6cb1eab72',
  },
  {
    id: '0x638f00845bc88382b7b65a7d21ac366428def4ca88fc3a051bdd797010061d61',
    timestamp: Date.UTC(2026, 8, 15, 13, 5, 30),
    type: 'BUY', symbol: 'ZAX', token: seedTokens[0].address,
    amount: 360_808.0583659348, price: 0.0228800,
    wallet: '0x2845c39ed62e30f19242a39fe47f9dbcc1ce2fc3',
  },
]

const seedPositions: Position[] = []

function positionRaw(position: Pick<Position, 'amount' | 'amountRaw'>) {
  if (position.amountRaw) return BigInt(position.amountRaw)
  return parseUnits(position.amount.toFixed(18), 18)
}

function ownerMatches(owner: string | undefined, wallet: string) {
  return !owner || owner.toLowerCase() === wallet.toLowerCase()
}

function validStoredAddress(value: unknown): value is Address {
  return typeof value === 'string' && isAddress(value)
}

function mergeRecentTradeRows(existing: RecentTrade[], incoming: RecentTrade[], tokens: Token[]) {
  const symbols = new Map(tokens.map((token) => [token.address.toLowerCase(), token.symbol]))
  const byId = new Map(existing.map((trade) => [trade.id, trade]))
  for (const trade of incoming) byId.set(trade.id, trade)
  const cutoff = Date.now() - 15 * 60_000
  return [...byId.values()]
    .filter((trade) => trade.timestamp >= cutoff)
    .map((trade) => ({ ...trade, symbol: symbols.get(trade.token.toLowerCase()) ?? trade.symbol }))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 5_000)
}

const defaultBotConfig: BotConfig = {
  tradeSize: 5_000,
  strategyMode: 'profit',
  takeProfitPct: 7,
  stopLossPct: 5,
  slippagePct: 1.5,
  delaySeconds: 20,
  mode: 'auto',
  manualToken: '',
  objectiveMode: 'reach',
  targetRank: 50,
  sessionProfitTarget: 5_000,
  maxSessionLoss: 2_500,
  minHoldSeconds: 180,
  maxHoldSeconds: 360,
  stagnantChecksLimit: 5,
  stagnationThresholdPct: 0.25,
  trailingActivationPct: 5,
  trailingDistancePct: 2,
  maxPriceImpactPct: 2,
  maxLiquiditySharePct: 1,
  minLiquidityUSDC: 25_000,
  minRecentTrades: 3,
  minBuyPressurePct: 55,
  maxBuyPressurePct: 88,
  minSellDepthMultiple: 1,
  minLiquidityLockPct: 90,
  maxCreatorHoldingPct: 20,
  maxWalletFlowPct: 70,
  maxMomentumPct: 8,
  maxVolatilityPct: 10,
  maxConsecutiveLosses: 3,
  deadline: null,
}

interface TradeFarmState {
  tokens: Token[]
  watchlist: string[]
  selectedToken: string
  positions: Position[]
  botStatus: BotStatus
  botLogs: BotLog[]
  priceHistory: PricePoint[]
  recentTrades: RecentTrade[]
  tradeHistory: TradeHistoryItem[]
  botConfig: BotConfig
  botPosition: BotPosition | null
  botNextActionAt: number | null
  botTokensScanned: number
  botSessionStartedAt: number | null
  botRealizedPnl: number
  botSessionVolume: number
  botCompletedTrades: number
  botConsecutiveLosses: number
  botLeaderboardRank: number | null
  botLeaderboardVolume: number
  botTargetRankVolume: number | null
  botLeaderboardGap: number | null
  botLeaderboardSampleSize: number
  lastBotAction: number | null
  networkConnected: boolean
  marketActivityReady: boolean
  marketActivityTokenCount: number
  marketActivityLastUpdated: number | null
  marketActivityError: string | null
  pendingSell: { token: Address; wallet: Address } | null
  setTokens: (tokens: Token[]) => void
  upsertToken: (token: Token) => void
  updateToken: (address: string, patch: Partial<Token>) => void
  setSelectedToken: (address: string) => void
  toggleWatchlist: (address: string) => void
  upsertPosition: (position: Position) => void
  reducePosition: (token: string, amount: number) => void
  settlePositionSell: (token: string, amountRaw: string, wallet: Address) => void
  reconcileTokenBalance: (token: string, balanceRaw: string, wallet: Address, pair?: Address) => void
  claimLegacyWalletData: (wallet: Address) => void
  setStoredPair: (token: string, pair: Address, wallet?: Address) => void
  addPricePoint: (point: PricePoint) => void
  addRecentTrade: (trade: RecentTrade) => void
  mergeRecentTrades: (trades: RecentTrade[]) => void
  addTradeHistory: (trade: TradeHistoryItem) => void
  setBotStatus: (status: BotStatus) => void
  addBotLog: (level: BotLog['level'], message: string) => void
  clearBotLogs: () => void
  setBotConfig: (patch: Partial<BotConfig>) => void
  setBotPosition: (position: BotPosition | null) => void
  setBotNextActionAt: (timestamp: number | null) => void
  setBotTokensScanned: (count: number) => void
  resetBotSession: () => void
  recordBotTrade: (profit: number, volume: number) => void
  setBotLeaderboardSnapshot: (snapshot: { rank: number | null; volume: number; targetVolume: number | null; gap: number | null; sampleSize: number }) => void
  setNetworkConnected: (connected: boolean) => void
  setMarketActivityStatus: (ready: boolean, tokenCount?: number, error?: string | null) => void
  setPendingSell: (pending: { token: Address; wallet: Address } | null) => void
}

export const useTradeFarmStore = create<TradeFarmState>()(
  persist(
    (set, get) => ({
      tokens: seedTokens,
      watchlist: seedTokens.slice(0, 5).map((token) => token.address),
      selectedToken: seedTokens[0].address,
      positions: seedPositions,
      botStatus: 'stopped',
      botLogs: [],
      priceHistory: [
        { time: Date.UTC(2026, 8, 15, 13, 5, 29), price: 0.0225544392 },
        { time: Date.UTC(2026, 8, 15, 13, 5, 30), price: 0.0227491265 },
        { time: Date.UTC(2026, 8, 15, 15, 39, 11), price: 0.0227491265 },
        { time: SEED_TIME, price: seedTokens[0].price },
      ],
      recentTrades: seedTrades,
      tradeHistory: [],
      botConfig: defaultBotConfig,
      botPosition: null,
      botNextActionAt: null,
      botTokensScanned: 0,
      botSessionStartedAt: null,
      botRealizedPnl: 0,
      botSessionVolume: 0,
      botCompletedTrades: 0,
      botConsecutiveLosses: 0,
      botLeaderboardRank: null,
      botLeaderboardVolume: 0,
      botTargetRankVolume: null,
      botLeaderboardGap: null,
      botLeaderboardSampleSize: 0,
      lastBotAction: null,
      networkConnected: false,
      marketActivityReady: false,
      marketActivityTokenCount: 0,
      marketActivityLastUpdated: null,
      marketActivityError: null,
      pendingSell: null,

      setTokens: (tokens) => set((state) => ({
        tokens,
        recentTrades: mergeRecentTradeRows(state.recentTrades, [], tokens),
      })),
      upsertToken: (token) => set((state) => {
        const exists = state.tokens.some((item) => item.address.toLowerCase() === token.address.toLowerCase())
        return { tokens: exists ? state.tokens.map((item) => item.address.toLowerCase() === token.address.toLowerCase() ? { ...item, ...token } : item) : [token, ...state.tokens] }
      }),
      updateToken: (address, patch) => set((state) => ({
        tokens: state.tokens.map((token) => token.address.toLowerCase() === address.toLowerCase() ? { ...token, ...patch } : token),
      })),
      setSelectedToken: (address) => {
        const token = get().tokens.find((item) => item.address.toLowerCase() === address.toLowerCase())
        set({ selectedToken: address, ...(token ? { priceHistory: [{ time: Date.now(), price: token.price }] } : {}) })
      },
      toggleWatchlist: (address) => set((state) => ({
        watchlist: state.watchlist.includes(address)
          ? state.watchlist.filter((item) => item !== address)
          : [...state.watchlist, address],
      })),
      upsertPosition: (position) => set((state) => {
        const existing = state.positions.find((item) => item.token.toLowerCase() === position.token.toLowerCase()
          && (!item.wallet || !position.wallet || item.wallet.toLowerCase() === position.wallet.toLowerCase()))
        if (!existing) return { positions: [position, ...state.positions] }
        const amountRaw = positionRaw(existing) + positionRaw(position)
        const amount = Number(formatUnits(amountRaw, 18))
        const entryUSDC = existing.entryUSDC + position.entryUSDC
        return {
          positions: state.positions.map((item) => item === existing
            ? {
                ...item,
                ...position,
                amount,
                amountRaw: amountRaw.toString(),
                entryUSDC,
                entryPrice: entryUSDC / amount,
                wallet: position.wallet ?? item.wallet,
                pair: position.pair ?? item.pair,
              }
            : item),
        }
      }),
      reducePosition: (token, amount) => set((state) => ({
        positions: state.positions.flatMap((position) => {
          if (position.token.toLowerCase() !== token.toLowerCase()) return [position]
          if (amount >= position.amount * 0.999999) return []
          const remaining = position.amount - amount
          return [{ ...position, amount: remaining, amountRaw: parseUnits(remaining.toFixed(18), 18).toString(), entryUSDC: remaining * position.entryPrice }]
        }),
      })),
      settlePositionSell: (token, soldRawText, wallet) => set((state) => {
        const soldRaw = BigInt(soldRawText)
        const reduce = <T extends Position | BotPosition>(position: T): T | null => {
          const trackedRaw = positionRaw(position)
          const remainingRaw = trackedRaw > soldRaw ? trackedRaw - soldRaw : 0n
          const remainingAmount = Number(formatUnits(remainingRaw, 18))
          if (remainingRaw === 0n || remainingRaw * 1_000_000n <= trackedRaw || remainingAmount * position.currentPrice < 0.01) return null
          const ratio = Number(remainingRaw * 1_000_000_000n / trackedRaw) / 1_000_000_000
          return { ...position, amount: remainingAmount, amountRaw: remainingRaw.toString(), entryUSDC: position.entryUSDC * ratio, wallet } as T
        }
        const positions = state.positions.flatMap((position) => {
          if (position.token.toLowerCase() !== token.toLowerCase() || !ownerMatches(position.wallet, wallet)) return [position]
          const reduced = reduce(position)
          return reduced ? [reduced] : []
        })
        const botMatches = state.botPosition?.token.toLowerCase() === token.toLowerCase() && ownerMatches(state.botPosition.wallet, wallet)
        return { positions, botPosition: botMatches ? reduce(state.botPosition!) : state.botPosition }
      }),
      reconcileTokenBalance: (token, balanceRawText, wallet, pair) => set((state) => {
        const balanceRaw = BigInt(balanceRawText)
        const reconcile = <T extends Position | BotPosition>(position: T): T | null => {
          const trackedRaw = positionRaw(position)
          if (balanceRaw >= trackedRaw) return { ...position, wallet, pair: pair ?? position.pair, amountRaw: trackedRaw.toString() }
          const amount = Number(formatUnits(balanceRaw, 18))
          if (balanceRaw === 0n || balanceRaw * 1_000_000n <= trackedRaw || amount * position.currentPrice < 0.01) return null
          const ratio = Number(balanceRaw * 1_000_000_000n / trackedRaw) / 1_000_000_000
          return { ...position, wallet, pair: pair ?? position.pair, amount, amountRaw: balanceRaw.toString(), entryUSDC: position.entryUSDC * ratio } as T
        }
        const positions = state.positions.flatMap((position) => {
          if (position.token.toLowerCase() !== token.toLowerCase() || !ownerMatches(position.wallet, wallet)) return [position]
          const reconciled = reconcile(position)
          return reconciled ? [reconciled] : []
        })
        const botMatches = state.botPosition?.token.toLowerCase() === token.toLowerCase() && ownerMatches(state.botPosition.wallet, wallet)
        return { positions, botPosition: botMatches ? reconcile(state.botPosition!) : state.botPosition }
      }),
      claimLegacyWalletData: (wallet) => set((state) => ({
        positions: state.positions.map((position) => position.wallet ? position : { ...position, wallet }),
        tradeHistory: state.tradeHistory.map((trade) => trade.wallet ? trade : { ...trade, wallet }),
        botPosition: state.botPosition && !state.botPosition.wallet ? { ...state.botPosition, wallet } : state.botPosition,
      })),
      setStoredPair: (token, pair, wallet) => set((state) => ({
        positions: state.positions.map((position) => position.token.toLowerCase() === token.toLowerCase() && (!wallet || ownerMatches(position.wallet, wallet))
          ? { ...position, pair, wallet: wallet ?? position.wallet }
          : position),
        botPosition: state.botPosition?.token.toLowerCase() === token.toLowerCase() && (!wallet || ownerMatches(state.botPosition.wallet, wallet))
          ? { ...state.botPosition, pair, wallet: wallet ?? state.botPosition.wallet }
          : state.botPosition,
      })),
      addPricePoint: (point) => set((state) => ({ priceHistory: [...state.priceHistory, point].slice(-100) })),
      addRecentTrade: (trade) => set((state) => ({ recentTrades: mergeRecentTradeRows(state.recentTrades, [trade], state.tokens) })),
      mergeRecentTrades: (trades) => set((state) => ({ recentTrades: mergeRecentTradeRows(state.recentTrades, trades, state.tokens) })),
      addTradeHistory: (trade) => set((state) => ({ tradeHistory: [trade, ...state.tradeHistory] })),
      setBotStatus: (botStatus) => set({ botStatus, lastBotAction: Date.now() }),
      addBotLog: (level, message) => set((state) => ({
        botLogs: [...state.botLogs, { id: `${Date.now()}-${state.botLogs.length}`, timestamp: Date.now(), level, message }].slice(-200),
        lastBotAction: Date.now(),
      })),
      clearBotLogs: () => set({ botLogs: [] }),
      setBotConfig: (patch) => set((state) => ({ botConfig: { ...state.botConfig, ...patch } })),
      setBotPosition: (botPosition) => set({ botPosition }),
      setBotNextActionAt: (botNextActionAt) => set({ botNextActionAt }),
      setBotTokensScanned: (botTokensScanned) => set({ botTokensScanned }),
      resetBotSession: () => set({
        botSessionStartedAt: Date.now(),
        botRealizedPnl: 0,
        botSessionVolume: 0,
        botCompletedTrades: 0,
        botConsecutiveLosses: 0,
        botTokensScanned: 0,
      }),
      recordBotTrade: (profit, volume) => set((state) => ({
        botRealizedPnl: state.botRealizedPnl + profit,
        botSessionVolume: state.botSessionVolume + volume,
        botCompletedTrades: state.botCompletedTrades + 1,
        botConsecutiveLosses: profit < 0 ? state.botConsecutiveLosses + 1 : 0,
      })),
      setBotLeaderboardSnapshot: ({ rank, volume, targetVolume, gap, sampleSize }) => set({
        botLeaderboardRank: rank,
        botLeaderboardVolume: volume,
        botTargetRankVolume: targetVolume,
        botLeaderboardGap: gap,
        botLeaderboardSampleSize: sampleSize,
      }),
      setNetworkConnected: (networkConnected) => set({ networkConnected }),
      setMarketActivityStatus: (marketActivityReady, marketActivityTokenCount = 0, marketActivityError = null) => set((state) => ({
        marketActivityReady,
        marketActivityTokenCount,
        marketActivityLastUpdated: marketActivityReady ? Date.now() : state.marketActivityLastUpdated,
        marketActivityError,
      })),
      setPendingSell: (pendingSell) => set({ pendingSell }),
    }),
    {
      name: 'tradefarm-terminal-v2',
      version: 7,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      migrate: (persistedState) => {
        const previous = persistedState as Partial<TradeFarmState>
        const botConfig = { ...defaultBotConfig, ...previous.botConfig }
        const positions = (Array.isArray(previous.positions) ? previous.positions : [])
          .filter((position) => position && validStoredAddress(position.token))
          .map((position) => ({
            ...position,
            wallet: validStoredAddress(position.wallet) ? position.wallet : undefined,
            pair: validStoredAddress(position.pair) ? position.pair : undefined,
          }))
        const tradeHistory = (Array.isArray(previous.tradeHistory) ? previous.tradeHistory : [])
          .filter((trade) => trade && typeof trade === 'object')
          .map((trade) => ({
            ...trade,
            token: validStoredAddress(trade.token) ? trade.token : undefined,
            wallet: validStoredAddress(trade.wallet) ? trade.wallet : undefined,
          }))
        const botPosition = previous.botPosition && validStoredAddress(previous.botPosition.token)
          ? {
              ...previous.botPosition,
              wallet: validStoredAddress(previous.botPosition.wallet) ? previous.botPosition.wallet : undefined,
              pair: validStoredAddress(previous.botPosition.pair) ? previous.botPosition.pair : undefined,
            }
          : null
        return {
          ...previous,
          watchlist: (Array.isArray(previous.watchlist) ? previous.watchlist : []).filter(validStoredAddress),
          positions,
          tradeHistory,
          botPosition,
          botConfig: {
            ...botConfig,
            maxSessionLoss: Math.max(100, botConfig.maxSessionLoss),
            minHoldSeconds: Math.min(botConfig.maxHoldSeconds, Math.max(30, botConfig.minHoldSeconds)),
            maxBuyPressurePct: Math.max(botConfig.minBuyPressurePct + 1, botConfig.maxBuyPressurePct),
            minSellDepthMultiple: Math.max(0.25, botConfig.minSellDepthMultiple),
          },
        } as TradeFarmState
      },
      partialize: (state) => ({
        watchlist: state.watchlist,
        positions: state.positions,
        tradeHistory: state.tradeHistory,
        botConfig: state.botConfig,
        botPosition: state.botPosition,
      }),
    },
  ),
)
