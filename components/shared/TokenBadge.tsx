import { cn } from '@/lib/utils'

export function TokenBadge({ symbol, className }: { symbol: string; className?: string }) {
  return (
    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-accent-primary/35 bg-accent-primary/10 font-mono text-[8px] font-semibold uppercase text-[#c4b5fd]', className)}>
      {symbol.replace(/[^a-z0-9]/gi, '').slice(0, 2) || '•'}
    </span>
  )
}
