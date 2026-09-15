import type { LeaderboardRow } from '@/types/trading'

export function LeaderboardStats({ rows, sampleSize }: { rows: LeaderboardRow[]; sampleSize: number }) {
  const totalVolume = rows.reduce((total, row) => total + row.volume, 0)
  const stats = [
    { label: 'Top-50 volume', value: `$${totalVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, note: 'USDC routed' },
    { label: 'Ranked wallets', value: rows.length.toLocaleString(), note: 'Shown below' },
    { label: 'Transfers', value: sampleSize.toLocaleString(), note: 'Matched sample' },
  ]
  return (
    <>
      <div className="panel grid grid-cols-3 divide-x divide-border overflow-hidden rounded-lg sm:hidden">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 px-3 py-4 text-center">
            <p className="truncate text-[8px] font-semibold uppercase tracking-wider text-text-secondary">{stat.label}</p>
            <p className="mt-2 truncate font-mono text-lg font-semibold tracking-tight">{stat.value}</p>
            <p className="mt-1 truncate text-[8px] text-text-secondary">{stat.note}</p>
          </div>
        ))}
      </div>
      <div className="hidden gap-3 sm:grid sm:grid-cols-3">
        {stats.map((stat, index) => (
          <div key={stat.label} className="panel relative overflow-hidden rounded-lg p-5">
            <span className="absolute right-4 top-4 font-mono text-2xl text-border">0{index + 1}</span>
            <p className="panel-title">{stat.label}</p>
            <p className="mt-3 font-mono text-2xl font-semibold tracking-tight">{stat.value}</p>
            <p className="mt-1 text-[10px] text-text-secondary">{stat.note}</p>
          </div>
        ))}
      </div>
    </>
  )
}
