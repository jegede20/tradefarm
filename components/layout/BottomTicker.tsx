'use client'

import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { formatPrice } from '@/lib/formatters'
import { cn } from '@/lib/utils'

export function BottomTicker() {
  const tokens = useTradeFarmStore((state) => state.tokens)
  const tape = [...tokens, ...tokens]

  return (
    <div className="group fixed inset-x-0 bottom-0 z-50 h-8 overflow-hidden border-t border-border bg-bg-primary/95 backdrop-blur-xl">
      <div className="flex h-full w-max animate-marquee items-center group-hover:[animation-play-state:paused]">
        {tape.map((token, index) => (
          <div key={`${token.address}-${index}`} className="flex h-full shrink-0 items-center font-mono text-[10px]">
            <span className="px-3 font-semibold text-text-primary">{token.symbol}</span>
            <span className="text-text-secondary">{formatPrice(token.price)}</span>
            <span className={cn('ml-2 px-3', token.priceChange24h >= 0 ? 'text-success' : 'text-danger')}>
              {token.priceChange24h >= 0 ? '+' : ''}{token.priceChange24h.toFixed(2)}%
            </span>
            <span className="h-3 w-px bg-border" />
          </div>
        ))}
      </div>
    </div>
  )
}
