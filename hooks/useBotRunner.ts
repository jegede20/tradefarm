'use client'

import { useCallback, useEffect, useRef } from 'react'
import { formatUnits, isAddress, parseUnits, type Address } from 'viem'
import { useAccount, usePublicClient } from 'wagmi'
import { ERC20_ABI, ROUTER_ABI, ROUTER_ADDRESS, TOKEN_METADATA_ABI, USDC_ADDRESS } from '@/lib/contracts'
import { scanBestToken } from '@/lib/botLogic'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { useExecuteTrade } from './useExecuteTrade'
import type { LogLevel } from '@/types/trading'

export function useBotRunner() {
  const { address, isConnected, chainId } = useAccount()
  const publicClient = usePublicClient()
  const { executeBuy, executeSell } = useExecuteTrade()
  const intervalRef = useRef<number | null>(null)
  const runningLoop = useRef(false)
  const previousPrices = useRef(new Map<string, number>())
  const cooldownTokens = useRef(new Map<string, number>())
  const mounted = useRef(true)

  const log = useCallback((level: LogLevel, message: string) => {
    useTradeFarmStore.getState().addBotLog(level, message)
  }, [])

  const halt = useCallback((status: 'stopped' | 'error' = 'stopped') => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
    intervalRef.current = null
    runningLoop.current = false
    useTradeFarmStore.getState().setBotNextActionAt(null)
    useTradeFarmStore.getState().setBotStatus(status)
  }, [])

  const getSymbol = useCallback(async (token: Address) => {
    const known = useTradeFarmStore.getState().tokens.find((item) => item.address.toLowerCase() === token.toLowerCase())
    if (known) return known.symbol
    if (!publicClient) return `TKN${token.slice(-3).toUpperCase()}`
    return publicClient.readContract({ address: token, abi: TOKEN_METADATA_ABI, functionName: 'symbol' }).catch(() => `TKN${token.slice(-3).toUpperCase()}`)
  }, [publicClient])

  const runLoop = useCallback(async () => {
    if (runningLoop.current || useTradeFarmStore.getState().botStatus !== 'running') return
    if (!address || !publicClient) return
    runningLoop.current = true
    const state = useTradeFarmStore.getState()
    const config = state.botConfig

    try {
      const usdcBalance = await publicClient.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
      const usdc = Number(formatUnits(usdcBalance, 6))
      log('INFO', `USDC balance: ${usdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

      if (usdc < config.tradeSize) {
        log('ERROR', `Balance below ${config.tradeSize.toLocaleString()} USDC floor. Stopping.`)
        halt('error')
        return
      }

      const position = useTradeFarmStore.getState().botPosition
      if (position) {
        const tokenBalance = await publicClient.readContract({ address: position.token, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
        if (tokenBalance === 0n) {
          log('WARN', 'Tracked token balance is zero. Clearing position.')
          useTradeFarmStore.getState().setBotPosition(null)
          return
        }
        const currentOut = await publicClient.readContract({ address: ROUTER_ADDRESS, abi: ROUTER_ABI, functionName: 'getAmountOut', args: [position.token, tokenBalance, false] })
        const currentUSDC = Number(formatUnits(currentOut, 6))
        const amount = Number(formatUnits(tokenBalance, 18))
        const currentPrice = amount > 0 ? currentUSDC / amount : 0
        const pnl = ((currentUSDC - position.entryUSDC) / position.entryUSDC) * 100
        useTradeFarmStore.getState().setBotPosition({ ...position, amount, currentPrice })
        log('QUOTE', `Price: ${currentPrice.toFixed(6)} USDC | PnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`)

        if (pnl >= config.takeProfitPct || pnl <= -config.stopLossPct) {
          log('SELL', pnl >= config.takeProfitPct ? 'Take profit hit. Selling...' : 'Stop loss hit. Selling...')
          const allowance = await publicClient.readContract({ address: position.token, abi: ERC20_ABI, functionName: 'allowance', args: [address, ROUTER_ADDRESS] })
          if (allowance < tokenBalance) log('SELL', 'Approving token...')
          log('SELL', 'sell() submitting...')
          const result = await executeSell({
            token: position.token,
            symbol: position.symbol,
            amount: formatUnits(tokenBalance, 18),
            slippagePct: config.slippagePct,
            expectedOut: currentOut,
          })
          log('SELL', `sell() submitted: ${result.hash.slice(0, 10)}…${result.hash.slice(-6)}`)
          log('SELL', `Confirmed ✓ Received: ${formatUnits(result.amountOut, 6)} USDC`)
          const profit = Number(formatUnits(result.amountOut, 6)) - position.entryUSDC
          log('INFO', `Profit: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USDC. Scanning next token.`)
          cooldownTokens.current.set(position.token.toLowerCase(), 2)
          useTradeFarmStore.getState().setBotPosition(null)
          return
        }
        log('HOLD', `PnL ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%. Holding.`)
        return
      }

      let tokenAddress: Address
      if (config.mode === 'auto') {
        const scan = await scanBestToken({
          publicClient,
          previousPrices: previousPrices.current,
          cooldownTokens: cooldownTokens.current,
          log,
        })
        useTradeFarmStore.getState().setBotTokensScanned(useTradeFarmStore.getState().botTokensScanned + scan.scanned)
        if (!scan.best) {
          log('WAIT', 'No suitable token found.')
          return
        }
        tokenAddress = scan.best.address
        log('SCAN', `reserve: ${Number(formatUnits(scan.best.reserve, 6)).toLocaleString()} USDC | momentum score: ${scan.best.score.toFixed(4)}`)
      } else {
        if (!isAddress(config.manualToken)) throw new Error('Manual token address is invalid')
        tokenAddress = config.manualToken
        log('SCAN', `Manual token: ${tokenAddress.slice(0, 8)}…${tokenAddress.slice(-4)}`)
      }

      const symbol = await getSymbol(tokenAddress)
      const amountIn = parseUnits(config.tradeSize.toString(), 6)
      const expectedOut = await publicClient.readContract({ address: ROUTER_ADDRESS, abi: ROUTER_ABI, functionName: 'getAmountOut', args: [tokenAddress, amountIn, true] })
      log('QUOTE', `getAmountOut → ${Number(formatUnits(expectedOut, 18)).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${symbol} for ${config.tradeSize.toLocaleString()} USDC`)
      const allowance = await publicClient.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, ROUTER_ADDRESS] })
      if (allowance < amountIn) log('BUY', 'Approving USDC...')
      log('BUY', 'swap() submitting...')
      const result = await executeBuy({ token: tokenAddress, symbol, amount: config.tradeSize.toString(), slippagePct: config.slippagePct, expectedOut })
      log('BUY', `swap() submitted: ${result.hash.slice(0, 10)}…${result.hash.slice(-6)}`)
      log('BUY', `Confirmed ✓ block ${result.receipt.blockNumber.toString()} (${result.transferLogs} logs)`)
      const tokenAmount = Number(formatUnits(result.amountOut, 18))
      const entryPrice = config.tradeSize / tokenAmount
      useTradeFarmStore.getState().setBotPosition({
        token: tokenAddress,
        symbol,
        amount: tokenAmount,
        entryUSDC: config.tradeSize,
        entryPrice,
        currentPrice: entryPrice,
        entryBlock: result.receipt.blockNumber,
      })
      log('INFO', `Position: ${tokenAmount.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${symbol} @ ${entryPrice.toFixed(6)} USDC`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unknown bot error'
      log('ERROR', message)
      halt('error')
    } finally {
      runningLoop.current = false
      if (mounted.current && useTradeFarmStore.getState().botStatus === 'running') {
        const delay = useTradeFarmStore.getState().botConfig.delaySeconds * 1_000
        useTradeFarmStore.getState().setBotNextActionAt(Date.now() + delay)
      }
    }
  }, [address, executeBuy, executeSell, getSymbol, halt, log, publicClient])

  const startBot = useCallback(() => {
    if (!isConnected || !address) { log('ERROR', 'Connect wallet before starting the bot.'); return }
    if (chainId !== 5042002) { log('ERROR', 'Switch wallet to Arc Testnet (5042002).'); return }
    const config = useTradeFarmStore.getState().botConfig
    if (config.mode === 'manual' && !isAddress(config.manualToken)) { log('ERROR', 'Enter a valid manual token address.'); return }
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
    useTradeFarmStore.getState().setBotTokensScanned(0)
    useTradeFarmStore.getState().setBotStatus('running')
    useTradeFarmStore.getState().setBotNextActionAt(Date.now() + config.delaySeconds * 1_000)
    log('INFO', `Bot started. Mode: ${config.mode === 'auto' ? 'Auto-Scan' : 'Manual Token'}`)
    void runLoop()
    intervalRef.current = window.setInterval(() => { void runLoop() }, config.delaySeconds * 1_000)
  }, [address, chainId, isConnected, log, runLoop])

  const stopBot = useCallback(() => {
    halt('stopped')
    log('INFO', 'Bot stopped by user.')
  }, [halt, log])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
    }
  }, [])

  return { startBot, stopBot }
}
