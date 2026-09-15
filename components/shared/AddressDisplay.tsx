'use client'

import { useState } from 'react'
import { truncateAddress } from '@/lib/formatters'
import { Icon } from './Icons'
import { cn } from '@/lib/utils'

export function AddressDisplay({ address, explorer = false, className }: { address: string; explorer?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_400)
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-xs text-text-secondary', className)}>
      <span>{truncateAddress(address)}</span>
      <button type="button" onClick={copy} className="rounded p-0.5 transition hover:bg-bg-elevated hover:text-text-primary" aria-label="Copy address">
        <Icon name={copied ? 'check' : 'copy'} className={cn('h-3 w-3', copied && 'text-success')} />
      </button>
      {explorer && (
        <a href={`https://testnet.arcscan.app/address/${address}`} target="_blank" rel="noreferrer" className="rounded p-0.5 transition hover:bg-bg-elevated hover:text-text-primary" aria-label="View on Arcscan">
          <Icon name="external" className="h-3 w-3" />
        </a>
      )}
    </span>
  )
}
