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
  parseEventLogs,
  parseUnits,
  toHex,
  type Address,
  type Hash,
  type PublicClient,
} from 'viem'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { getAccount } from '@wagmi/core'
import { BUY_SELECTOR, ERC20_ABI, ROUTER_ADDRESS, SELL_SELECTOR, USDC_ADDRESS } from '@/lib/contracts'
import { friendlyContractError, getPairQuote } from '@/lib/flipt'
import { resolveStoredMarket } from '@/lib/marketResolver'
import { wagmiConfig } from '@/lib/wagmiConfig'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import type { TxState } from '@/types/trading'

interface ExecuteArgs {
  token: string
  symbol: string
  amount: string
  slippagePct: number
  expectedOut?: bigint | null
  shouldSubmit?: () => boolean
}

const tradeParameters = parseAbiParameters('address token, uint256 amountIn, uint256 amountOutMin')

function encodeConfirmedRouterCall(selector: `0x${string}`, token: Address, amountIn: bigint, amountOutMin: bigint) {
  // Pool buys use Flipt's observed low-level selector; parameters remain the
  // standard (token, amountIn, amountOutMin) tuple used by both trade paths.
  return concatHex([selector, encodeAbiParameters(tradeParameters, [token, amountIn, amountOutMin])])
}

function assertSubmissionAllowed(shouldSubmit?: () => boolean) {
  if (shouldSubmit && !shouldSubmit()) throw new Error('Bot session stopped before submission. Trade cancelled.')
}

function assertWalletUnchanged(expected: Address) {
  const live = getAccount(wagmiConfig)
  if (!live.address || live.address.toLowerCase() !== expected.toLowerCase()) throw new Error('Wallet changed before submission. Trade cancelled.')
  if (live.chainId !== 5042002) throw new Error('Wallet left Arc Testnet before submission. Trade cancelled.')
}

