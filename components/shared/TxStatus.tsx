import type { Hash } from 'viem'
import type { TxState } from '@/types/trading'
import { truncateAddress } from '@/lib/formatters'
import { Icon } from './Icons'
import { cn } from '@/lib/utils'

export function TxStatus({ status, hash, error }: { status: TxState; hash: Hash | null; error: string | null }) {
  if (status === 'idle') return null
  const pending = status === 'approving' || status === 'pending'
  return (
    <div className={cn(
      'mt-3 rounded-md border px-3 py-2.5 text-xs',
      status === 'failed' ? 'border-danger/30 bg-danger/5' : status === 'success' ? 'border-success/30 bg-success/5' : 'border-accent-primary/30 bg-accent-primary/5',
    )}>
      <div className="flex items-center gap-2">
        <Icon
          name={pending ? 'spinner' : status === 'success' ? 'check' : 'x'}
          className={cn('h-3.5 w-3.5 shrink-0', pending && 'animate-spin text-[#a78bfa]', status === 'success' && 'text-success', status === 'failed' && 'text-danger')}
        />
        <span className="font-medium">
          {status === 'approving' ? 'Approval pending' : status === 'pending' ? 'Trade pending' : status === 'success' ? 'Trade confirmed' : 'Transaction failed'}
        </span>
        {hash && (
          <a href={`https://testnet.arcscan.app/tx/${hash}`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 font-mono text-text-secondary hover:text-text-primary">
            {truncateAddress(hash, 7, 5)} <Icon name="external" className="h-3 w-3" />
          </a>
        )}
      </div>
      {error && <p className="mt-2 break-words font-mono text-[10px] leading-relaxed text-danger">{error}</p>}
    </div>
  )
}
