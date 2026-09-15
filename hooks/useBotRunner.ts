'use client'

import { useCallback, useEffect, useRef } from 'react'
import { formatUnits, isAddress, parseUnits, type Address } from 'viem'
import { useAccount, usePublicClient } from 'wagmi'
import { ERC20_ABI, ROUTER_ADDRESS, TOKEN_METADATA_ABI, USDC_ADDRESS } from '@/lib/contracts'
import { friendlyContractError, getMarketSnapshot, getPairQuote } from '@/lib/flipt'
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
    const config = useTradeFarmStore.getState().botConfig

    try {
      const usdcBalance = await publicClient.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
      const usdc = Number(formatUnits(usdcBalance, 6))
      log('INFO', `Flipt USDC balance · ${usdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

      if (usdc < config.tradeSize) {
        log('ERROR', `Trade size is ${config.tradeSize.toLocaleString()} USDC; available balance is ${usdc.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC.`)
        halt('stopped')
        return
      }

      const position = useTradeFarmStore.getState().botPosition
      if (position) {
        const tokenBalance = await publicClient.readContract({ address: position.token, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
        if (tokenBalance === 0n) {
          log('WARN', 'Position balance is zero. Local position cleared.')
          useTradeFarmStore.getState().setBotPosition(null)
          return
        }
        const knownMarket = useTradeFarmStore.getState().tokens.find((item) => item.address.toLowerCase() === position.token.toLowerCase())
        const market = await getMarketSnapshot(publicClient, position.token, knownMarket?.pair, knownMarket)
        useTradeFarmStore.getState().upsertToken(market)
        const currentOut = await getPairQuote(publicClient, position.token, market.pair, tokenBalance, false)
        const currentUSDC = Number(formatUnits(currentOut, 6))
        const amount = Number(formatUnits(tokenBalance, 18))
        const currentPrice = amount > 0 ? currentUSDC / amount : 0
        const pnl = ((currentUSDC - position.entryUSDC) / position.entryUSDC) * 100
        useTradeFarmStore.getState().setBotPosition({ ...position, amount, currentPrice })
        log('QUOTE', `${position.symbol} · ${currentPrice.toFixed(8)} USDC · PnL ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`)

        if (pnl >= config.takeProfitPct || pnl <= -config.stopLossPct) {
          log('SELL', pnl >= config.takeProfitPct ? 'Take-profit threshold reached.' : 'Stop-loss threshold reached.')
          const allowance = await publicClient.readContract({ address: position.token, abi: ERC20_ABI, functionName: 'allowance', args: [address, ROUTER_ADDRESS] })
          if (allowance < tokenBalance) log('SELL', 'Token approval required.')
          const result = await executeSell({
            token: position.token,
            symbol: position.symbol,
            amount: formatUnits(tokenBalance, 18),
            slippagePct: config.slippagePct,
            expectedOut: currentOut,
          })
          log('SELL', `Confirmed · ${result.hash.slice(0, 10)}…${result.hash.slice(-6)} · ${Number(formatUnits(result.amountOut, 6)).toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC`)
          const profit = Number(formatUnits(result.amountOut, 6)) - position.entryUSDC
          log('INFO', `Closed ${position.symbol} · ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USDC`)
          cooldownTokens.current.set(position.token.toLowerCase(), 2)
          useTradeFarmStore.getState().setBotPosition(null)
          return
        }
        log('HOLD', `No exit signal · next check in ${config.delaySeconds}s`)
        return
      }

      let tokenAddress: Address
      let pairAddress: Address
      let symbol: string
      if (config.mode === 'auto') {
        const scan = await scanBestToken({
          markets: useTradeFarmStore.getState().tokens,
          previousPrices: previousPrices.current,
          cooldownTokens: cooldownTokens.current,
          log,
        })
        scan.markets.forEach((market) => useTradeFarmStore.getState().upsertToken(market))
        useTradeFarmStore.getState().setBotTokensScanned(useTradeFarmStore.getState().botTokensScanned + scan.scanned)
        if (!scan.best) {
          log('WAIT', 'No liquid graduated pool met the scan criteria.')
          return
        }
        tokenAddress = scan.best.address
        pairAddress = scan.best.pair
        symbol = scan.best.market.symbol
      } else {
        if (!isAddress(config.manualToken)) throw new Error('Enter a valid manual token address.')
        tokenAddress = config.manualToken
        const known = useTradeFarmStore.getState().tokens.find((item) => item.address.toLowerCase() === tokenAddress.toLowerCase())
        const market = await getMarketSnapshot(publicClient, tokenAddress, known?.pair, known)
        useTradeFarmStore.getState().upsertToken(market)
        pairAddress = market.pair
        symbol = await getSymbol(tokenAddress)
        log('SCAN', `Manual market · ${symbol} · ${tokenAddress.slice(0, 8)}…${tokenAddress.slice(-4)}`)
      }

      const amountIn = parseUnits(config.tradeSize.toString(), 6)
      const expectedOut = await getPairQuote(publicClient, tokenAddress, pairAddress, amountIn, true)
      log('QUOTE', `${config.tradeSize.toLocaleString()} USDC → ${Number(formatUnits(expectedOut, 18)).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${symbol}`)
      const allowance = await publicClient.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, ROUTER_ADDRESS] })
      if (allowance < amountIn) log('BUY', 'Flipt USDC approval required.')
      const result = await executeBuy({ token: tokenAddress, symbol, amount: config.tradeSize.toString(), slippagePct: config.slippagePct, expectedOut })
      log('BUY', `Confirmed · block ${result.receipt.blockNumber.toString()} · ${result.transferLogs} transfers`)
      const tokenAmount = Number(formatUnits(result.amountOut, 18))
      const entryPrice = config.tradeSize / tokenAmount
      useTradeFarmStore.getState().setBotPosition({
        token: tokenAddress, symbol, amount: tokenAmount, entryUSDC: config.tradeSize,
        entryPrice, currentPrice: entryPrice, entryBlock: result.receipt.blockNumber,
      })
      log('INFO', `Opened ${symbol} · ${tokenAmount.toLocaleString('en-US', { maximumFractionDigits: 4 })} tokens @ ${entryPrice.toFixed(8)} USDC`)
    } catch (cause) {
      log('ERROR', friendlyContractError(cause))
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
    if (!isConnected || !address) { log('ERROR', 'Connect a wallet before starting.'); return }
    if (chainId !== 5042002) { log('ERROR', 'Switch the wallet to Arc Testnet.'); return }
    const config = useTradeFarmStore.getState().botConfig
    if (config.mode === 'manual' && !isAddress(config.manualToken)) { log('ERROR', 'Enter a valid manual token address.'); return }
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
    useTradeFarmStore.getState().setBotTokensScanned(0)
    useTradeFarmStore.getState().setBotStatus('running')
    useTradeFarmStore.getState().setBotNextActionAt(Date.now() + config.delaySeconds * 1_000)
    log('INFO', `${config.mode === 'auto' ? 'Auto-scan' : 'Manual'} session started · ${config.tradeSize.toLocaleString()} USDC per trade`)
    void runLoop()
    intervalRef.current = window.setInterval(() => { void runLoop() }, config.delaySeconds * 1_000)
  }, [address, chainId, isConnected, log, runLoop])

  const stopBot = useCallback(() => {
    halt('stopped')
    log('INFO', 'Session stopped.')
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
