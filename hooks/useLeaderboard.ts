'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPublicClient, decodeEventLog, formatUnits, http, parseAbiItem, type Address, type Log, type PublicClient } from 'viem'
import { arcTestnet } from '@/lib/chains'
import { HUB_BUY_EVENT_TOPIC, HUB_SELL_EVENT_TOPIC, ROUTER_ADDRESS, USDC_ADDRESS } from '@/lib/contracts'
import type { LeaderboardRow } from '@/types/trading'

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const BUY_EVENT_TOPIC = HUB_BUY_EVENT_TOPIC
const SELL_EVENT_TOPIC = HUB_SELL_EVENT_TOPIC
// Arc caps dense USDC Transfer queries at 2,000 results. A 256-block
// window stays below the current cap while eight windows retain the same
// recent-chain coverage as the former 512 x 4 strategy.
const BLOCK_WINDOW = 256n
const MAX_WINDOWS = 8
const CACHE_KEY = 'tradefarm-leaderboard-v2'
const FRESH_CACHE_MS = 30_000
const USABLE_CACHE_MS = 10 * 60_000
const leaderboardClient = createPublicClient({
  chain: arcTestnet,
  transport: http('https://rpc.testnet.arc.io', {
    retryCount: 1,
    retryDelay: 400,
    timeout: 15_000,
  }),
})

interface TradeEvent {
  transactionHash: `0x${string}`
  wallet: Address
  side: 'buy' | 'sell'
  blockNumber: bigint
  logIndex: number
}

interface LeaderboardSnapshot {
  rows: LeaderboardRow[]
  sampleSize: number
  lastUpdated: number
}

let memoryCache: LeaderboardSnapshot | null = null
let activeRequest: Promise<LeaderboardSnapshot> | null = null

function isTransientRpcFailure(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause)
  return /http request failed|failed to fetch|fetch failed|network error|timeout|timed out|socket|429|rate.?limit|limit exceeded|econn|temporarily unavailable/i.test(message)
}

async function withRpcRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await operation()
    } catch (cause) {
      lastError = cause
      if (!isTransientRpcFailure(cause) || attempt === 3) throw cause
      await new Promise((resolve) => window.setTimeout(resolve, 400 * 2 ** attempt))
    }
  }
  throw lastError
}

async function fetchLeaderboard(publicClient: PublicClient): Promise<LeaderboardSnapshot> {
  const latest = await withRpcRetry(() => publicClient.getBlockNumber())
  const trades: TradeEvent[] = []
  const usdcLogs: Log[] = []
  const seenTrades = new Set<string>()
  let toBlock = latest
  let windows = 0

  while (trades.length < 500 && windows < MAX_WINDOWS) {
    const fromBlock = toBlock >= BLOCK_WINDOW - 1n ? toBlock - (BLOCK_WINDOW - 1n) : 0n
    // Both bounded requests cover the same blocks and can safely run together.
    const [hubLogs, windowUsdcLogs] = await Promise.all([
      withRpcRetry(() => publicClient.getLogs({ address: ROUTER_ADDRESS, fromBlock, toBlock })),
      withRpcRetry(() => publicClient.getLogs({ address: USDC_ADDRESS, event: transferEvent, fromBlock, toBlock })),
    ])
    usdcLogs.push(...windowUsdcLogs)

    for (const log of hubLogs) {
      const topic = log.topics[0]?.toLowerCase()
      if (topic !== BUY_EVENT_TOPIC && topic !== SELL_EVENT_TOPIC) continue
      if (!log.transactionHash || !log.topics[2]) continue
      const key = `${log.transactionHash}-${topic}`
      if (seenTrades.has(key)) continue
      seenTrades.add(key)
      trades.push({
        transactionHash: log.transactionHash,
        wallet: `0x${log.topics[2].slice(-40)}` as Address,
        side: topic === BUY_EVENT_TOPIC ? 'buy' : 'sell',
        blockNumber: log.blockNumber ?? 0n,
        logIndex: log.logIndex ?? 0,
      })
    }
    windows += 1
    if (fromBlock === 0n) break
    toBlock = fromBlock - 1n
  }

  const transfersByTransaction = new Map<string, Array<{ from: Address; to: Address; value: bigint }>>()
  for (const log of usdcLogs) {
    if (!log.transactionHash) continue
    const decoded = decodeEventLog({ abi: [transferEvent], data: log.data, topics: log.topics })
    const list = transfersByTransaction.get(log.transactionHash) ?? []
    list.push({ from: decoded.args.from, to: decoded.args.to, value: decoded.args.value })
    transfersByTransaction.set(log.transactionHash, list)
  }

  const recentTrades = trades
    .sort((left, right) => Number(left.blockNumber - right.blockNumber) || left.logIndex - right.logIndex)
    .slice(-500)
  const walletStats = new Map<string, { wallet: Address; volume: number; trades: number; buys: number; sells: number }>()
  const router = ROUTER_ADDRESS.toLowerCase()
  let matchedTransfers = 0

  for (const trade of recentTrades) {
    const wallet = trade.wallet.toLowerCase()
    const transfers = transfersByTransaction.get(trade.transactionHash) ?? []
    const routedRaw = transfers.reduce((total, transfer) => {
      const isMatchingBuy = trade.side === 'buy' && transfer.from.toLowerCase() === wallet && transfer.to.toLowerCase() === router
      const isMatchingSell = trade.side === 'sell' && transfer.to.toLowerCase() === wallet
      return total + (isMatchingBuy || isMatchingSell ? transfer.value : 0n)
    }, 0n)
    if (routedRaw <= 0n) continue
    matchedTransfers += 1
    const value = Number(formatUnits(routedRaw, 6))
    const current = walletStats.get(wallet) ?? { wallet: trade.wallet, volume: 0, trades: 0, buys: 0, sells: 0 }
    current.volume += value
    current.trades += 1
    current[trade.side === 'buy' ? 'buys' : 'sells'] += value
    walletStats.set(wallet, current)
  }

  return {
    rows: [...walletStats.values()]
      .map((item) => ({ wallet: item.wallet, volume: item.volume, trades: item.trades, estimatedPnl: item.sells - item.buys }))
      .sort((a, b) => b.volume - a.volume),
    sampleSize: matchedTransfers,
    lastUpdated: Date.now(),
  }
}

