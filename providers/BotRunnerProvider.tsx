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
  const setLeaderboardRank = useTradeFarmStore((state) => state.setBotLeaderboardRank)
  const setNextActionAt = useTradeFarmStore((state) => state.setBotNextActionAt)
  const leaderboard = useLeaderboard(status === 'running' || pathname === '/bot')

  const observedRank = useMemo(() => {
    if (!address) return null
    const index = leaderboard.rows.findIndex((row) => row.wallet.toLowerCase() === address.toLowerCase())
    return index >= 0 ? index + 1 : null
  }, [address, leaderboard.rows])

  useEffect(() => {
    setLeaderboardRank(observedRank)
    if (status === 'running' && config.objectiveMode === 'reach' && observedRank !== null && observedRank <= config.targetRank) {
      setNextActionAt(Date.now())
    }
  }, [config.objectiveMode, config.targetRank, observedRank, setLeaderboardRank, setNextActionAt, status])

  useEffect(() => {
    if (status !== 'running') return
    const timer = window.setInterval(() => { void leaderboard.refresh() }, 60_000)
    return () => window.clearInterval(timer)
  }, [leaderboard.refresh, status])

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
