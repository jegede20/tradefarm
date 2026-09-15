'use client'

import { formatEther, formatUnits } from 'viem'
import { useAccount, useBalance, useReadContract } from 'wagmi'
import { ERC20_ABI, USDC_ADDRESS } from '@/lib/contracts'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { PnLDisplay } from '@/components/shared/PnLDisplay'

export function PortfolioHeader() {
  const { address } = useAccount()
  const positions = useTradeFarmStore((state) => state.positions)
  const tokens = useTradeFarmStore((state) => state.tokens)
  const botPosition = useTradeFarmStore((state) => state.botPosition)
  const { data: nativeBalance } = useBalance({ address, query: { enabled: Boolean(address), refetchInterval: 5_000 } })
  const { data: usdcRaw } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 5_000 },
  })

  const usdc = usdcRaw === undefined ? 0 : Number(formatUnits(usdcRaw, 6))
  const positionValue = positions.reduce((total, position) => {
    const trackedQuote = botPosition?.token.toLowerCase() === position.token.toLowerCase() ? botPosition.currentPrice : null
    const live = trackedQuote ?? tokens.find((token) => token.address.toLowerCase() === position.token.toLowerCase())?.price ?? position.currentPrice
    return total + position.amount * live
  }, 0)
  const cost = positions.reduce((total, position) => total + position.entryUSDC, 0)
  const pnl = positionValue - cost
  const totalValue = usdc + positionValue
  const native = nativeBalance ? Number(formatEther(nativeBalance.value)) : 0

  return (
    <section className="panel overflow-hidden rounded-lg p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="panel-title">Total portfolio value</p>
          <p className="mt-2 font-mono text-3xl font-semibold tracking-tight sm:text-4xl">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-text-secondary">Total PnL</span>
            <PnLDisplay value={pnl} />
            {cost > 0 && <PnLDisplay value={(pnl / cost) * 100} percent className="rounded bg-bg-primary px-1.5 py-0.5 text-[10px]" />}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-8 border-l border-border pl-6">
          <div>
            <p className="data-label">USDC balance</p>
            <p className="mt-1.5 font-mono text-sm">{usdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="mt-0.5 text-[9px] text-text-secondary">ERC-20 · 6 decimals</p>
          </div>
          <div>
            <p className="data-label">Native gas</p>
            <p className="mt-1.5 font-mono text-sm">{native.toLocaleString('en-US', { maximumFractionDigits: 4 })}</p>
            <p className="mt-0.5 text-[9px] text-text-secondary">USDC · 18 decimals</p>
          </div>
        </div>
      </div>
    </section>
  )
}
