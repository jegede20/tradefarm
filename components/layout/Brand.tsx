export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="TradeFarm">
      <svg viewBox="0 0 36 28" className="h-7 w-9" role="img" aria-hidden="true">
        <path d="M3 5.5h12.5l4 4H33" fill="none" stroke="#f5f5f7" strokeWidth="2.6" strokeLinecap="square" />
        <path d="M3 14h7.5l4 4H33" fill="none" stroke="#8b5cf6" strokeWidth="2.6" strokeLinecap="square" />
        <path d="M3 22.5h15l4-4H33" fill="none" stroke="#22c55e" strokeWidth="2.6" strokeLinecap="square" />
        <path d="M3 4v20" fill="none" stroke="#8b5cf6" strokeWidth="2.6" strokeLinecap="square" />
      </svg>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-[-0.035em] text-text-primary">
          Trade<span className="text-text-secondary">Farm</span>
        </span>
      )}
    </span>
  )
}
