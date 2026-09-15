'use client'

import { useCallback, useEffect, useState } from 'react'
import { decodeEventLog, formatUnits, parseAbiItem, type Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { ROUTER_ADDRESS, USDC_ADDRESS } from '@/lib/contracts'
import type { LeaderboardRow } from '@/types/trading'

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const BUY_EVENT_TOPIC = '0x112dc08c6be44af9aebcd443037a82482908589198e8a4682ba423a81c87202f'
const SELL_EVENT_TOPIC = '0x3a3fb3844a4a3578d1c660c5d0d81d6a02d050152df03f2a3e732a4b07c1a9e6'
const BLOCK_WINDOW = 512n
const MAX_WINDOWS = 4

interface TradeEvent {
  transactionHash: `0x${string}`
  wallet: Address
  side: 'buy' | 'sell'
  blockNumber: bigint
  logIndex: number
}

export function useLeaderboard(enabled = true) {
  const publicClient = usePublicClient()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [sampleSize, setSampleSize] = useState(0)
  const [source, setSource] = useState<'live' | 'unavailable'>('unavailable')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!publicClient) return
    setIsLoading(true)
    setError(null)
    try {
      const latest = await publicClient.getBlockNumber()
      const trades: TradeEvent[] = []
      const usdcLogs: Awaited<ReturnType<typeof publicClient.getLogs>> = []
      const seenTrades = new Set<string>()
      let toBlock = latest
      let windows = 0

      // A broad 5,000-block USDC query exceeds Arc RPC's 20,000-result cap.
      // Small paired windows first identify verified Hub buys/sells, then use
      // the matching USDC Transfer logs for exact routed amounts.
      while (trades.length < 500 && windows < MAX_WINDOWS) {
        const fromBlock = toBlock >= BLOCK_WINDOW - 1n ? toBlock - (BLOCK_WINDOW - 1n) : 0n
        const hubLogs = await publicClient.getLogs({ address: ROUTER_ADDRESS, fromBlock, toBlock })
        const windowUsdcLogs = await publicClient.getLogs({ address: USDC_ADDRESS, event: transferEvent, fromBlock, toBlock })
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
        if (fromBlock === 0n) break
        toBlock = fromBlock - 1n
        windows += 1
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

      const liveRows = [...walletStats.values()]
        .map((item) => ({ wallet: item.wallet, volume: item.volume, trades: item.trades, estimatedPnl: item.sells - item.buys }))
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 50)
      setRows(liveRows)
      setSampleSize(matchedTransfers)
      setSource('live')
      setLastUpdated(Date.now())
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.split('\n')[0] : 'Arc RPC request failed.'
      setError(message || 'Arc RPC request failed.')
      setSource('unavailable')
      setLastUpdated(Date.now())
    } finally {
      setIsLoading(false)
    }
  }, [publicClient])

  useEffect(() => {
    if (enabled) void refresh()
  }, [enabled, refresh])

  return { rows, isLoading, lastUpdated, sampleSize, refresh, source, error }
}
