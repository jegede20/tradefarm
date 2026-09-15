'use client'

import { useCallback, useState } from 'react'
import {
  concatHex,
  encodeAbiParameters,
  formatUnits,
  getAddress,
  keccak256,
  maxUint256,
  parseAbiParameters,
  parseUnits,
  toHex,
  type Address,
  type Hash,
} from 'viem'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { BUY_SELECTOR, ERC20_ABI, ROUTER_ADDRESS, SELL_SELECTOR, USDC_ADDRESS } from '@/lib/contracts'
import { friendlyContractError, getPairQuote } from '@/lib/flipt'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import type { TxState } from '@/types/trading'

interface ExecuteArgs {
  token: string
  symbol: string
  amount: string
  slippagePct: number
  expectedOut?: bigint | null
}

const tradeParameters = parseAbiParameters('address token, uint256 amountIn, uint256 amountOutMin')

function encodeConfirmedRouterCall(selector: `0x${string}`, token: Address, amountIn: bigint, amountOutMin: bigint) {
  // Pool buys use Flipt's observed low-level selector; parameters remain the
  // standard (token, amountIn, amountOutMin) tuple used by both trade paths.
  return concatHex([selector, encodeAbiParameters(tradeParameters, [token, amountIn, amountOutMin])])
}

export function useExecuteTrade() {
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const [status, setStatus] = useState<TxState>('idle')
  const [hash, setHash] = useState<Hash | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [receiptBlock, setReceiptBlock] = useState<bigint | null>(null)
  const upsertPosition = useTradeFarmStore((state) => state.upsertPosition)
  const reducePosition = useTradeFarmStore((state) => state.reducePosition)
  const addTradeHistory = useTradeFarmStore((state) => state.addTradeHistory)

  const assertReady = useCallback(() => {
    if (!address || !walletClient || !publicClient) throw new Error('Connect a wallet to trade')
    if (chainId !== 5042002) throw new Error('Switch your wallet to Arc Testnet')
    return { address, walletClient, publicClient }
  }, [address, chainId, publicClient, walletClient])

  const executeBuy = useCallback(async ({ token, symbol, amount, slippagePct, expectedOut }: ExecuteArgs) => {
    setError(null)
    setHash(null)
    setReceiptBlock(null)
    try {
      const client = assertReady()
      const tokenAddress = getAddress(token)
      const amountIn = parseUnits(amount, 6)
      if (amountIn <= 0n) throw new Error('Enter a valid USDC amount')

      const market = useTradeFarmStore.getState().tokens.find((item) => item.address.toLowerCase() === tokenAddress.toLowerCase())
      if (!market?.pair) throw new Error('No graduated Flipt pool found for this token')
      const quotedOut = expectedOut ?? await getPairQuote(client.publicClient, tokenAddress, market.pair, amountIn, true)
      const bps = BigInt(Math.max(0, 10_000 - Math.round(slippagePct * 100)))
      const minOut = (quotedOut * bps) / 10_000n

      const allowance = await client.publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [client.address, ROUTER_ADDRESS],
      })

      if (allowance < amountIn) {
        setStatus('approving')
        const approvalHash = await client.walletClient.writeContract({
          account: client.address,
          chain: client.walletClient.chain,
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ROUTER_ADDRESS, maxUint256],
        })
        setHash(approvalHash)
        const approvalReceipt = await client.publicClient.waitForTransactionReceipt({ hash: approvalHash })
        if (approvalReceipt.status !== 'success') throw new Error('USDC approval reverted')
      }

      const tokenBalanceBefore = await client.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [client.address],
      })

      setStatus('pending')
      const swapHash = await client.walletClient.sendTransaction({
        account: client.address,
        chain: client.walletClient.chain,
        to: ROUTER_ADDRESS,
        data: encodeConfirmedRouterCall(BUY_SELECTOR, tokenAddress, amountIn, minOut),
      })
      setHash(swapHash)
      const receipt = await client.publicClient.waitForTransactionReceipt({ hash: swapHash })
      if (receipt.status !== 'success') throw new Error('swap() reverted')

      const transferTopic = keccak256(toHex('Transfer(address,address,uint256)'))
      const transferLogs = receipt.logs.filter((log) => log.topics[0]?.toLowerCase() === transferTopic.toLowerCase())
      if (transferLogs.length !== 4) {
        throw new Error(`Receipt integrity check failed: expected 4 Transfer logs, received ${transferLogs.length}`)
      }

      const tokenBalanceAfter = await client.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [client.address],
      })
      const actualOut = tokenBalanceAfter - tokenBalanceBefore
      if (actualOut <= 0n) throw new Error('Receipt confirmed, but no purchased tokens reached the connected wallet')
      const tokenAmount = Number(formatUnits(actualOut, 18))
      const usdcAmount = Number(formatUnits(amountIn, 6))
      const price = tokenAmount > 0 ? usdcAmount / tokenAmount : 0
      upsertPosition({
        token: tokenAddress,
        symbol,
        amount: tokenAmount,
        entryPrice: price,
        currentPrice: price,
        entryUSDC: usdcAmount,
        openedAt: Date.now(),
      })
      addTradeHistory({
        id: swapHash,
        timestamp: Date.now(),
        type: 'BUY',
        token: tokenAddress,
        symbol,
        amountIn: formatUnits(amountIn, 6),
        amountOut: formatUnits(actualOut, 18),
        price,
        hash: swapHash,
      })
      setReceiptBlock(receipt.blockNumber)
      setStatus('success')
      return { hash: swapHash, receipt, amountOut: actualOut, quotedOut, transferLogs: transferLogs.length }
    } catch (cause) {
      const message = friendlyContractError(cause)
      setError(message)
      setStatus('failed')
      throw cause
    }
  }, [addTradeHistory, assertReady, upsertPosition])

  const executeSell = useCallback(async ({ token, symbol, amount, slippagePct, expectedOut }: ExecuteArgs) => {
    setError(null)
    setHash(null)
    setReceiptBlock(null)
    try {
      const client = assertReady()
      const tokenAddress = getAddress(token)
      const amountIn = parseUnits(amount, 18)
      if (amountIn <= 0n) throw new Error('Enter a valid token amount')

      const market = useTradeFarmStore.getState().tokens.find((item) => item.address.toLowerCase() === tokenAddress.toLowerCase())
      if (!market?.pair) throw new Error('No graduated Flipt pool found for this token')
      const quotedOut = expectedOut ?? await getPairQuote(client.publicClient, tokenAddress, market.pair, amountIn, false)
      const bps = BigInt(Math.max(0, 10_000 - Math.round(slippagePct * 100)))
      const minOut = (quotedOut * bps) / 10_000n

      const allowance = await client.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [client.address, ROUTER_ADDRESS],
      })
      if (allowance < amountIn) {
        setStatus('approving')
        const approvalHash = await client.walletClient.writeContract({
          account: client.address,
          chain: client.walletClient.chain,
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ROUTER_ADDRESS, maxUint256],
        })
        setHash(approvalHash)
        const approvalReceipt = await client.publicClient.waitForTransactionReceipt({ hash: approvalHash })
        if (approvalReceipt.status !== 'success') throw new Error('Token approval reverted')
      }

      const usdcBalanceBefore = await client.publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [client.address],
      })

      setStatus('pending')
      const sellHash = await client.walletClient.sendTransaction({
        account: client.address,
        chain: client.walletClient.chain,
        to: ROUTER_ADDRESS,
        data: encodeConfirmedRouterCall(SELL_SELECTOR, tokenAddress, amountIn, minOut),
      })
      setHash(sellHash)
      const receipt = await client.publicClient.waitForTransactionReceipt({ hash: sellHash })
      if (receipt.status !== 'success') throw new Error('sell() reverted')

      const usdcBalanceAfter = await client.publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [client.address],
      })
      const actualOut = usdcBalanceAfter > usdcBalanceBefore ? usdcBalanceAfter - usdcBalanceBefore : quotedOut
      const tokenAmount = Number(formatUnits(amountIn, 18))
      const usdcAmount = Number(formatUnits(actualOut, 6))
      reducePosition(tokenAddress, tokenAmount)
      addTradeHistory({
        id: sellHash,
        timestamp: Date.now(),
        type: 'SELL',
        token: tokenAddress,
        symbol,
        amountIn: formatUnits(amountIn, 18),
        amountOut: formatUnits(actualOut, 6),
        price: tokenAmount > 0 ? usdcAmount / tokenAmount : 0,
        hash: sellHash,
      })
      setReceiptBlock(receipt.blockNumber)
      setStatus('success')
      return { hash: sellHash, receipt, amountOut: actualOut, quotedOut }
    } catch (cause) {
      const message = friendlyContractError(cause)
      setError(message)
      setStatus('failed')
      throw cause
    }
  }, [addTradeHistory, assertReady, reducePosition])

  const reset = useCallback(() => {
    setStatus('idle')
    setHash(null)
    setError(null)
    setReceiptBlock(null)
  }, [])

  return { executeBuy, executeSell, status, hash, error, receiptBlock, reset }
}
