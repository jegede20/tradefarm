'use client'

import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { formatPrice } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/shared/Icons'
import { TokenBadge } from '@/components/shared/TokenBadge'

export function Watchlist() {
  const tokens = useTradeFarmStore((state) => state.tokens)
  const watchlist = useTradeFarmStore((state) => state.watchlist)
  const selected = useTradeFarmStore((state) => state.selectedToken)
  const setSelected = useTradeFarmStore((state) => state.setSelectedToken)
  const toggle = useTradeFarmStore((state) => state.toggleWatchlist)
  const displayed = [...tokens].sort((a, b) => Number(watchlist.includes(b.address)) - Number(watchlist.includes(a.address))).slice(0, 7)

  return (
    <section>
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <h2 className="panel-title">Watchlist</h2>
        <span className="font-mono text-[9px] text-text-secondary">{watchlist.length.toString().padStart(2, '0')} PINNED</span>
      </div>
      <div>
        {displayed.map((token) => (
          <button
            key={token.address}
            type="button"
            onClick={() => setSelected(token.address)}
            className={cn(
              'group relative grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 border-l-2 px-3 py-2 text-left transition hover:bg-bg-elevated/70',
              selected === token.address ? 'border-accent-primary bg-bg-elevated' : 'border-transparent',
            )}
          >
            <TokenBadge symbol={token.symbol} className="h-6 w-6 text-[8px]" />
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold">{token.symbol}</span>
              <span className="block truncate text-[9px] text-text-secondary">{token.name}</span>
            </span>
            <span className="text-right">
              <span className="block font-mono text-[10px] text-text-primary">{formatPrice(token.price)}</span>
              <span className={cn('block font-mono text-[9px]', token.priceChange24h >= 0 ? 'text-success' : 'text-danger')}>
                {token.priceChange24h >= 0 ? '+' : ''}{token.priceChange24h.toFixed(2)}%
              </span>
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => { event.stopPropagation(); toggle(token.address) }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); toggle(token.address) } }}
              className="absolute right-0.5 top-1/2 hidden -translate-y-1/2 rounded bg-bg-elevated p-1 text-text-secondary hover:text-text-primary group-hover:block"
              aria-label={`${watchlist.includes(token.address) ? 'Unpin' : 'Pin'} ${token.symbol}`}
            >
              <Icon name="pin" className={cn('h-3 w-3', watchlist.includes(token.address) ? 'fill-accent-primary/30 text-accent-primary' : 'text-text-secondary')} />
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
