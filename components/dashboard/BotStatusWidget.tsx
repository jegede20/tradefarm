'use client'

import Link from 'next/link'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { formatTime } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/shared/Icons'

export function BotStatusWidget() {
  const status = useTradeFarmStore((state) => state.botStatus)
  const lastAction = useTradeFarmStore((state) => state.lastBotAction)
  return (
    <section className="mt-auto border-t border-border p-3">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="panel-title">Bot status</h2>
        <Link href="/bot" className="flex items-center gap-0.5 text-[9px] font-medium uppercase tracking-wider text-[#a78bfa] hover:text-white">
          Manage <Icon name="chevron" className="h-3 w-3" />
        </Link>
      </div>
      <div className="rounded-md border border-border bg-bg-primary p-3">
        <div className="flex items-center justify-between">
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-semibold tracking-wider',
            status === 'running' ? 'border-success/30 bg-success/10 text-success' : status === 'error' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-border bg-bg-elevated text-text-secondary',
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', status === 'running' ? 'animate-pulse-dot bg-success' : status === 'error' ? 'bg-danger' : 'bg-text-secondary')} />
            {status.toUpperCase()}
          </span>
          <Icon name="bot" className="h-4 w-4 text-text-secondary" />
        </div>
        <p className="mt-3 text-[9px] uppercase tracking-wider text-text-secondary">Last action</p>
        <p className="mt-0.5 font-mono text-[10px] text-text-primary">{lastAction ? formatTime(lastAction) : 'No session activity'}</p>
      </div>
    </section>
  )
}
