'use client'

import { useEffect, useState } from 'react'
import type { Position } from '@/types/trading'
import { useTokenQuote } from '@/hooks/useTokenQuote'
import { useExecuteTrade } from '@/hooks/useExecuteTrade'
import { formatUnits, parseUnits } from 'viem'
import { useAccount, useReadContract } from 'wagmi'
import { ERC20_ABI } from '@/lib/contracts'
import { TokenBadge } from '@/components/shared/TokenBadge'
import { TxStatus } from '@/components/shared/TxStatus'
import { Icon } from '@/components/shared/Icons'

export function QuickSellModal({ position, onClose }: { position: Position; onClose: () => void }) {
  const { address } = useAccount()
  const [percent, setPercent] = useState(100)
  const [slippage, setSlippage] = useState(1.5)
  const { data: tokenRaw } = useReadContract({
    address: position.token,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 3_000 },
  })
  const balanceLoading = Boolean(address && tokenRaw === undefined)
  const availableRaw = tokenRaw ?? parseUnits(position.amount.toFixed(18), 18)
  const amountRaw = availableRaw * BigInt(percent) / 100n
  const amount = formatUnits(amountRaw, 18)
  const available = Number(formatUnits(availableRaw, 18))
  const { quote, isLoading } = useTokenQuote(position.token, amount, false)
  const { executeSell, status, hash, error } = useExecuteTrade()
  const busy = status === 'pending' || status === 'approving'

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [busy, onClose])

  const sell = async () => {
    try { await executeSell({ token: position.token, symbol: position.symbol, amount, slippagePct: slippage, expectedOut: quote }) } catch { /* displayed below */ }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div className="w-full max-w-md rounded-lg border border-border bg-bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2"><TokenBadge symbol={position.symbol} /><div><h2 className="text-sm font-semibold">Sell {position.symbol}</h2><p className="font-mono text-[9px] text-text-secondary">{available.toLocaleString('en-US', { maximumFractionDigits: 6 })} available</p></div></div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded p-1 text-text-secondary hover:bg-bg-elevated hover:text-text-primary"><Icon name="x" className="h-4 w-4" /></button>
        </div>
        <div className="p-5">
          <div className="flex justify-between"><span className="data-label">Amount</span><span className="font-mono text-[10px] text-text-secondary">{percent}%</span></div>
          <div className="mt-2 rounded-md border border-border bg-bg-primary px-3 py-3 font-mono text-sm">{Number(amount).toLocaleString('en-US', { maximumFractionDigits: 6 })} <span className="float-right text-text-secondary">{position.symbol}</span></div>
          <input type="range" min="1" max="100" value={percent} onChange={(event) => setPercent(Number(event.target.value))} className="mt-4 w-full" />
          <div className="mt-2 grid grid-cols-4 gap-2">{[25, 50, 75, 100].map((item) => <button key={item} type="button" onClick={() => setPercent(item)} className={`button-secondary h-7 font-mono text-[9px] ${percent === item ? 'border-accent-primary text-[#c4b5fd]' : ''}`}>{item}%</button>)}</div>
          <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-bg-primary px-3 py-2.5"><span className="data-label">Expected</span><span className="font-mono text-xs">{isLoading ? 'QUOTING…' : quote ? `≈ ${Number(formatUnits(quote, 6)).toLocaleString('en-US', { maximumFractionDigits: 4 })} USDC` : '—'}</span></div>
          <label className="mt-4 block data-label">Slippage %</label>
          <input type="number" min="0.1" max="10" step="0.1" value={slippage} onChange={(event) => setSlippage(Number(event.target.value))} className="input-terminal mt-1.5 h-9" />
          <button type="button" onClick={sell} disabled={busy || balanceLoading || !address || amountRaw === 0n} className="mt-5 h-11 w-full rounded-md bg-danger text-xs font-bold uppercase tracking-wider text-white transition hover:bg-red-400 disabled:opacity-50">{busy ? 'CONFIRMING…' : balanceLoading ? 'READING BALANCE…' : !address ? 'CONNECT WALLET TO SELL' : `SELL ${percent}%`}</button>
          <TxStatus status={status} hash={hash} error={error} />
        </div>
      </div>
    </div>
  )
}