function readCachedSnapshot() {
  if (memoryCache && Date.now() - memoryCache.lastUpdated <= USABLE_CACHE_MS) return memoryCache
  memoryCache = null
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? 'null') as LeaderboardSnapshot | null
    if (parsed && Array.isArray(parsed.rows) && Date.now() - parsed.lastUpdated <= USABLE_CACHE_MS) {
      memoryCache = parsed
      return parsed
    }
  } catch {
    // Ignore damaged browser cache and fetch a verified replacement.
  }
  return null
}

function requestSharedSnapshot(publicClient: PublicClient) {
  if (!activeRequest) {
    activeRequest = fetchLeaderboard(publicClient).then((snapshot) => {
      memoryCache = snapshot
      try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot)) } catch { /* storage may be unavailable */ }
      return snapshot
    }).finally(() => { activeRequest = null })
  }
  return activeRequest
}

export function useLeaderboard(enabled = true) {
  const publicClient = leaderboardClient
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [sampleSize, setSampleSize] = useState(0)
  const [source, setSource] = useState<'live' | 'cached' | 'unavailable'>('unavailable')
  const [error, setError] = useState<string | null>(null)

  const applySnapshot = useCallback((snapshot: LeaderboardSnapshot, nextSource: 'live' | 'cached') => {
    setRows(snapshot.rows)
    setSampleSize(snapshot.sampleSize)
    setLastUpdated(snapshot.lastUpdated)
    setSource(nextSource)
  }, [])

  const refresh = useCallback(async () => {
    if (!publicClient) return
    setIsLoading(true)
    setError(null)
    try {
      const snapshot = await requestSharedSnapshot(publicClient)
      applySnapshot(snapshot, 'live')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.split('\n')[0] : 'Arc RPC request failed.'
      setError(message || 'Arc RPC request failed.')
      const cached = readCachedSnapshot()
      if (cached) applySnapshot(cached, 'cached')
      else {
        setSource('unavailable')
        setLastUpdated(Date.now())
      }
    } finally {
      setIsLoading(false)
    }
  }, [applySnapshot, publicClient])

  useEffect(() => {
    if (!enabled || !publicClient) return
    const cached = readCachedSnapshot()
    if (cached) applySnapshot(cached, 'cached')
    if (!cached || Date.now() - cached.lastUpdated > FRESH_CACHE_MS) void refresh()
  }, [applySnapshot, enabled, publicClient, refresh])

  return { rows, isLoading, lastUpdated, sampleSize, refresh, source, error }
}
