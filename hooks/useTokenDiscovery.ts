'use client'

import { useEffect, useRef } from 'react'
import {
  createPublicClient,
  formatUnits,
  http,
  isAddress,
  webSocket,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from 'viem'
import { arcTestnet } from '@/lib/chains'
import { HUB_BUY_EVENT_TOPIC, HUB_SELL_EVENT_TOPIC, ROUTER_ADDRESS } from '@/lib/contracts'
import { loadMarketSnapshots } from '@/lib/flipt'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import type { RecentTrade, Token } from '@/types/trading'

const ACTIVITY_WINDOW_BLOCKS = 256n
const FULL_ACTIVITY_WINDOWS = 6
const INCREMENTAL_ACTIVITY_WINDOWS = 2
const ACTIVE_MARKET_LIMIT = 64
const BLOCK_TIME_MS = 505

function isTransientRpcFailure(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause)
  return /http request failed|failed to fetch|fetch failed|network error|timeout|timed out|socket|429|rate.?limit|limit exceeded|econn|temporarily unavailable/i.test(message)
}

function activityFailureMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/429|rate.?limit|limit exceeded|-32005/i.test(message)) return 'Arc RPC rate limit reached; retrying bounded backfill…'
  if (/timeout|timed out/i.test(message)) return 'Arc RPC backfill timed out; retrying over HTTP…'
  if (/failed to fetch|fetch failed|network error|socket|websocket|econn/i.test(message)) return 'Arc RPC connection interrupted; retrying over HTTP…'
  return 'Recent Hub activity could not be indexed; retrying…'
}

async function withRpcRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await operation()
    } catch (cause) {
      lastError = cause
      if (!isTransientRpcFailure(cause) || attempt === 3) throw cause
      await new Promise((resolve) => window.setTimeout(resolve, 350 * 2 ** attempt))
    }
  }
  throw lastError
}

function dataWord(data: Hex, index: number) {
  const start = 2 + index * 64
  const word = data.slice(start, start + 64)
  return word.length === 64 ? BigInt(`0x${word}`) : 0n
}

function topicAddress(topic?: Hex) {
  if (!topic) return null
  const candidate = `0x${topic.slice(-40)}`
  return isAddress(candidate) ? candidate as Address : null
}

function parseHubTrades(
  logs: Log[],
  latestBlock: bigint,
  latestTimestampMs: number,
  blockTimeMs = BLOCK_TIME_MS,
  knownMarkets: Token[] = [],
) {
  const symbols = new Map(knownMarkets.map((market) => [market.address.toLowerCase(), market.symbol]))
  return logs.flatMap((log): RecentTrade[] => {
    const topic = log.topics[0]?.toLowerCase()
    if (topic !== HUB_BUY_EVENT_TOPIC && topic !== HUB_SELL_EVENT_TOPIC) return []
    if (!log.transactionHash) return []
    const token = topicAddress(log.topics[1])
    const wallet = topicAddress(log.topics[2])
    if (!token || !wallet) return []

    // Verified Hub trade events encode amountIn in word 0. Buy word 2 is
    // actual token output; sell word 1 is actual USDC output.
    const isBuy = topic === HUB_BUY_EVENT_TOPIC
    const tokenRaw = isBuy ? dataWord(log.data, 2) : dataWord(log.data, 0)
    const usdcRaw = isBuy ? dataWord(log.data, 0) : dataWord(log.data, 1)
    if (tokenRaw <= 0n || usdcRaw <= 0n) return []
    const amount = Number(formatUnits(tokenRaw, 18))
    const usdc = Number(formatUnits(usdcRaw, 6))
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(usdc) || usdc <= 0) return []
    const ageBlocks = log.blockNumber && latestBlock >= log.blockNumber ? Number(latestBlock - log.blockNumber) : 0

    return [{
      id: `${log.transactionHash}-${log.logIndex ?? 0}`,
      timestamp: Math.max(0, Math.round(latestTimestampMs - ageBlocks * blockTimeMs)),
      type: isBuy ? 'BUY' : 'SELL',
      symbol: symbols.get(token.toLowerCase()) ?? `TKN${token.slice(-3).toUpperCase()}`,
      token,
      amount,
      price: usdc / amount,
      wallet,
    }]
  })
}

