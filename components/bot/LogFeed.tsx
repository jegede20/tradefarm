'use client'

import { useEffect, useRef, useState } from 'react'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { formatTime } from '@/lib/formatters'
import { Icon } from '@/components/shared/Icons'
import { cn } from '@/lib/utils'
import type { LogLevel } from '@/types/trading'

const levelStyles: Record<LogLevel, string> = {
  INFO: 'text-text-primary', SCAN: 'text-[#a78bfa]', BUY: 'text-success', SELL: 'text-danger',
  HOLD: 'text-text-secondary', WAIT: 'text-text-secondary', ERROR: 'font-bold text-danger', QUOTE: 'text-[#a78bfa]', WARN: 'text-warning',
}

export function LogFeed() {
  const logs = useTradeFarmStore((state) => state.botLogs)
  const clear = useTradeFarmStore((state) => state.clearBotLogs)
  const status = useTradeFarmStore((state) => state.botStatus)
  const viewport = useRef<HTMLDivElement>(null)
  const [hovering, setHovering] = useState(false)

  useEffect(() => {
    if (!hovering && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight
  }, [hovering, logs])

  return (
    <section className="panel flex min-h-[680px] flex-col overflow-hidden rounded-lg">
      <div className="flex h-[65px] items-center justify-between border-b border-border px-4">
        <div><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-danger/80" /><span className="h-2.5 w-2.5 rounded-full bg-warning/80" /><span className="h-2.5 w-2.5 rounded-full bg-success/80" /><h2 className="ml-2 font-mono text-[10px] text-text-secondary">tradefarm://bot/live</h2></div><p className="mt-1.5 font-mono text-[8px] uppercase tracking-wider text-text-secondary">{status === 'running' ? 'PROCESS ACTIVE' : 'PROCESS IDLE'} · {logs.length}/200 LINES</p></div>
        <button type="button" onClick={clear} className="button-secondary flex h-8 items-center gap-1.5 px-3 text-[9px]"><Icon name="trash" className="h-3 w-3" /> CLEAR</button>
      </div>
      <div ref={viewport} onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)} className="flex-1 overflow-y-auto bg-bg-primary p-4 font-mono text-[10px] leading-6 sm:p-5 sm:text-[11px]">
        {logs.length === 0 ? <p className="text-text-secondary">No logs. Start the bot to begin a session.<span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-accent-primary align-middle" /></p> : logs.map((entry) => (
          <div key={entry.id} className="grid grid-cols-[62px_46px_1fr] gap-2 border-l border-transparent pl-2 hover:border-border hover:bg-bg-elevated/20">
            <span className="text-text-secondary/60">[{formatTime(entry.timestamp)}]</span>
            <span className={cn('font-semibold', levelStyles[entry.level])}>[{entry.level}]</span>
            <span className={cn('break-words', levelStyles[entry.level])}>{entry.message}</span>
          </div>
        ))}
      </div>
      <div className="flex h-8 items-center justify-between border-t border-border bg-bg-surface px-4 font-mono text-[8px] text-text-secondary"><span>AUTO-SCROLL {hovering ? 'PAUSED' : 'ON'}</span><span>ARC · 0.52S FINALITY</span></div>
    </section>
  )
}
