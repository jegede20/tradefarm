'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatUnits, type Address } from 'viem'
import { useAccount, useReadContract } from 'wagmi'
import { ERC20_ABI, USDC_ADDRESS } from '@/lib/contracts'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { useTokenQuote } from '@/hooks/useTokenQuote'
import { useExecuteTrade } from '@/hooks/useExecuteTrade'
import { cn } from '@/lib/utils'
import { TxStatus } from '@/components/shared/TxStatus'

const quickPercents = [25, 50, 75, 100]
const slippagePresets = [0.5, 1, 2]

export function TradeBox() {
  const { address, isConnected } = useAccount()
  const token = useTradeFarmStore((state) => state.tokens.find((item) => item.address === state.selectedToken) ?? state.tokens[0])
  const localPosition = useTradeFarmStore((state) => state.positions.find((position) => position.token === state.selectedToken))
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(1.5)
  const [customSlippage, setCustomSlippage] = useState(true)
  const { executeBuy, executeSell, status, hash, error, reset } = useExecuteTrade()

  const { data: usdcRaw } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 3_000 },
  })
  const { data: tokenRaw } = useReadContract({
    address: token?.address as Address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && token), refetchInterval: 3_000 },
  })

  const usdcBalance = usdcRaw === undefined ? 0 : Number(formatUnits(usdcRaw, 6))
  const tokenBalance = tokenRaw === undefined ? (localPosition?.amount ?? 0) : Number(formatUnits(tokenRaw, 18))
  const { quote, isLoading: quoteLoading } = useTokenQuote(token?.address ?? '', amount, side === 'buy')

  const quoteDisplay = useMemo(() => {
    if (!quote) return null
    return side === 'buy'
      ? `${Number(formatUnits(quote, 18)).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${token?.symbol}`
      : `${Number(formatUnits(quote, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDC`
  }, [quote, side, token?.symbol])

  const priceImpact = useMemo(() => {
    const numeric = Number(amount)
    if (!token || !Number.isFinite(numeric) || numeric <= 0) return 0
    return side === 'buy' ? (numeric / token.reserve) * 100 : (numeric / token.supply) * 100
  }, [amount, side, token])

  useEffect(() => { setAmount(''); reset() }, [reset, side, token?.address])

  if (!token) return null
  const busy = status === 'approving' || status === 'pending'

  const setQuickAmount = (percent: number) => {
    const balance = side === 'buy' ? usdcBalance : tokenBalance
    const value = balance * (percent / 100)
    setAmount(value > 0 ? value.toFixed(side === 'buy' ? 2 : 6).replace(/\.?0+$/, '') : '')
  }

  const submit = async () => {
    if (!amount) return
    try {
      if (side === 'buy') await executeBuy({ token: token.address, symbol: token.symbol, amount, slippagePct: slippage, expectedOut: quote })
      else await executeSell({ token: token.address, symbol: token.symbol, amount, slippagePct: slippage, expectedOut: quote })
      setAmount('')
    } catch {
      // The transaction state is surfaced by TxStatus.
    }
  }

  return (
    <div className="p-3">
      <div className="grid grid-cols-2 rounded-md bg-bg-primary p-1">
        {(['buy', 'sell'] as const).map((item) => (
          <button key={item} type="button" onClick={() => setSide(item)} className={cn('h-9 rounded text-xs font-semibold uppercase tracking-wider transition', side === item ? item === 'buy' ? 'bg-success/15 text-success shadow-sm' : 'bg-danger/15 text-danger shadow-sm' : 'text-text-secondary hover:text-text-primary')}>
            {item}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <label htmlFor="trade-amount" className="data-label">You pay</label>
        <span className="font-mono text-[9px] text-text-secondary">Balance: {(side === 'buy' ? usdcBalance : tokenBalance).toLocaleString('en-US', { maximumFractionDigits: 4 })} {side === 'buy' ? 'USDC' : token.symbol}</span>
      </div>
      <div className="relative mt-1.5">
        <input
          id="trade-amount"
          type="number"
          inputMode="decimal"
          min="0"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
          className="input-terminal h-14 pr-16 text-lg"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] font-semibold text-text-secondary">{side === 'buy' ? 'USDC' : token.symbol}</span>
      </div>

      {side === 'sell' && (
        <input
          type="range"
          min="0"
          max="100"
          value={tokenBalance > 0 ? Math.min((Number(amount) / tokenBalance) * 100, 100) || 0 : 0}
          onChange={(event) => setQuickAmount(Number(event.target.value))}
          className="mt-3 h-1 w-full cursor-pointer"
          aria-label="Sell percentage"
        />
      )}

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {quickPercents.map((percent) => (
          <button key={percent} type="button" onClick={() => setQuickAmount(percent)} className="button-secondary h-7 font-mono text-[9px]">
            {percent === 100 && side === 'buy' ? 'MAX' : `${percent}%`}
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-10 rounded-md border border-border/70 bg-bg-primary px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="data-label">Estimated output</span>
          <span className={cn('font-mono text-[10px]', quoteDisplay ? 'text-text-primary' : 'text-text-secondary')}>
            {quoteLoading ? 'QUOTING…' : quoteDisplay ? `≈ ${quoteDisplay}` : '—'}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="data-label">Price impact</span>
          <span className={cn('font-mono text-[9px]', priceImpact > 5 ? 'text-warning' : 'text-text-secondary')}>{priceImpact.toFixed(2)}%</span>
        </div>
      </div>

      {priceImpact > 5 && <p className="mt-2 rounded border border-warning/20 bg-warning/5 px-2 py-1.5 font-mono text-[9px] text-warning">High price impact. Consider reducing trade size.</p>}

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="data-label">Slippage tolerance</span>
          <span className="font-mono text-[10px] text-text-primary">{slippage.toFixed(1)}%</span>
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {slippagePresets.map((preset) => (
            <button key={preset} type="button" onClick={() => { setSlippage(preset); setCustomSlippage(false) }} className={cn('h-7 rounded border font-mono text-[9px] transition', !customSlippage && slippage === preset ? 'border-accent-primary bg-accent-primary/15 text-[#c4b5fd]' : 'border-border bg-bg-elevated text-text-secondary hover:text-text-primary')}>{preset}%</button>
          ))}
          <button type="button" onClick={() => setCustomSlippage(true)} className={cn('h-7 rounded border font-mono text-[9px] transition', customSlippage ? 'border-accent-primary bg-accent-primary/15 text-[#c4b5fd]' : 'border-border bg-bg-elevated text-text-secondary')}>CUSTOM</button>
        </div>
        {customSlippage && (
          <div className="relative mt-2">
            <input type="number" min="0.1" max="10" step="0.1" value={slippage} onChange={(event) => setSlippage(Math.min(10, Math.max(0.1, Number(event.target.value))))} className="input-terminal h-8 pr-7 text-xs" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-text-secondary">%</span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!isConnected || !amount || Number(amount) <= 0 || busy}
        className={cn('mt-5 h-11 w-full rounded-md text-xs font-bold uppercase tracking-[0.12em] text-white transition disabled:cursor-not-allowed disabled:opacity-40', side === 'buy' ? 'bg-success hover:bg-green-400' : 'bg-danger hover:bg-red-400')}
      >
        {busy ? status === 'approving' ? 'Approving…' : 'Confirming…' : !isConnected ? 'Connect wallet to trade' : `${side} ${token.symbol}`}
      </button>

      <TxStatus status={status} hash={hash} error={error} />
      <div className="mt-3 flex items-center justify-between font-mono text-[8px] uppercase tracking-wider text-text-secondary/70">
        <span>Fee 0.05%</span><span>Arc · 5042002</span>
      </div>
    </div>
  )
}
