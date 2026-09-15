'use client'

import { useEffect, useState } from 'react'
import { isAddress, parseUnits, type Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { getPairQuote } from '@/lib/flipt'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'

export function useTokenQuote(token: string, amount: string, isBuy: boolean) {
  const publicClient = usePublicClient()
  const market = useTradeFarmStore((state) => state.tokens.find((item) => item.address.toLowerCase() === token.toLowerCase()))
  const [quote, setQuote] = useState<bigint | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    if (!publicClient || !market?.pair || !isAddress(token) || !amount || Number(amount) <= 0) {
      setQuote(null)
      setIsLoading(false)
      return
    }

    const timer = window.setTimeout(async () => {
      setIsLoading(true)
      try {
        const amountIn = parseUnits(amount, isBuy ? 6 : 18)
        const result = await getPairQuote(publicClient, token as Address, market.pair, amountIn, isBuy)
        setQuote(result)
      } catch (cause) {
        setQuote(null)
        setError(cause instanceof Error ? cause.message.split('\n')[0] : 'Quote unavailable')
      } finally {
        setIsLoading(false)
      }
    }, 500)

    return () => window.clearTimeout(timer)
  }, [amount, isBuy, market?.pair, publicClient, token])

  return { quote, isLoading, error }
}
