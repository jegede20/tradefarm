'use client'

import { useEffect, useState } from 'react'
import { isAddress, parseUnits, type Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { ROUTER_ABI, ROUTER_ADDRESS } from '@/lib/contracts'

export function useTokenQuote(token: string, amount: string, isBuy: boolean) {
  const publicClient = usePublicClient()
  const [quote, setQuote] = useState<bigint | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    if (!publicClient || !isAddress(token) || !amount || Number(amount) <= 0) {
      setQuote(null)
      setIsLoading(false)
      return
    }

    const timer = window.setTimeout(async () => {
      setIsLoading(true)
      try {
        const amountIn = parseUnits(amount, isBuy ? 6 : 18)
        const result = await publicClient.readContract({
          address: ROUTER_ADDRESS,
          abi: ROUTER_ABI,
          functionName: 'getAmountOut',
          args: [token as Address, amountIn, isBuy],
        })
        setQuote(result)
      } catch (cause) {
        setQuote(null)
        setError(cause instanceof Error ? cause.message : 'Quote unavailable')
      } finally {
        setIsLoading(false)
      }
    }, 500)

    return () => window.clearTimeout(timer)
  }, [amount, isBuy, publicClient, token])

  return { quote, isLoading, error }
}
