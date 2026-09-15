'use client'

import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { formatPrice, formatTime, truncateAddress } from '@/lib/formatters'
import { cn } from '@/lib/utils'

export function TradesFeed({ className }: { className?: string }) {
  const selected = useTradeFarmStore((state) => state.selectedToken)
  const trades = useTradeFarmStore((state) => state.recentTrades.filter((trade) => trade.token === selected).slice(0, 50))
  return (
    <section className={cn('min-h-[220px] bg-bg-primary', className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="panel-title">Recent trades</h2>
        <span className="font-mono text-[9px] text-text-secondary">LIVE · {trades.length} EVENTS</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        <div className="grid grid-cols-[64px_44px_1fr_85px_80px] border-b border-border/60 px-3 py-2 font-mono text-[8px] uppercase tracking-wider text-text-secondary sm:grid-cols-[72px_48px_1fr_110px_105px] sm:px-4">
          <span>Time</span><span>Side</span><span>Amount</span><span>Price</span><span>Wallet</span>
        </div>
        {trades.map((trade) => (
          <div key={trade.id} className={cn('grid grid-cols-[64px_44px_1fr_85px_80px] border-b border-border/40 border-l-2 px-3 py-2 font-mono text-[9px] hover:bg-bg-elevated/50 sm:grid-cols-[72px_48px_1fr_110px_105px] sm:px-4 sm:text-[10px]', trade.type === 'BUY' ? 'border-l-success' : 'border-l-danger')}>
            <span className="text-text-secondary">{formatTime(trade.timestamp)}</span>
            <span className={trade.type === 'BUY' ? 'text-success' : 'text-danger'}>{trade.type}</span>
            <span>{trade.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} {trade.symbol}</span>
            <span>{formatPrice(trade.price)}</span>
            <span className="text-text-secondary">{truncateAddress(trade.wallet, 5, 3)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
