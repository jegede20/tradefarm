'use client'

import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { TradeBox } from './TradeBox'

export function RightPanel() {
  const connected = useTradeFarmStore((state) => state.networkConnected)
  return (
    <aside className="w-full shrink-0 border-l border-border bg-bg-surface lg:w-80">
      <div className="flex h-11 items-center justify-between border-b border-border px-4">
        <h2 className="panel-title">Order entry</h2>
        <span className={`flex items-center gap-1.5 font-mono text-[8px] ${connected ? 'text-success' : 'text-text-secondary'}`}>
          <span className={`h-1.5 w-1.5 rounded-sm ${connected ? 'bg-success' : 'bg-text-secondary'}`} /> {connected ? 'HUB SYNCED' : 'CONNECTING'}
        </span>
      </div>
      <TradeBox />
    </aside>
  )
}
