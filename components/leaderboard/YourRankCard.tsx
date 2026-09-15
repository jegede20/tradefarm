'use client'

import { useAccount } from 'wagmi'
import { PnLDisplay } from '@/components/shared/PnLDisplay'
import type { LeaderboardRow } from '@/types/trading'

interface YourRankCardProps {
  rows: LeaderboardRow[]
  sampleSize: number
  source: 'live' | 'cached' | 'unavailable'
  isLoading: boolean
}

export function YourRankCard({ rows, sampleSize, source, isLoading }: YourRankCardProps) {
  const { address } = useAccount()
  const rankIndex = address ? rows.findIndex((row) => row.wallet.toLowerCase() === address.toLowerCase()) : -1
  const row = rankIndex >= 0 ? rows[rankIndex] : null
  const rank50Volume = rows[49]?.volume ?? rows[rows.length - 1]?.volume ?? 0
  const gap = Math.max(0, rank50Volume - (row?.volume ?? 0))
  const status = !address
    ? 'CONNECT WALLET'
    : isLoading && source === 'unavailable'
      ? 'SYNCING'
      : row
        ? `#${rankIndex + 1}`
        : source === 'unavailable'
          ? 'UNAVAILABLE'
          : 'NOT IN LATEST 500'

  return (
    <section className="panel overflow-hidden rounded-lg border-accent-primary/25 bg-accent-primary/[0.03] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="panel-title text-[#a78bfa]">Your sampled position</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-text-primary">{status}</p>
          <p className="mt-1 text-[9px] leading-relaxed text-text-secondary">Ranked only within the latest {sampleSize || 500} verified router-linked transfers; this is not an official all-time Flipt rank.</p>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <Metric label="Volume" value={`$${(row?.volume ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`} />
          <Metric label="Trades" value={(row?.trades ?? 0).toString()} />
          <div><p className="data-label">Est. flow PnL</p><PnLDisplay value={row?.estimatedPnl ?? 0} className="mt-1 block font-mono text-xs" /></div>
          <Metric label="Gap to #50" value={rankIndex >= 0 && rankIndex < 50 ? 'QUALIFIED' : `$${gap.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} />
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="data-label">{label}</p><p className="mt-1 font-mono text-xs">{value}</p></div>
}
