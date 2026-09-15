'use client'

import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { AddressDisplay } from '@/components/shared/AddressDisplay'
import { TokenBadge } from '@/components/shared/TokenBadge'
import { formatCompact, formatPrice } from '@/lib/formatters'
import { cn } from '@/lib/utils'

export function TokenHeader() {
  const token = useTradeFarmStore((state) => state.tokens.find((item) => item.address === state.selectedToken) ?? state.tokens[0])
  if (!token) return null
  return (
    <header className="border-b border-border px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <TokenBadge symbol={token.symbol} className="h-10 w-10 text-xs" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight">{token.symbol}</h1>
              <span className="text-xs text-text-secondary">{token.name}</span>
              {token.graduated && <span className="rounded border border-accent-primary/40 bg-accent-primary/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-[#a78bfa]">Graduated</span>}
            </div>
            <AddressDisplay address={token.address} explorer className="mt-1" />
          </div>
        </div>

        <div className="text-right">
          <p className="font-mono text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">{formatPrice(token.price)}</p>
          <p className={cn('mt-0.5 font-mono text-xs', token.priceChange24h >= 0 ? 'text-success' : 'text-danger')}>
            {token.priceChange24h >= 0 ? '+' : ''}{token.priceChange24h.toFixed(2)}% <span className="text-text-secondary">24H</span>
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border/70 pt-3 sm:flex sm:gap-10">
        <Stat label="24H volume" value={`$${formatCompact(token.volume)}`} />
        <Stat label="Reserve" value={`${formatCompact(token.reserve)} USDC`} />
        <Stat label="Supply" value={formatCompact(token.supply)} />
      </div>
    </header>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><p className="data-label">{label}</p><p className="mt-1 font-mono text-[11px] text-text-primary">{value}</p></div>
}
