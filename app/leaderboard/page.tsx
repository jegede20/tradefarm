'use client'

import { LeaderboardStats } from '@/components/leaderboard/LeaderboardStats'
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable'
import { YourRankCard } from '@/components/leaderboard/YourRankCard'
import { useLeaderboard } from '@/hooks/useLeaderboard'

export default function LeaderboardPage() {
  const leaderboard = useLeaderboard()
  return (
    <div className="mx-auto max-w-[1200px] space-y-4 p-4 sm:p-6">
      <div className="mb-5 flex items-end justify-between">
        <div><p className="panel-title text-[#a78bfa]">Arc Testnet</p><h1 className="mt-1 text-xl font-semibold tracking-tight">Trader leaderboard</h1><p className="mt-1 text-xs text-text-secondary">Ranked by total USDC volume across the latest 500 router-linked transfers.</p></div>
        <span className="hidden font-mono text-[9px] text-text-secondary sm:block">ETH_GETLOGS · TOP 50</span>
      </div>
      <YourRankCard rows={leaderboard.rows} sampleSize={leaderboard.sampleSize} source={leaderboard.source} isLoading={leaderboard.isLoading} />
      <LeaderboardStats rows={leaderboard.rows} sampleSize={leaderboard.sampleSize} />
      <LeaderboardTable {...leaderboard} />
    </div>
  )
}
