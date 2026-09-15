'use client'

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { usePathname } from 'next/navigation'
import { useBotRunner } from '@/hooks/useBotRunner'
import { useLeaderboard } from '@/hooks/useLeaderboard'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'

interface BotRunnerControls {
  startBot: () => void
  stopBot: () => void
  leaderboardSource: string
  leaderboardLoading: boolean
}

const BotRunnerContext = createContext<BotRunnerControls | null>(null)

export function BotRunnerProvider({ children }: { children: ReactNode }) {
  const { startBot, stopBot } = useBotRunner()
  const { address } = useAccount()
  const pathname = usePathname()
  const status = useTradeFarmStore((state) => state.botStatus)
  const config = useTradeFarmStore((state) => state.botConfig)
  const tradeHistoryCount = useTradeFarmStore((state) => state.tradeHistory.length)
  const setLeaderboardSnapshot = useTradeFarmStore((state) => state.setBotLeaderboardSnapshot)
  const setNextActionAt = useTradeFarmStore((state) => state.setBotNextActionAt)
  const leaderboard = useLeaderboard(status === 'running' || pathname === '/bot')

  const observedSnapshot = useMemo(() => {
    if (!address) return { rank: null, volume: 0, targetVolume: null, gap: null, sampleSize: 0 }
    if (leaderboard.source !== 'live') return null
    const index = leaderboard.rows.findIndex((row) => row.wallet.toLowerCase() === address.toLowerCase())
    const rank = index >= 0 ? index + 1 : null
    const volume = index >= 0 ? leaderboard.rows[index].volume : 0
    const targetVolume = leaderboard.rows[config.targetRank - 1]?.volume
      ?? leaderboard.rows[leaderboard.rows.length - 1]?.volume
      ?? null
    const reached = rank !== null && rank <= config.targetRank
    const gap = targetVolume === null ? null : reached ? 0 : Math.max(0, targetVolume - volume + 0.01)
    return { rank, volume, targetVolume, gap, sampleSize: leaderboard.sampleSize }
  }, [address, config.targetRank, leaderboard.rows, leaderboard.sampleSize, leaderboard.source])

  useEffect(() => {
    if (!observedSnapshot) return
    setLeaderboardSnapshot(observedSnapshot)
    if (status === 'running' && config.objectiveMode === 'reach' && observedSnapshot.rank !== null && observedSnapshot.rank <= config.targetRank) {
      setNextActionAt(Date.now())
    }
  }, [config.objectiveMode, config.targetRank, observedSnapshot, setLeaderboardSnapshot, setNextActionAt, status])

  useEffect(() => {
    if (status !== 'running') return
    const timer = window.setInterval(() => { void leaderboard.refresh() }, 60_000)
    return () => window.clearInterval(timer)
  }, [leaderboard.refresh, status])

  useEffect(() => {
    if (status !== 'running' || tradeHistoryCount === 0) return
    const timer = window.setTimeout(() => { void leaderboard.refresh() }, 1_500)
    return () => window.clearTimeout(timer)
  }, [leaderboard.refresh, status, tradeHistoryCount])

  const value = useMemo(() => ({
    startBot,
    stopBot,
    leaderboardSource: leaderboard.source,
    leaderboardLoading: leaderboard.isLoading,
  }), [leaderboard.isLoading, leaderboard.source, startBot, stopBot])

  return <BotRunnerContext.Provider value={value}>{children}</BotRunnerContext.Provider>
}

export function useBotRunnerControls() {
  const controls = useContext(BotRunnerContext)
  if (!controls) throw new Error('useBotRunnerControls must be used inside BotRunnerProvider')
  return controls
}
