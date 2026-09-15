'use client'

import { formatUnits } from 'viem'
import { useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain } from 'wagmi'
import { arcTestnet } from '@/lib/chains'
import { ERC20_ABI, USDC_ADDRESS } from '@/lib/contracts'
import { truncateAddress } from '@/lib/formatters'
import { NavLinks } from './NavLinks'
import { Icon } from '@/components/shared/Icons'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'

export function Topbar() {
  const { address, isConnected, chainId } = useAccount()
  const { connectors, connect, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const networkConnected = useTradeFarmStore((state) => state.networkConnected)
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 4_000 },
  })

  const handleWallet = () => {
    if (isConnected) {
      if (chainId !== arcTestnet.id) switchChain({ chainId: arcTestnet.id })
      else disconnect()
      return
    }
    const connector = connectors[0]
    if (connector) connect({ connector, chainId: arcTestnet.id })
  }

  const balance = usdcBalance === undefined
    ? '—'
    : Number(formatUnits(usdcBalance, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-14 border-b border-border bg-bg-primary/95 backdrop-blur-xl">
      <div className="grid h-full grid-cols-[1fr_auto] items-center px-3 lg:grid-cols-[1fr_auto_1fr] lg:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-accent-primary text-[11px] font-black text-white shadow-[0_0_16px_var(--accent-glow)]">T</span>
            <span className="text-sm font-bold tracking-[-0.02em] sm:text-base">TradeFarm</span>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-bg-surface px-2 py-1 text-[9px] font-medium uppercase tracking-wider text-text-secondary sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${networkConnected ? 'bg-success shadow-[0_0_6px_var(--success)]' : 'bg-warning'}`} />
            Arc Testnet
          </span>
        </div>

        <div className="order-3 col-span-2 mx-auto hidden h-full md:block lg:order-none lg:col-span-1">
          <NavLinks />
        </div>

        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <div className="hidden text-right sm:block">
            <p className="font-mono text-xs font-medium text-text-primary">{balance} <span className="text-text-secondary">USDC</span></p>
            <p className="text-[9px] uppercase tracking-wider text-text-secondary">Trading balance</p>
          </div>
          <button
            type="button"
            onClick={handleWallet}
            disabled={isConnecting || isSwitching}
            className="flex h-9 items-center gap-2 rounded-md border border-accent-primary/70 bg-accent-primary/10 px-3 text-xs font-semibold text-text-primary transition hover:bg-accent-primary/20 disabled:opacity-50"
            title={isConnected && chainId === arcTestnet.id ? 'Disconnect wallet' : undefined}
          >
            <Icon name="wallet" className="h-3.5 w-3.5 text-[#a78bfa]" />
            <span className="font-mono">
              {isConnecting ? 'CONNECTING…' : isSwitching ? 'SWITCHING…' : isConnected && chainId !== arcTestnet.id ? 'SWITCH NETWORK' : isConnected ? truncateAddress(address) : 'CONNECT WALLET'}
            </span>
          </button>
        </div>
      </div>
      <div className="fixed left-0 right-0 top-14 h-10 border-b border-border bg-bg-primary md:hidden">
        <div className="flex h-full justify-center"><NavLinks /></div>
      </div>
    </header>
  )
}