async function waitForConfirmedReceipt(client: PublicClient, hash: Hash) {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await client.waitForTransactionReceipt({ hash, timeout: 4_000 })
    } catch (cause) {
      lastError = cause
      const message = cause instanceof Error ? cause.message : String(cause)
      if (!/http request failed|failed to fetch|fetch failed|network error|timeout|timed out|socket|429|rate.?limit|econn/i.test(message) || attempt === 3) throw cause
      await new Promise((resolve) => window.setTimeout(resolve, 400 * 2 ** attempt))
    }
  }
  throw lastError
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
  const settlePositionSell = useTradeFarmStore((state) => state.settlePositionSell)
  const setPendingSell = useTradeFarmStore((state) => state.setPendingSell)
  const addTradeHistory = useTradeFarmStore((state) => state.addTradeHistory)

  const assertReady = useCallback(() => {
    if (!address || !walletClient || !publicClient) throw new Error('Connect a wallet to trade')
    if (chainId !== 5042002) throw new Error('Switch your wallet to Arc Testnet')
    return { address, walletClient, publicClient }
  }, [address, chainId, publicClient, walletClient])

  const executeBuy = useCallback(async ({ token, symbol, amount, slippagePct, expectedOut, shouldSubmit }: ExecuteArgs) => {
    setError(null)
    setHash(null)
    setReceiptBlock(null)
    try {
      const client = assertReady()
      const tokenAddress = getAddress(token)
      const amountIn = parseUnits(amount, 6)
      if (amountIn <= 0n) throw new Error('Enter a valid USDC amount')

      const market = await resolveStoredMarket(client.publicClient, tokenAddress, client.address)
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
        assertSubmissionAllowed(shouldSubmit)
        assertWalletUnchanged(client.address)
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
        const approvalReceipt = await waitForConfirmedReceipt(client.publicClient, approvalHash)
        if (approvalReceipt.status !== 'success') throw new Error('USDC approval reverted')
      }

      assertSubmissionAllowed(shouldSubmit)
      assertWalletUnchanged(client.address)
      setStatus('pending')
      const swapHash = await client.walletClient.sendTransaction({
        account: client.address,
        chain: client.walletClient.chain,
        to: ROUTER_ADDRESS,
        data: encodeConfirmedRouterCall(BUY_SELECTOR, tokenAddress, amountIn, minOut),
      })
      setHash(swapHash)
      const receipt = await waitForConfirmedReceipt(client.publicClient, swapHash)
      if (receipt.status !== 'success') throw new Error('swap() reverted')

      const transferTopic = keccak256(toHex('Transfer(address,address,uint256)'))
      const transferLogs = receipt.logs.filter((log) => log.topics[0]?.toLowerCase() === transferTopic.toLowerCase())
      if (transferLogs.length !== 4) {
        throw new Error(`Receipt integrity check failed: expected 4 Transfer logs, received ${transferLogs.length}`)
      }

      const parsedTransfers = parseEventLogs({ abi: ERC20_ABI, eventName: 'Transfer', logs: receipt.logs, strict: false })
      const actualOut = parsedTransfers
        .filter((log) => log.address.toLowerCase() === tokenAddress.toLowerCase() && log.args.to?.toLowerCase() === client.address.toLowerCase())
        .reduce((total, log) => total + (log.args.value ?? 0n), 0n)
      if (actualOut <= 0n) throw new Error('Receipt confirmed, but no purchased tokens reached the connected wallet')
      const tokenAmount = Number(formatUnits(actualOut, 18))
      const usdcAmount = Number(formatUnits(amountIn, 6))
      const price = tokenAmount > 0 ? usdcAmount / tokenAmount : 0
      upsertPosition({
        token: tokenAddress,
        pair: market.pair,
        wallet: client.address,
        symbol,
        amount: tokenAmount,
        amountRaw: actualOut.toString(),
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
        wallet: client.address,
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

  const executeSell = useCallback(async ({ token, symbol, amount, slippagePct, expectedOut, shouldSubmit }: ExecuteArgs) => {
    setError(null)
    setHash(null)
    setReceiptBlock(null)
    try {
      const client = assertReady()
      const tokenAddress = getAddress(token)
      const amountIn = parseUnits(amount, 18)
      if (amountIn <= 0n) throw new Error('Enter a valid token amount')
      setPendingSell({ token: tokenAddress, wallet: client.address })

      const market = await resolveStoredMarket(client.publicClient, tokenAddress, client.address)
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
        assertSubmissionAllowed(shouldSubmit)
        assertWalletUnchanged(client.address)
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
        const approvalReceipt = await waitForConfirmedReceipt(client.publicClient, approvalHash)
        if (approvalReceipt.status !== 'success') throw new Error('Token approval reverted')
      }

      assertSubmissionAllowed(shouldSubmit)
      assertWalletUnchanged(client.address)
      setStatus('pending')
      const sellHash = await client.walletClient.sendTransaction({
        account: client.address,
        chain: client.walletClient.chain,
        to: ROUTER_ADDRESS,
        data: encodeConfirmedRouterCall(SELL_SELECTOR, tokenAddress, amountIn, minOut),
      })
      setHash(sellHash)
      const receipt = await waitForConfirmedReceipt(client.publicClient, sellHash)
      if (receipt.status !== 'success') throw new Error('sell() reverted')

      const parsedTransfers = parseEventLogs({ abi: ERC20_ABI, eventName: 'Transfer', logs: receipt.logs, strict: false })
      const actualOut = parsedTransfers
        .filter((log) => log.address.toLowerCase() === USDC_ADDRESS.toLowerCase() && log.args.to?.toLowerCase() === client.address.toLowerCase())
        .reduce((total, log) => total + (log.args.value ?? 0n), 0n)
      if (actualOut <= 0n) throw new Error('Receipt confirmed, but no USDC reached the connected wallet')
      const tokenAmount = Number(formatUnits(amountIn, 18))
      const usdcAmount = Number(formatUnits(actualOut, 6))
      settlePositionSell(tokenAddress, amountIn.toString(), client.address)
      addTradeHistory({
        id: sellHash,
        timestamp: Date.now(),
        type: 'SELL',
        token: tokenAddress,
        wallet: client.address,
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
    } finally {
      setPendingSell(null)
    }
  }, [addTradeHistory, assertReady, setPendingSell, settlePositionSell])

  const reset = useCallback(() => {
    setStatus('idle')
    setHash(null)
    setError(null)
    setReceiptBlock(null)
  }, [])

  return { executeBuy, executeSell, status, hash, error, receiptBlock, reset }
}
