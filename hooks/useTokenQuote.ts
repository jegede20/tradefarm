'use client'

import { useEffect, useState } from 'react'
import { isAddress, parseUnits, type Address } from 'viem'
import { useAccount, usePublicClient } from 'wagmi'
import { getPairQuote } from '@/lib/flipt'
import { resolveStoredMarket } from '@/lib/marketResolver'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'

export function useTokenQuote(token: string, amount: string, isBuy: boolean) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const market = useTradeFarmStore((state) => state.tokens.find((item) => item.address.toLowerCase() === token.toLowerCase()))
  const [quote, setQuote] = useState<bigint | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    if (!publicClient || !isAddress(token) || !amount || Number(amount) <= 0) {
      setQuote(null)
      setIsLoading(false)
      return
    }

    const timer = window.setTimeout(async () => {
      setIsLoading(true)
      try {
        const resolvedMarket = market?.pair ? market : await resolveStoredMarket(publicClient, token, address)
        const amountIn = parseUnits(amount, isBuy ? 6 : 18)
        const result = await getPairQuote(publicClient, token as Address, resolvedMarket.pair, amountIn, isBuy)
        if (!cancelled) setQuote(result)
      } catch (cause) {
        if (!cancelled) {
          setQuote(null)
          setError(cause instanceof Error ? cause.message.split('\n')[0] : 'Quote unavailable')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }, 500)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [address, amount, isBuy, market, publicClient, token])

  return { quote, isLoading, error }
}
