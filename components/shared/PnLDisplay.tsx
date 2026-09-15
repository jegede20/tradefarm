import { cn } from '@/lib/utils'

export function PnLDisplay({ value, percent = false, className }: { value: number; percent?: boolean; className?: string }) {
  return (
    <span className={cn('font-mono tabular-nums', value >= 0 ? 'text-success' : 'text-danger', className)}>
      {value >= 0 ? '+' : ''}{percent ? `${value.toFixed(2)}%` : `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
    </span>
  )
}
