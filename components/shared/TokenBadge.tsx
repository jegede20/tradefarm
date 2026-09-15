import { cn } from '@/lib/utils'

export function TokenBadge({ symbol, className }: { symbol: string; className?: string }) {
  const colors = ['from-violet-500 to-indigo-700', 'from-fuchsia-500 to-purple-700', 'from-cyan-500 to-blue-700', 'from-emerald-500 to-teal-700']
  const index = symbol.split('').reduce((total, char) => total + char.charCodeAt(0), 0) % colors.length
  return (
    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[9px] font-bold text-white shadow-inner', colors[index], className)}>
      {symbol.slice(0, 2)}
    </span>
  )
}
