'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
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

const defaultBotConfig: BotConfig = {
  tradeSize: 5_000,
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
  maxHoldSeconds: 240,
  stagnantChecksLimit: 3,
  stagnationThresholdPct: 0.25,
  trailingActivationPct: 5,
  trailingDistancePct: 2,
  maxPriceImpactPct: 2,
  maxLiquiditySharePct: 1,
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
  lastBotAction: number | null
  networkConnected: boolean
  setTokens: (tokens: Token[]) => void
  upsertToken: (token: Token) => void
  updateToken: (address: string, patch: Partial<Token>) => void
  setSelectedToken: (address: string) => void
  toggleWatchlist: (address: string) => void
  upsertPosition: (position: Position) => void
  reducePosition: (token: string, amount: number) => void
  addPricePoint: (point: PricePoint) => void
  addRecentTrade: (trade: RecentTrade) => void
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
  setBotLeaderboardRank: (rank: number | null) => void
  setNetworkConnected: (connected: boolean) => void
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
      lastBotAction: null,
      networkConnected: false,

      setTokens: (tokens) => set({ tokens }),
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
        const existing = state.positions.find((item) => item.token.toLowerCase() === position.token.toLowerCase())
        if (!existing) return { positions: [position, ...state.positions] }
        const amount = existing.amount + position.amount
        const entryUSDC = existing.entryUSDC + position.entryUSDC
        return {
          positions: state.positions.map((item) => item.token.toLowerCase() === position.token.toLowerCase()
            ? { ...item, amount, entryUSDC, entryPrice: entryUSDC / amount, currentPrice: position.currentPrice }
            : item),
        }
      }),
      reducePosition: (token, amount) => set((state) => ({
        positions: state.positions.flatMap((position) => {
          if (position.token.toLowerCase() !== token.toLowerCase()) return [position]
          if (amount >= position.amount * 0.999999) return []
          const remaining = position.amount - amount
          return [{ ...position, amount: remaining, entryUSDC: remaining * position.entryPrice }]
        }),
      })),
      addPricePoint: (point) => set((state) => ({ priceHistory: [...state.priceHistory, point].slice(-100) })),
      addRecentTrade: (trade) => set((state) => ({ recentTrades: [trade, ...state.recentTrades].slice(0, 50) })),
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
      setBotLeaderboardRank: (botLeaderboardRank) => set({ botLeaderboardRank }),
      setNetworkConnected: (networkConnected) => set({ networkConnected }),
    }),
    {
      name: 'tradefarm-terminal-v2',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      migrate: (persistedState) => {
        const previous = persistedState as Partial<TradeFarmState>
        return {
          ...previous,
          botConfig: { ...defaultBotConfig, ...previous.botConfig },
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