function rankActiveTokens(trades: RecentTrade[]) {
  const cutoff = Date.now() - 10 * 60_000
  const activity = new Map<string, {
    token: Address
    buys: number
    sells: number
    buyVolume: number
    sellVolume: number
    wallets: Set<string>
  }>()

  for (const trade of trades) {
    if (trade.timestamp < cutoff) continue
    const key = trade.token.toLowerCase()
    const current = activity.get(key) ?? { token: trade.token, buys: 0, sells: 0, buyVolume: 0, sellVolume: 0, wallets: new Set<string>() }
    const value = trade.amount * trade.price
    if (trade.type === 'BUY') {
      current.buys += 1
      current.buyVolume += value
    } else {
      current.sells += 1
      current.sellVolume += value
    }
    current.wallets.add(trade.wallet.toLowerCase())
    activity.set(key, current)
  }

  return [...activity.values()]
    .filter((item) => item.buys > 0 && item.sells > 0 && item.buys + item.sells >= 3 && item.wallets.size >= 2)
    .sort((left, right) => {
      const leftBalancedFlow = Math.min(left.buyVolume, left.sellVolume)
      const rightBalancedFlow = Math.min(right.buyVolume, right.sellVolume)
      return right.buys + right.sells - (left.buys + left.sells)
        || right.wallets.size - left.wallets.size
        || rightBalancedFlow - leftBalancedFlow
    })
    .slice(0, ACTIVE_MARKET_LIMIT)
    .map((item) => item.token)
}

async function fetchRecentHubLogs(publicClient: PublicClient, windows: number) {
  const latest = await withRpcRetry(() => publicClient.getBlockNumber())
  const logs: Log[] = []
  let toBlock = latest
  for (let windowIndex = 0; windowIndex < windows; windowIndex += 1) {
    const fromBlock = toBlock >= ACTIVITY_WINDOW_BLOCKS - 1n ? toBlock - (ACTIVITY_WINDOW_BLOCKS - 1n) : 0n
    logs.push(...await withRpcRetry(() => publicClient.getLogs({ address: ROUTER_ADDRESS, fromBlock, toBlock })))
    if (fromBlock === 0n) break
    toBlock = fromBlock - 1n
  }
  const oldest = logs.reduce((block, log) => log.blockNumber && log.blockNumber < block ? log.blockNumber : block, latest)
  const [latestHeader, oldestHeader] = await Promise.all([
    withRpcRetry(() => publicClient.getBlock({ blockNumber: latest })),
    withRpcRetry(() => publicClient.getBlock({ blockNumber: oldest })),
  ])
  const observedBlocks = Number(latest - oldest)
  const observedMs = Number(latestHeader.timestamp - oldestHeader.timestamp) * 1_000
  const blockTimeMs = observedBlocks > 0 && observedMs > 0
    ? Math.min(2_000, Math.max(250, observedMs / observedBlocks))
    : BLOCK_TIME_MS
  return { logs, latest, latestTimestampMs: Number(latestHeader.timestamp) * 1_000, blockTimeMs }
}

