'use client'

import { useAccount } from 'wagmi'
import type { LeaderboardRow } from '@/types/trading'
import { AddressDisplay } from '@/components/shared/AddressDisplay'
import { PnLDisplay } from '@/components/shared/PnLDisplay'
import { Icon } from '@/components/shared/Icons'
import { formatTime } from '@/lib/formatters'
import { cn } from '@/lib/utils'

interface LeaderboardTableProps {
  rows: LeaderboardRow[]
  refresh: () => void
  isLoading: boolean
  lastUpdated: number | null
  source: 'live' | 'cached' | 'unavailable'
  error: string | null
}

export function LeaderboardTable({ rows, refresh, isLoading, lastUpdated, source, error }: LeaderboardTableProps) {
  const { address } = useAccount()
  const emptyMessage = isLoading
    ? 'Reading recent Flipt USDC transfers from Arc…'
    : error
      ? `Arc RPC unavailable: ${error}`
      : 'No router-linked transfers were found in the sampled blocks.'

  return (
    <section className="panel overflow-hidden rounded-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
        <div>
          <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Top Arc traders</h2><span className={cn('rounded-full border px-2 py-0.5 font-mono text-[8px]', isLoading ? 'border-accent-primary/30 bg-accent-primary/10 text-[#c4b5fd]' : source === 'live' ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning')}>{isLoading ? rows.length ? 'UPDATING' : 'SYNCING' : source === 'live' ? 'LIVE' : source === 'cached' ? 'CACHED' : 'RPC UNAVAILABLE'}</span></div>
          <p className="mt-1 font-mono text-[9px] text-text-secondary">{lastUpdated ? `UPDATED ${formatTime(lastUpdated)}${error ? ' · REFRESH DELAYED' : ''}` : 'FETCHING ROUTER EVENTS…'}</p>
        </div>
        <button type="button" onClick={refresh} disabled={isLoading} className="button-secondary flex h-8 items-center gap-2 px-3 text-[10px] font-semibold">
          <Icon name="refresh" className={cn('h-3 w-3', isLoading && 'animate-spin')} /> {isLoading ? 'SYNCING…' : 'REFRESH'}
        </button>
      </div>

      <div className="sm:hidden">
        {rows.length === 0 ? <p className="px-5 py-12 text-center text-xs leading-relaxed text-text-secondary">{emptyMessage}</p> : rows.slice(0, 50).map((row, index) => {
          const isYou = address?.toLowerCase() === row.wallet.toLowerCase()
          return (
            <div key={row.wallet} className={cn('border-b border-border/60 p-4 last:border-0', isYou && 'border-l-2 border-l-accent-primary bg-accent-primary/5')}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3"><Rank index={index} /><AddressDisplay address={row.wallet} explorer /></div>
                {isYou && <span className="rounded border border-accent-primary/40 bg-accent-primary/15 px-1.5 py-0.5 text-[8px] font-semibold text-[#c4b5fd]">YOU</span>}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <MobileMetric label="Volume" value={`$${row.volume.toLocaleString('en-US', { maximumFractionDigits: 2 })}`} />
                <MobileMetric label="Trades" value={row.trades.toString()} />
                <div><p className="data-label">Est. PnL</p><PnLDisplay value={row.estimatedPnl} className="mt-1 block text-xs" /></div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead><tr className="border-b border-border bg-bg-primary/50 text-[9px] uppercase tracking-wider text-text-secondary">
            <th className="w-20 px-4 py-2.5 font-medium">Rank</th><th className="px-4 py-2.5 font-medium">Wallet</th><th className="px-4 py-2.5 text-right font-medium">Volume (USDC)</th><th className="px-4 py-2.5 text-right font-medium">Trades</th><th className="px-4 py-2.5 text-right font-medium">Est. PnL</th>
          </tr></thead>
          <tbody>{rows.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-16 text-center text-xs text-text-secondary">{emptyMessage}</td></tr>
          ) : rows.slice(0, 50).map((row, index) => {
            const isYou = address?.toLowerCase() === row.wallet.toLowerCase()
            return (
              <tr key={row.wallet} className={cn('border-b border-border/50 text-xs last:border-0 hover:bg-bg-elevated/40', isYou && 'border-l-2 border-l-accent-primary bg-accent-primary/5')}>
                <td className="px-4 py-3"><Rank index={index} /></td>
                <td className="px-4 py-3"><div className="flex items-center gap-2"><AddressDisplay address={row.wallet} explorer />{isYou && <span className="rounded border border-accent-primary/40 bg-accent-primary/15 px-1.5 py-0.5 text-[8px] font-semibold text-[#c4b5fd]">YOU</span>}</div></td>
                <td className="px-4 py-3 text-right font-mono">${row.volume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right font-mono text-text-secondary">{row.trades}</td>
                <td className="px-4 py-3 text-right"><PnLDisplay value={row.estimatedPnl} /></td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
    </section>
  )
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="data-label">{label}</p><p className="mt-1 truncate font-mono text-xs">{value}</p></div>
}

function Rank({ index }: { index: number }) {
  const colors = ['border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#fbbf24]', 'border-[#cbd5e1]/40 bg-[#cbd5e1]/10 text-[#cbd5e1]', 'border-[#d97706]/40 bg-[#d97706]/10 text-[#d97706]']
  if (index < 3) return <span className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold', colors[index])}>{index + 1}</span>
  return <span className="w-7 shrink-0 text-center font-mono text-[10px] text-text-secondary">{String(index + 1).padStart(2, '0')}</span>
}
