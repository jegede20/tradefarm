'use client'

import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { formatPrice } from '@/lib/formatters'
import { PnLDisplay } from '@/components/shared/PnLDisplay'
import { TokenBadge } from '@/components/shared/TokenBadge'

export function MyPositions() {
  const positions = useTradeFarmStore((state) => state.positions)
  const setSelected = useTradeFarmStore((state) => state.setSelectedToken)

  return (
    <section className="border-t border-border">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <h2 className="panel-title">My positions</h2>
        <span className="font-mono text-[9px] text-text-secondary">{positions.length.toString().padStart(2, '0')}</span>
      </div>
      {positions.length === 0 ? (
        <p className="px-3 pb-4 text-[10px] text-text-secondary">No open positions.</p>
      ) : positions.slice(0, 4).map((position) => {
        const pnl = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100
        return (
          <button key={position.token} type="button" onClick={() => setSelected(position.token)} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2 text-left transition hover:bg-bg-elevated/70">
            <TokenBadge symbol={position.symbol} className="h-6 w-6 text-[8px]" />
            <span>
              <span className="block text-[11px] font-semibold">{position.symbol}</span>
              <span className="block font-mono text-[9px] text-text-secondary">entry {formatPrice(position.entryPrice)}</span>
            </span>
            <span className="text-right">
              <span className="block font-mono text-[10px]">{formatPrice(position.currentPrice)}</span>
              <PnLDisplay value={pnl} percent className="block text-[9px]" />
            </span>
          </button>
        )
      })}
    </section>
  )
}