export function useTokenDiscovery() {
  const reconnectTimer = useRef<number | null>(null)

  useEffect(() => {
    let stopped = false
    let attempt = 0
    let cleanups: Array<() => void> = []
    let lastSelectedRefresh = 0
    let lastActivitySync = 0
    let activitySyncing = false
    let marketRefreshRunning = false
    let marketFlushTimer: number | null = null
    let activityRetryTimer: number | null = null
    const pendingMarketRefresh = new Set<Address>()
    const marketRetryAfter = new Map<string, number>()
    const store = useTradeFarmStore
    // Keep WebSocket traffic subscription-only. Arc currently rate-limits a
    // burst of bounded eth_getLogs calls on that transport, while the same
    // backfill and Multicall3 reads complete reliably over HTTP.
    const readClient = createPublicClient({
      chain: arcTestnet,
      transport: http('https://rpc.testnet.arc.io', {
        retryCount: 1,
        retryDelay: 350,
        timeout: 15_000,
      }),
    })
    store.getState().setMarketActivityStatus(false, 0, null)

    const mergeMarkets = (snapshots: Token[]) => {
      if (snapshots.length === 0 || stopped) return
      const snapshotKeys = new Set(snapshots.map((market) => market.address.toLowerCase()))
      const retained = store.getState().tokens.filter((market) => !snapshotKeys.has(market.address.toLowerCase()))
      store.getState().setTokens([...snapshots, ...retained].slice(0, 240))
    }

    const loadSnapshots = async (client: PublicClient, tokens: Address[]) => {
      if (tokens.length === 0) return []
      return withRpcRetry(() => loadMarketSnapshots(client, tokens, store.getState().tokens))
    }

    const flushMarketRefresh = async (client: PublicClient) => {
      if (stopped || marketRefreshRunning || activitySyncing || pendingMarketRefresh.size === 0) return
      marketRefreshRunning = true
      const tokens = [...pendingMarketRefresh].slice(0, ACTIVE_MARKET_LIMIT)
      tokens.forEach((token) => pendingMarketRefresh.delete(token))
      try {
        const snapshots = await loadSnapshots(client, tokens)
        mergeMarkets(snapshots)
        const resolved = new Set(snapshots.map((market) => market.address.toLowerCase()))
        for (const token of tokens) {
          if (!resolved.has(token.toLowerCase())) marketRetryAfter.set(token.toLowerCase(), Date.now() + 30_000)
        }
        const selected = store.getState().selectedToken.toLowerCase()
        const selectedMarket = snapshots.find((market) => market.address.toLowerCase() === selected)
        if (selectedMarket) store.getState().addPricePoint({ time: Date.now(), price: selectedMarket.price })
      } catch {
        tokens.forEach((token) => pendingMarketRefresh.add(token))
      } finally {
        marketRefreshRunning = false
        if (!stopped && pendingMarketRefresh.size > 0 && marketFlushTimer === null) {
          marketFlushTimer = window.setTimeout(() => {
            marketFlushTimer = null
            void flushMarketRefresh(client)
          }, 2_000)
        }
      }
    }

    const queueMarketRefresh = (client: PublicClient, tokens: Address[]) => {
      const now = Date.now()
      tokens.forEach((token) => {
        if ((marketRetryAfter.get(token.toLowerCase()) ?? 0) <= now) pendingMarketRefresh.add(token)
      })
      if (pendingMarketRefresh.size === 0 || marketFlushTimer !== null) return
      marketFlushTimer = window.setTimeout(() => {
        marketFlushTimer = null
        void flushMarketRefresh(client)
      }, 750)
    }

    const healthy = () => {
      attempt = 0
      store.getState().setNetworkConnected(true)
    }

    const syncActivity = async (client: PublicClient, full: boolean) => {
      if (stopped || activitySyncing) return
      activitySyncing = true
      try {
        const backfill = await fetchRecentHubLogs(client, full ? FULL_ACTIVITY_WINDOWS : INCREMENTAL_ACTIVITY_WINDOWS)
        const trades = parseHubTrades(backfill.logs, backfill.latest, backfill.latestTimestampMs, backfill.blockTimeMs, store.getState().tokens)
        store.getState().mergeRecentTrades(trades)
        const currentTrades = store.getState().recentTrades
        const activeTokens = rankActiveTokens(currentTrades)
        const snapshots = await loadSnapshots(client, activeTokens)
        mergeMarkets(snapshots)
        const cutoff = Date.now() - 10 * 60_000
        const indexedTokenCount = new Set(currentTrades.filter((trade) => trade.timestamp >= cutoff).map((trade) => trade.token.toLowerCase())).size
        store.getState().setMarketActivityStatus(true, indexedTokenCount, null)
        healthy()
      } catch (cause) {
        store.getState().setNetworkConnected(false)
        if (!store.getState().marketActivityReady) {
          store.getState().setMarketActivityStatus(false, 0, activityFailureMessage(cause))
        }
        if (full && !stopped && !store.getState().marketActivityReady && activityRetryTimer === null) {
          activityRetryTimer = window.setTimeout(() => {
            activityRetryTimer = null
            void syncActivity(client, true)
          }, 5_000)
        }
      } finally {
        activitySyncing = false
        if (pendingMarketRefresh.size > 0) void flushMarketRefresh(client)
      }
    }

    const updateSelectedMarket = async (client: PublicClient, tokenAddress: Address) => {
      const [snapshot] = await loadSnapshots(client, [tokenAddress])
      if (!snapshot) throw new Error('Selected token has no graduated Flipt pool')
      mergeMarkets([snapshot])
      return snapshot
    }

    const connect = () => {
      if (stopped) return
      cleanups.forEach((cleanup) => cleanup())
      cleanups = []

      const client = createPublicClient({
        chain: arcTestnet,
        transport: webSocket('wss://rpc.testnet.arc.io', {
          reconnect: { attempts: 1, delay: 500 },
          retryCount: 1,
        }),
      })

      const reconnect = () => {
        if (stopped || reconnectTimer.current) return
        store.getState().setNetworkConnected(false)
        const delay = Math.min(1_000 * 2 ** attempt, 30_000)
        attempt += 1
        reconnectTimer.current = window.setTimeout(() => {
          reconnectTimer.current = null
          lastActivitySync = 0
          connect()
        }, delay)
      }

      try {
        const unwatchHub = client.watchEvent({
          address: ROUTER_ADDRESS,
          onLogs: (logs) => {
            healthy()
            const latestBlock = logs.reduce((block, log) => log.blockNumber && log.blockNumber > block ? log.blockNumber : block, 0n)
            const trades = parseHubTrades(logs, latestBlock, Date.now(), BLOCK_TIME_MS, store.getState().tokens)
            if (trades.length === 0) return
            store.getState().mergeRecentTrades(trades)
            queueMarketRefresh(readClient, [...new Map(trades.map((trade) => [trade.token.toLowerCase(), trade.token])).values()])
          },
          onError: reconnect,
        })

        const unwatchBlocks = client.watchBlocks({
          emitOnBegin: true,
          onBlock: () => {
            healthy()
            const now = Date.now()
            if (now - lastSelectedRefresh >= 3_000) {
              lastSelectedRefresh = now
              const selected = store.getState().selectedToken
              if (isAddress(selected)) {
                void updateSelectedMarket(readClient, selected).then((market) => {
                  store.getState().addPricePoint({ time: now, price: market.price })
                }).catch(() => undefined)
              }
            }
            if (now - lastActivitySync >= 60_000) {
              const full = lastActivitySync === 0
              lastActivitySync = now
              void syncActivity(readClient, full)
            }
          },
          onError: reconnect,
        })
        cleanups.push(unwatchHub, unwatchBlocks)
        if (lastActivitySync === 0) {
          lastActivitySync = Date.now()
          void syncActivity(readClient, true)
        }
      } catch {
        reconnect()
      }
    }

    connect()
    return () => {
      stopped = true
      cleanups.forEach((cleanup) => cleanup())
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
      if (marketFlushTimer !== null) window.clearTimeout(marketFlushTimer)
      marketFlushTimer = null
      if (activityRetryTimer !== null) window.clearTimeout(activityRetryTimer)
      activityRetryTimer = null
    }
  }, [])
}
