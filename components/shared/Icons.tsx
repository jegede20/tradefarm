import type { SVGProps } from 'react'

export type IconName = 'copy' | 'external' | 'wallet' | 'chevron' | 'pin' | 'bot' | 'refresh' | 'trash' | 'check' | 'x' | 'spinner' | 'chart' | 'search' | 'arrowUp' | 'arrowDown' | 'power'

const paths: Record<IconName, React.ReactNode> = {
  copy: <><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4"/></>,
  external: <><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></>,
  wallet: <><path d="M20 7V6a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v10H5a3 3 0 0 1-3-3V7"/><path d="M16 14h.01"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  pin: <><path d="M12 17v5"/><path d="M5 17h14"/><path d="m7 17 1-7-3-3V5h14v2l-3 3 1 7"/></>,
  bot: <><rect x="4" y="7" width="16" height="12" rx="2"/><path d="M9 12h.01M15 12h.01M8 16h8M12 7V3M9 3h6"/></>,
  refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 11M5.5 15A7 7 0 0 0 18 17.5l2-4.5"/></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  x: <><path d="m6 6 12 12M18 6 6 18"/></>,
  spinner: <path d="M21 12a9 9 0 1 1-6.22-8.56"/>,
  chart: <><path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 5-7"/></>,
  search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>,
  arrowUp: <><path d="m18 15-6-6-6 6"/></>,
  arrowDown: <><path d="m6 9 6 6 6-6"/></>,
  power: <><path d="M12 2v10"/><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/></>,
}

export function Icon({ name, className, ...props }: { name: IconName; className?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className ?? 'h-4 w-4'} aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  )
}
