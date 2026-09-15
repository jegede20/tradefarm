import type { LeaderboardRow } from '@/types/trading'

export function LeaderboardStats({ rows }: { rows: LeaderboardRow[] }) {
  const totalVolume = rows.reduce((total, row) => total + row.volume, 0)
  const totalTrades = rows.reduce((total, row) => total + row.trades, 0)
  const stats = [
    { label: 'Total testnet volume', value: `$${totalVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, note: 'USDC routed' },
    { label: 'Unique traders', value: rows.length.toLocaleString(), note: 'Last 500 events' },
    { label: 'Total trades', value: totalTrades.toLocaleString(), note: 'Confirmed transfers' },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {stats.map((stat, index) => (
        <div key={stat.label} className="panel relative overflow-hidden rounded-lg p-5">
          <span className="absolute right-4 top-4 font-mono text-2xl text-border">0{index + 1}</span>
          <p className="panel-title">{stat.label}</p>
          <p className="mt-3 font-mono text-2xl font-semibold tracking-tight">{stat.value}</p>
          <p className="mt-1 text-[10px] text-text-secondary">{stat.note}</p>
        </div>
      ))}
    </div>
  )
}
