import { formatEther, formatUnits } from 'viem'

export function formatUsdc(value: bigint, maximumFractionDigits = 2) {
  return Number(formatUnits(value, 6)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  })
}

export function formatToken(value: bigint, maximumFractionDigits = 4) {
  return Number(formatUnits(value, 18)).toLocaleString('en-US', {
    maximumFractionDigits,
  })
}

export function formatNative(value: bigint, maximumFractionDigits = 4) {
  return Number(formatEther(value)).toLocaleString('en-US', {
    maximumFractionDigits,
  })
}

export function formatPrice(value: number) {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '$0.00'
  if (value < 0.000001) return `$${value.toExponential(3)}`
  if (value < 0.01) return `$${value.toFixed(6)}`
  if (value < 1) return `$${value.toFixed(4)}`
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)
}

export function truncateAddress(address?: string, head = 6, tail = 4) {
  if (!address) return '—'
  return `${address.slice(0, head)}…${address.slice(-tail)}`
}

export function formatTime(timestamp: number, withSeconds = true) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(timestamp)
}

export function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(timestamp)
}
