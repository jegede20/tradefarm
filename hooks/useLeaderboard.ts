'use client'

import { useCallback, useEffect, useState } from 'react'
import { decodeEventLog, formatUnits, parseAbiItem, type Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { ROUTER_ADDRESS, USDC_ADDRESS } from '@/lib/contracts'
import type { LeaderboardRow } from '@/types/trading'

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

const fallbackRows: LeaderboardRow[] = Array.from({ length: 50 }, (_, index) => ({
  wallet: `0x${(BigInt('0x893ec294a87f5d21') + BigInt(index) * 8731n).toString(16).padStart(40, '0').slice(-40)}` as Address,
  volume: Math.max(842_593 - index * 14_721 + (index % 4) * 3_300, 7_200),
  trades: Math.max(184 - index * 3, 4),
  estimatedPnl: (index % 5 === 2 ? -1 : 1) * (34_820 - index * 511),
}))

export function useLeaderboard() {
  const publicClient = usePublicClient()
  const [rows, setRows] = useState<LeaderboardRow[]>(fallbackRows)
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [source, setSource] = useState<'live' | 'preview'>('preview')

  const refresh = useCallback(async () => {
    if (!publicClient) return
    setIsLoading(true)
    try {
      const latest = await publicClient.getBlockNumber()
      const collected: Awaited<ReturnType<typeof publicClient.getLogs>> = []
      let toBlock = latest
      let windows = 0

      while (collected.length < 500 && windows < 8) {
        const fromBlock = toBlock > 4_999n ? toBlock - 4_999n : 0n
        const logs = await publicClient.getLogs({
          address: USDC_ADDRESS,
          event: transferEvent,
          fromBlock,
          toBlock,
        })
        collected.unshift(...logs)
        if (fromBlock === 0n) break
        toBlock = fromBlock - 1n
        windows += 1
      }

      const walletStats = new Map<string, { wallet: Address; volume: number; trades: number; buys: number; sells: number }>()
      const recent = collected.slice(-500)
      for (const log of recent) {
        const decoded = decodeEventLog({ abi: [transferEvent], data: log.data, topics: log.topics })
        const from = decoded.args.from as Address
        const to = decoded.args.to as Address
        const value = Number(formatUnits(decoded.args.value as bigint, 6))
        const router = ROUTER_ADDRESS.toLowerCase()
        let wallet: Address | null = null
        let side: 'buy' | 'sell' | null = null
        if (to.toLowerCase() === router && from.toLowerCase() !== router) { wallet = from; side = 'buy' }
        if (from.toLowerCase() === router && to.toLowerCase() !== router) { wallet = to; side = 'sell' }
        if (!wallet || !side) continue
        const key = wallet.toLowerCase()
        const current = walletStats.get(key) ?? { wallet, volume: 0, trades: 0, buys: 0, sells: 0 }
        current.volume += value
        current.trades += 1
        current[side === 'buy' ? 'buys' : 'sells'] += value
        walletStats.set(key, current)
      }

      const liveRows = [...walletStats.values()]
        .map((item) => ({ wallet: item.wallet, volume: item.volume, trades: item.trades, estimatedPnl: item.sells - item.buys }))
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 50)
      if (liveRows.length > 0) {
        setRows(liveRows)
        setSource('live')
      }
      setLastUpdated(Date.now())
    } catch {
      setSource('preview')
      setLastUpdated(Date.now())
    } finally {
      setIsLoading(false)
    }
  }, [publicClient])

  useEffect(() => { void refresh() }, [refresh])

  return { rows, isLoading, lastUpdated, refresh, source }
}
