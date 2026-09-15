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

const SEED_TIME = Date.UTC(2026, 8, 15, 13, 30, 0)

export const seedTokens: Token[] = [
  {
    address: '0x676d8f08b31c42a9ef86d8ebc9705498319d69d2',
    symbol: 'ZAX', name: 'Zaxion', price: 0.01945, priceChange24h: 18.72,
    volume: 384_920, reserve: 48_231, supply: 2_479_743, graduated: false, discoveredAt: SEED_TIME - 86_400_000,
  },
  {
    address: '0xa14c88e1e803f33b8f8e50d27a9b4534e8120c14',
    symbol: 'ARCX', name: 'Arc X', price: 0.08412, priceChange24h: 7.34,
    volume: 247_650, reserve: 91_204, supply: 1_084_245, graduated: false, discoveredAt: SEED_TIME - 76_000_000,
  },
  {
    address: '0xb2f09d5c13a4f1e33d86b8e43fd7c7129c09ad10',
    symbol: 'PLNT', name: 'Planet Nine', price: 0.003821, priceChange24h: -4.83,
    volume: 98_430, reserve: 21_806, supply: 5_706_883, graduated: false, discoveredAt: SEED_TIME - 64_000_000,
  },
  {
    address: '0xc3962cd7f15301b3f5d072e819a469282236e52c',
    symbol: 'BYTE', name: 'Byte Farmer', price: 0.2418, priceChange24h: 32.41,
    volume: 612_810, reserve: 128_930, supply: 533_209, graduated: true, discoveredAt: SEED_TIME - 53_000_000,
  },
  {
    address: '0xd5cc26ab4b4c3959db782a520459f7f0b21ce890',
    symbol: 'MOO', name: 'Moon Cow', price: 0.009273, priceChange24h: 2.18,
    volume: 72_941, reserve: 14_802, supply: 1_596_318, graduated: false, discoveredAt: SEED_TIME - 42_000_000,
  },
  {
    address: '0xe7d8312cadc8223b5372f4d00be662d77d4f6c21',
    symbol: 'TILL', name: 'Tiller', price: 0.05213, priceChange24h: -9.06,
    volume: 143_280, reserve: 36_662, supply: 703_280, graduated: false, discoveredAt: SEED_TIME - 31_000_000,
  },
]

function makePriceHistory(price: number): PricePoint[] {
  return Array.from({ length: 72 }, (_, i) => {
    const trend = (i - 36) * 0.0019
    const wave = Math.sin(i * 0.44) * 0.026 + Math.cos(i * 0.19) * 0.014
    return {
      time: SEED_TIME - (71 - i) * 30_000,
      price: Math.max(price * (1 + trend + wave), price * 0.72),
    }
  })
}

const seedTrades: RecentTrade[] = Array.from({ length: 18 }, (_, i) => ({
  id: `seed-${i}`,
  timestamp: SEED_TIME - i * 13_000,
  type: i % 3 === 1 ? 'SELL' : 'BUY',
  symbol: 'ZAX',
  token: seedTokens[0].address,
  amount: [12_842, 5_200, 44_010, 2_750, 18_900][i % 5],
  price: seedTokens[0].price * (1 - i * 0.0014),
  wallet: [
    '0x8945ea028c127c9e003aa2d34527e4d061af52d1',
    '0x243f0bd12b17b9efc32d640110568f4c8f7154e2',
    '0x718b5e92eec872cc9f4ed58d4ea07a97da178320',
  ][i % 3] as `0x${string}`,
}))

const seedPositions: Position[] = [
  {
    token: seedTokens[0].address, symbol: 'ZAX', amount: 257_072,
    entryPrice: 0.01852, currentPrice: 0.01945, entryUSDC: 4_760.97, openedAt: SEED_TIME - 3_600_000,
  },
  {
    token: seedTokens[1].address, symbol: 'ARCX', amount: 41_250,
    entryPrice: 0.0789, currentPrice: 0.08412, entryUSDC: 3_254.63, openedAt: SEED_TIME - 8_200_000,
  },
]

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
      botLogs: [
        { id: 'welcome', timestamp: SEED_TIME, level: 'INFO', message: 'Bot console ready. Connect wallet to begin.' },
        { id: 'network', timestamp: SEED_TIME + 300, level: 'WAIT', message: 'Arc Testnet monitor initialized.' },
      ],
      priceHistory: makePriceHistory(seedTokens[0].price),
      recentTrades: seedTrades,
      tradeHistory: [],
      botConfig: {
        tradeSize: 5_000,
        takeProfitPct: 20,
        stopLossPct: 15,
        slippagePct: 1.5,
        delaySeconds: 30,
        mode: 'auto',
        manualToken: '',
      },
      botPosition: null,
      botNextActionAt: null,
      botTokensScanned: 0,
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
        set({ selectedToken: address, ...(token ? { priceHistory: makePriceHistory(token.price) } : {}) })
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
      setNetworkConnected: (networkConnected) => set({ networkConnected }),
    }),
    {
      name: 'tradefarm-terminal-v1',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({
        watchlist: state.watchlist,
        positions: state.positions,
        tradeHistory: state.tradeHistory,
        botConfig: state.botConfig,
      }),
    },
  ),
)
