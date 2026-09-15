'use client'

import { useEffect, useMemo, useRef } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { useAccount, usePublicClient } from 'wagmi'
import { ERC20_ABI } from '@/lib/contracts'
import { resolveStoredMarket } from '@/lib/marketResolver'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import type { BotPosition, Position } from '@/types/trading'

function trackedRaw(position: Position | BotPosition) {
  return position.amountRaw ? BigInt(position.amountRaw) : parseUnits(position.amount.toFixed(18), 18)
}

function belongsToWallet(position: Position | BotPosition, wallet: string) {
  return !position.wallet || position.wallet.toLowerCase() === wallet.toLowerCase()
}

export function usePositionReconciliation() {
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient()
  const positions = useTradeFarmStore((state) => state.positions)
  const botPosition = useTradeFarmStore((state) => state.botPosition)
  const pendingSell = useTradeFarmStore((state) => state.pendingSell)
  const reconciling = useRef(false)

  const trackedKey = useMemo(() => [
    ...positions.map((position) => `${position.wallet ?? 'legacy'}:${position.token}:${position.amountRaw ?? position.amount}`),
    botPosition ? `${botPosition.wallet ?? 'legacy'}:${botPosition.token}:${botPosition.amountRaw}` : '',
    pendingSell ? `selling:${pendingSell.wallet}:${pendingSell.token}` : '',
  ].join('|'), [botPosition, pendingSell, positions])

  useEffect(() => {
    if (!address || chainId !== 5042002 || !publicClient) return
    useTradeFarmStore.getState().claimLegacyWalletData(address)
    let stopped = false

    const reconcile = async () => {
      if (stopped || reconciling.current) return
      reconciling.current = true
      try {
        const state = useTradeFarmStore.getState()
        const pending = state.pendingSell
        const isPendingSettlement = (position: Position | BotPosition) => Boolean(
          pending
          && pending.wallet.toLowerCase() === address.toLowerCase()
          && pending.token.toLowerCase() === position.token.toLowerCase(),
        )
        // A submitted TradeFarm sell owns reconciliation until its receipt is
        // processed. This prevents the balance poller from clearing state and
        // logging a close before executeSell has verified the receipt.
        const tracked = [
          ...state.positions.filter((position) => belongsToWallet(position, address) && !isPendingSettlement(position)),
          ...(state.botPosition && belongsToWallet(state.botPosition, address) && !isPendingSettlement(state.botPosition) ? [state.botPosition] : []),
        ]
        const tokens = [...new Set(tracked.map((position) => position.token.toLowerCase()))]
        await Promise.all(tokens.map(async (token) => {
          const matching = tracked.filter((position) => position.token.toLowerCase() === token)
          const reference = matching.reduce((largest, position) => trackedRaw(position) > trackedRaw(largest) ? position : largest)
          const balance = await publicClient.readContract({
            address: reference.token,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address],
          })
          if (stopped) return
          const pendingNow = useTradeFarmStore.getState().pendingSell
          if (pendingNow
            && pendingNow.wallet.toLowerCase() === address.toLowerCase()
            && pendingNow.token.toLowerCase() === token) return
          const raw = trackedRaw(reference)
          const amount = Number(formatUnits(balance, 18))
          const isDust = balance === 0n || balance * 1_000_000n <= raw || amount * reference.currentPrice < 0.01
          const hadBotPosition = Boolean(state.botPosition?.token.toLowerCase() === token && belongsToWallet(state.botPosition, address))
          let pair = reference.pair
          if (!isDust) {
            const market = await resolveStoredMarket(publicClient, reference.token, address).catch(() => null)
            pair = market?.pair ?? pair
          }
          state.reconcileTokenBalance(reference.token, balance.toString(), address, pair)
          if (hadBotPosition && isDust) {
            state.addBotLog('INFO', `${reference.symbol} is closed on-chain. Removed the stale bot position${balance > 0n ? ' and ignored residual dust' : ''}.`)
          }
        }))
      } catch {
        // The next interval retries without replacing the last verified state.
      } finally {
        reconciling.current = false
      }
    }

    void reconcile()
    const timer = window.setInterval(() => { void reconcile() }, 15_000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [address, chainId, publicClient, trackedKey])
}
