'use client'

import { useCallback, useEffect, useRef } from 'react'
import { formatUnits, isAddress, parseUnits, type Address } from 'viem'
import { useAccount, usePublicClient } from 'wagmi'
import { ERC20_ABI, ROUTER_ADDRESS, TOKEN_METADATA_ABI, USDC_ADDRESS } from '@/lib/contracts'
import { friendlyContractError, getMarketSnapshot, getPairQuote } from '@/lib/flipt'
import { buildSafeTradePlan, scanBestToken } from '@/lib/botLogic'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { useExecuteTrade } from './useExecuteTrade'
import type { LogLevel } from '@/types/trading'

function isTransientRpcFailure(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause)
  return /http request failed|failed to fetch|fetch failed|network error|timeout|timed out|socket|429|rate.?limit|limit exceeded|econn|temporarily unavailable/i.test(message)
}

export function useBotRunner() {
  const { address, isConnected, chainId } = useAccount()
  const publicClient = usePublicClient()
  const { executeBuy, executeSell } = useExecuteTrade()
  const intervalRef = useRef<number | null>(null)
  const runningLoop = useRef(false)
  const previousPrices = useRef(new Map<string, number>())
  const cooldownTokens = useRef(new Map<string, number>())
  const rpcFailureStreak = useRef(0)
  const mounted = useRef(true)

  const log = useCallback((level: LogLevel, message: string) => {
    useTradeFarmStore.getState().addBotLog(level, message)
  }, [])

  const halt = useCallback((status: 'stopped' | 'error' = 'stopped') => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
    intervalRef.current = null
    // An in-flight wallet request cannot be cancelled. The loop releases this
    // lock in finally so a rapid stop/start cannot launch overlapping trades.
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
    const before = useTradeFarmStore.getState()
    if (runningLoop.current || before.botStatus !== 'running') return
    if (before.botNextActionAt && Date.now() < before.botNextActionAt) return
    if (!address || !publicClient) return

    runningLoop.current = true
    const config = before.botConfig
    let nextDelay = config.delaySeconds * 1_000
    let transientFailure = false

    try {
      const state = useTradeFarmStore.getState()
      const targetRankReached = state.botLeaderboardRank !== null && state.botLeaderboardRank <= config.targetRank
      const deadlineReached = config.deadline !== null && Date.now() >= config.deadline
      const profitTargetReached = state.botRealizedPnl >= config.sessionProfitTarget
      const lossLimitReached = state.botRealizedPnl <= -config.maxSessionLoss
      const lossStreakReached = state.botConsecutiveLosses >= config.maxConsecutiveLosses

      if (!state.botPosition) {
        if (deadlineReached) { log('INFO', 'Session deadline reached. Bot stopped.'); halt(); return }
        if (profitTargetReached) { log('INFO', `Session profit target reached · +${state.botRealizedPnl.toFixed(2)} USDC`); halt(); return }
        if (lossLimitReached) { log('ERROR', `Session loss limit reached · ${state.botRealizedPnl.toFixed(2)} USDC`); halt(); return }
        if (lossStreakReached) { log('ERROR', `${state.botConsecutiveLosses} consecutive losses. Circuit breaker engaged.`); halt(); return }
        if (targetRankReached) {
          if (config.objectiveMode === 'reach') {
            log('INFO', `Leaderboard target reached · rank #${state.botLeaderboardRank}.`)
            halt()
            return
          }
          log('WAIT', `Defending rank #${state.botLeaderboardRank}. New entries paused while target holds.`)
          return
        }
      }

      const usdcBalance = await publicClient.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
      const usdc = Number(formatUnits(usdcBalance, 6))
      if (usdc < 100 && !state.botPosition) {
        log('ERROR', `Only ${usdc.toFixed(2)} Flipt USDC available. Minimum entry is 100 USDC.`)
        halt()
        return
      }

      const position = useTradeFarmStore.getState().botPosition
      if (position) {
        const tokenBalance = await publicClient.readContract({ address: position.token, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] })
        const trackedBalance = position.amountRaw ? BigInt(position.amountRaw) : parseUnits(position.amount.toFixed(18), 18)
        const managedBalance = tokenBalance < trackedBalance ? tokenBalance : trackedBalance
        if (managedBalance === 0n) {
          log('WARN', 'Managed position balance is zero. Local position cleared.')
          useTradeFarmStore.getState().setBotPosition(null)
          nextDelay = 1_500
          return
        }
        if (managedBalance < trackedBalance) log('WARN', 'Managed token balance decreased outside TradeFarm. The remaining tracked amount will be protected.')

        const knownMarket = useTradeFarmStore.getState().tokens.find((item) => item.address.toLowerCase() === position.token.toLowerCase())
        const market = await getMarketSnapshot(publicClient, position.token, knownMarket?.pair, knownMarket)
        useTradeFarmStore.getState().upsertToken(market)
        const currentOut = await getPairQuote(publicClient, position.token, market.pair, managedBalance, false)
        const currentUSDC = Number(formatUnits(currentOut, 6))
        const amount = Number(formatUnits(managedBalance, 18))
        const currentPrice = amount > 0 ? currentUSDC / amount : 0
        const positionProfit = currentUSDC - position.entryUSDC
        const pnl = (positionProfit / position.entryUSDC) * 100
        const projectedSessionPnl = state.botRealizedPnl + positionProfit
        const movementPct = position.lastCheckPrice > 0 ? Math.abs((currentPrice - position.lastCheckPrice) / position.lastCheckPrice) * 100 : 0
        const stagnantChecks = movementPct < config.stagnationThresholdPct ? position.stagnantChecks + 1 : 0
        const peakPnlPct = Math.max(position.peakPnlPct, pnl)
        const ageSeconds = Math.floor((Date.now() - position.openedAt) / 1_000)
        const trailingHit = peakPnlPct >= config.trailingActivationPct && pnl <= peakPnlPct - config.trailingDistancePct
        const objectiveExit = targetRankReached && config.objectiveMode === 'reach'
        const profitObjectiveExit = projectedSessionPnl >= config.sessionProfitTarget
        const drawdownExit = projectedSessionPnl <= -config.maxSessionLoss

        useTradeFarmStore.getState().setBotPosition({
          ...position, amount, amountRaw: managedBalance.toString(), currentPrice, peakPnlPct, stagnantChecks, lastCheckPrice: currentPrice,
        })
        log('QUOTE', `${position.symbol} · PnL ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% · peak ${peakPnlPct.toFixed(2)}% · age ${ageSeconds}s`)

        let exitReason: string | null = null
        if (objectiveExit) exitReason = `Leaderboard target #${config.targetRank} reached`
        else if (deadlineReached) exitReason = 'Session deadline reached'
        else if (profitObjectiveExit) exitReason = 'Projected session profit target reached'
        else if (drawdownExit) exitReason = `Maximum session drawdown reached (${projectedSessionPnl.toFixed(2)} USDC)`
        else if (pnl >= config.takeProfitPct) exitReason = 'Take-profit threshold reached'
        else if (pnl <= -config.stopLossPct) exitReason = 'Stop-loss threshold reached'
        else if (trailingHit) exitReason = `Trailing stop triggered from ${peakPnlPct.toFixed(2)}% peak`
        else if (ageSeconds >= config.maxHoldSeconds) exitReason = `Maximum hold time reached (${config.maxHoldSeconds}s)`
        else if (stagnantChecks >= config.stagnantChecksLimit) exitReason = `Price stagnant for ${stagnantChecks} checks`

        if (exitReason) {
          log('SELL', exitReason)
          const allowance = await publicClient.readContract({ address: position.token, abi: ERC20_ABI, functionName: 'allowance', args: [address, ROUTER_ADDRESS] })
          if (allowance < managedBalance) log('SELL', 'Token approval required.')
          const result = await executeSell({
            token: position.token,
            symbol: position.symbol,
            amount: formatUnits(managedBalance, 18),
            slippagePct: config.slippagePct,
            expectedOut: currentOut,
          })
          const received = Number(formatUnits(result.amountOut, 6))
          const profit = received - position.entryUSDC
          useTradeFarmStore.getState().recordBotTrade(profit, position.entryUSDC + received)
          useTradeFarmStore.getState().setBotPosition(null)
          cooldownTokens.current.set(position.token.toLowerCase(), 2)
          log('SELL', `Confirmed · ${result.hash.slice(0, 10)}…${result.hash.slice(-6)} · ${received.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC`)
          log('INFO', `Closed ${position.symbol} · ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USDC · rotating markets`)

          const afterTrade = useTradeFarmStore.getState()
          if (deadlineReached || objectiveExit || drawdownExit || afterTrade.botRealizedPnl >= config.sessionProfitTarget || afterTrade.botRealizedPnl <= -config.maxSessionLoss || afterTrade.botConsecutiveLosses >= config.maxConsecutiveLosses) {
            log('INFO', 'Session objective or guardrail reached. Bot stopped.')
            halt(drawdownExit || afterTrade.botRealizedPnl <= -config.maxSessionLoss ? 'error' : 'stopped')
            return
          }
          nextDelay = 1_500
          return
        }

        log('HOLD', `No exit signal · movement ${movementPct.toFixed(2)}% · ${stagnantChecks}/${config.stagnantChecksLimit} stagnant checks`)
        return
      }

      let tokenAddress: Address
      let pairAddress: Address
      let symbol: string
      let actualTradeSize: number

      if (config.mode === 'auto') {
        const scan = await scanBestToken({
          markets: useTradeFarmStore.getState().tokens,
          requestedSize: Math.min(config.tradeSize, usdc),
          maxLiquiditySharePct: config.maxLiquiditySharePct,
          maxPriceImpactPct: config.maxPriceImpactPct,
          previousPrices: previousPrices.current,
          cooldownTokens: cooldownTokens.current,
          log,
        })
        useTradeFarmStore.getState().setBotTokensScanned(useTradeFarmStore.getState().botTokensScanned + scan.scanned)
        if (!scan.best) {
          log('WAIT', 'No pool passed liquidity and price-impact guardrails.')
          return
        }
        tokenAddress = scan.best.address
        pairAddress = scan.best.pair
        symbol = scan.best.market.symbol
        actualTradeSize = scan.best.plan.size
      } else {
        if (!isAddress(config.manualToken)) throw new Error('Enter a valid manual token address.')
        tokenAddress = config.manualToken
        const known = useTradeFarmStore.getState().tokens.find((item) => item.address.toLowerCase() === tokenAddress.toLowerCase())
        const market = await getMarketSnapshot(publicClient, tokenAddress, known?.pair, known)
        useTradeFarmStore.getState().upsertToken(market)
        const plan = buildSafeTradePlan(market, Math.min(config.tradeSize, usdc), config.maxLiquiditySharePct, config.maxPriceImpactPct)
        if (!plan) { log('WAIT', 'Manual market failed liquidity or impact guardrails.'); return }
        pairAddress = market.pair
        symbol = await getSymbol(tokenAddress)
        actualTradeSize = plan.size
        log('SCAN', `Manual market · ${symbol} · ${plan.priceImpactPct.toFixed(2)}% estimated impact`)
      }

      if (actualTradeSize < config.tradeSize) log('INFO', `Trade size capped to ${actualTradeSize.toLocaleString()} USDC by balance/liquidity guardrails.`)
      const amountIn = parseUnits(actualTradeSize.toFixed(2), 6)
      const expectedOut = await getPairQuote(publicClient, tokenAddress, pairAddress, amountIn, true)
      log('QUOTE', `${actualTradeSize.toLocaleString()} USDC → ${Number(formatUnits(expectedOut, 18)).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${symbol}`)
      const allowance = await publicClient.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'allowance', args: [address, ROUTER_ADDRESS] })
      if (allowance < amountIn) log('BUY', 'Flipt USDC approval required.')
      const result = await executeBuy({ token: tokenAddress, symbol, amount: actualTradeSize.toFixed(2), slippagePct: config.slippagePct, expectedOut })
      const tokenAmount = Number(formatUnits(result.amountOut, 18))
      const entryPrice = actualTradeSize / tokenAmount
      useTradeFarmStore.getState().setBotPosition({
        token: tokenAddress,
        symbol,
        amount: tokenAmount,
        amountRaw: result.amountOut.toString(),
        entryUSDC: actualTradeSize,
        entryPrice,
        currentPrice: entryPrice,
        entryBlock: result.receipt.blockNumber.toString(),
        openedAt: Date.now(),
        peakPnlPct: 0,
        stagnantChecks: 0,
        lastCheckPrice: entryPrice,
      })
      log('BUY', `Confirmed · block ${result.receipt.blockNumber.toString()} · ${result.transferLogs} transfers`)
      log('INFO', `Opened ${symbol} · ${tokenAmount.toLocaleString('en-US', { maximumFractionDigits: 4 })} tokens @ ${entryPrice.toFixed(8)} USDC`)
    } catch (cause) {
      if (isTransientRpcFailure(cause)) {
        transientFailure = true
        rpcFailureStreak.current += 1
        nextDelay = Math.min(2_000 * 2 ** (rpcFailureStreak.current - 1), 30_000)
        const hasPosition = Boolean(useTradeFarmStore.getState().botPosition)
        log('WARN', `Arc RPC temporarily unavailable · retry ${rpcFailureStreak.current} in ${Math.round(nextDelay / 1_000)}s${hasPosition ? ' · position remains managed' : ''}`)
      } else {
        log('ERROR', friendlyContractError(cause))
        halt('error')
      }
    } finally {
      if (!transientFailure) rpcFailureStreak.current = 0
      runningLoop.current = false
      const current = useTradeFarmStore.getState()
      if (mounted.current && current.botStatus === 'running') {
        let boundedDelay = nextDelay
        if (current.botPosition) {
          const holdRemaining = current.botConfig.maxHoldSeconds * 1_000 - (Date.now() - current.botPosition.openedAt)
          boundedDelay = Math.min(boundedDelay, Math.max(1_000, holdRemaining))
        }
        if (current.botConfig.deadline !== null) {
          boundedDelay = Math.min(boundedDelay, Math.max(1_000, current.botConfig.deadline - Date.now()))
        }
        current.setBotNextActionAt(Date.now() + boundedDelay)
      }
    }
  }, [address, executeBuy, executeSell, getSymbol, halt, log, publicClient])

  const startBot = useCallback(() => {
    if (!isConnected || !address) { log('ERROR', 'Connect a wallet before starting.'); return }
    if (chainId !== 5042002) { log('ERROR', 'Switch the wallet to Arc Testnet.'); return }
    if (runningLoop.current) { log('WAIT', 'The previous wallet request is still settling. Start again after it completes.'); return }
    const config = useTradeFarmStore.getState().botConfig
    if (config.mode === 'manual' && !isAddress(config.manualToken)) { log('ERROR', 'Enter a valid manual token address.'); return }
    if (config.deadline !== null && config.deadline <= Date.now()) { log('ERROR', 'Choose a future session deadline.'); return }
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
    useTradeFarmStore.getState().resetBotSession()
    useTradeFarmStore.getState().setBotStatus('running')
    useTradeFarmStore.getState().setBotNextActionAt(Date.now())
    log('INFO', `${config.mode === 'auto' ? 'Rotation' : 'Manual'} session started · target rank #${config.targetRank} · profit target ${config.sessionProfitTarget.toLocaleString()} USDC`)
    intervalRef.current = window.setInterval(() => { void runLoop() }, 1_000)
    void runLoop()
  }, [address, chainId, isConnected, log, runLoop])

  const stopBot = useCallback(() => {
    halt('stopped')
    log('INFO', 'Session stopped by user. Open positions were not sold automatically.')
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
