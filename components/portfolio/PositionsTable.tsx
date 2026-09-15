'use client'

import { useState } from 'react'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { TokenBadge } from '@/components/shared/TokenBadge'
import { PnLDisplay } from '@/components/shared/PnLDisplay'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatPrice } from '@/lib/formatters'
import { QuickSellModal } from './QuickSellModal'
import type { Position } from '@/types/trading'

export function PositionsTable() {
  const positions = useTradeFarmStore((state) => state.positions)
  const tokens = useTradeFarmStore((state) => state.tokens)
  const [selected, setSelected] = useState<Position | null>(null)

  return (
    <section className="panel overflow-hidden rounded-lg">
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <div><h2 className="text-sm font-semibold">Open positions</h2><p className="mt-0.5 text-[10px] text-text-secondary">Marked to live bonding curve prices</p></div>
        <span className="rounded border border-border bg-bg-primary px-2 py-1 font-mono text-[9px] text-text-secondary">{positions.length} OPEN</span>
      </div>
      {positions.length === 0 ? <EmptyState title="No open positions" description="Your confirmed TradeFarm buys will appear here." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead><tr className="border-b border-border bg-bg-primary/50 text-[9px] uppercase tracking-wider text-text-secondary">
              {['Token', 'Amount', 'Entry price', 'Current price', 'PnL', 'PnL %', 'Action'].map((heading) => <th key={heading} className="px-4 py-2.5 font-medium">{heading}</th>)}
            </tr></thead>
            <tbody>{positions.map((position) => {
              const token = tokens.find((item) => item.address === position.token)
              const currentPrice = token?.price ?? position.currentPrice
              const pnl = position.amount * currentPrice - position.entryUSDC
              const pnlPct = position.entryUSDC > 0 ? (pnl / position.entryUSDC) * 100 : 0
              return (
                <tr key={position.token} className="border-b border-border/50 text-xs transition last:border-0 hover:bg-bg-elevated/40">
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><TokenBadge symbol={position.symbol} /><div><p className="font-semibold">{position.symbol}</p><p className="font-mono text-[9px] text-text-secondary">{position.token.slice(0, 7)}…{position.token.slice(-4)}</p></div></div></td>
                  <td className="px-4 py-3 font-mono">{position.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
                  <td className="px-4 py-3 font-mono text-text-secondary">{formatPrice(position.entryPrice)}</td>
                  <td className="px-4 py-3 font-mono">{formatPrice(currentPrice)}</td>
                  <td className="px-4 py-3"><PnLDisplay value={pnl} /></td>
                  <td className="px-4 py-3"><PnLDisplay value={pnlPct} percent /></td>
                  <td className="px-4 py-3"><button type="button" onClick={() => setSelected({ ...position, currentPrice })} className="rounded border border-danger/40 bg-danger/10 px-3 py-1.5 text-[10px] font-semibold text-danger transition hover:bg-danger/20">QUICK SELL</button></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}
      {selected && <QuickSellModal position={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}
