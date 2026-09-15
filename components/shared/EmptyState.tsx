import { Icon } from './Icons'

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
      <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg-elevated text-text-secondary"><Icon name="chart" className="h-4 w-4" /></span>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-text-secondary">{description}</p>
    </div>
  )
}
