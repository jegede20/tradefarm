import type { Address, PublicClient } from 'viem'
import { ERC20_ABI, ROUTER_ABI, ROUTER_ADDRESS } from './contracts'
import type { LogLevel, RecentTrade, Token } from '@/types/trading'

export interface TradePlan {
  size: number
  priceImpactPct: number
  exitPriceImpactPct: number
  estimatedExitUSDC: number
}

export interface MarketSignalPoint {
  price: number
  timestamp: number
}

export interface LiquidityLockSnapshot {
  pct: number
  creatorHoldingPct: number
  protocolVerified: boolean
  checkedAt: number
}

export interface ScannedToken {
  address: Address
  pair: Address
  reserve: number
  price: number
  score: number
  momentumPct: number
  volatilityPct: number
  buyPressurePct: number
  recentTradeCount: number
  uniqueTraders: number
  activityBuckets: number
  sellDepthMultiple: number
  largestWalletFlowPct: number
  poolTokenSharePct: number
  liquidityLockPct: number
  creatorHoldingPct: number
  market: Token
  plan: TradePlan
}

interface Candidate extends Omit<ScannedToken, 'liquidityLockPct' | 'creatorHoldingPct'> {}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const RECENT_SELL_SHOCK_WINDOW_MS = 2 * 60_000

export interface RecentSellShock {
  largestSellTokens: number
  largestSellUSDC: number
  poolTokenSharePct: number
  stressedExitUSDC: number
  stressedLossPct: number
}

function constantProductOut(amountIn: number, reserveIn: number, reserveOut: number, inputMultiplier = 0.99) {
  if (amountIn <= 0 || reserveIn <= 0 || reserveOut <= 0) return 0
  const adjustedIn = amountIn * inputMultiplier
  return adjustedIn * reserveOut / (reserveIn + adjustedIn)
}

/**
 * Model the bot's complete entry/exit after a repeat of the largest verified
 * sell seen in the short flow window. Recent sell volume proves that swaps can
 * execute, but a large seller is also adverse inventory that can move the pool
 * before the bot exits. Profit mode must account for both facts.
 */
export function assessRecentSellShock(
  market: Token,
  plan: TradePlan,
  tokenTrades: RecentTrade[],
  now = Date.now(),
): RecentSellShock | null {
  const recentSells = tokenTrades.filter((trade) => trade.type === 'SELL'
    && trade.timestamp >= now - RECENT_SELL_SHOCK_WINDOW_MS
    && Number.isFinite(trade.amount)
    && trade.amount > 0)
  if (recentSells.length === 0) return null

  const largest = recentSells.reduce((current, trade) => trade.amount > current.amount ? trade : current)
  const botTokens = constantProductOut(plan.size, market.reserve, market.poolTokenReserve)
  if (botTokens <= 0) return null

  // Flipt's buy path leaves the 1%-adjusted USDC input in the pair. Token
  // inputs are transferred into the pair before the sell output is paid.
  const postEntryUSDC = market.reserve + plan.size * 0.99
  const postEntryTokens = market.poolTokenReserve - botTokens
  // Flipt sells move the invariant with the complete token input, then pay the
  // trader 99% of the gross USDC output. Pool reserves therefore lose the
  // gross output even though the wallet receives the fee-adjusted amount.
  const shockGrossUSDCOut = constantProductOut(largest.amount, postEntryTokens, postEntryUSDC, 1)
  const postShockUSDC = Math.max(0, postEntryUSDC - shockGrossUSDCOut)
  const postShockTokens = postEntryTokens + largest.amount
  const stressedExitGrossUSDC = constantProductOut(botTokens, postShockTokens, postShockUSDC, 1)
  const stressedExitUSDC = stressedExitGrossUSDC * 0.99
  const stressedLossPct = plan.size > 0 ? Math.max(0, (1 - stressedExitUSDC / plan.size) * 100) : 100

  return {
    largestSellTokens: largest.amount,
    largestSellUSDC: largest.amount * largest.price,
    poolTokenSharePct: market.poolTokenReserve > 0 ? largest.amount / market.poolTokenReserve * 100 : 100,
    stressedExitUSDC,
    stressedLossPct,
  }
}

export function getExecutionPriceMovePct(scoredPrice: number, livePrice: number) {
  return scoredPrice > 0 && Number.isFinite(livePrice) ? (livePrice - scoredPrice) / scoredPrice * 100 : Number.NaN
}

export function getMaximumExecutionMovePct(strategyMode: 'profit' | 'rank', maxPriceImpactPct: number) {
  const configured = Math.max(0.25, maxPriceImpactPct)
  return strategyMode === 'profit' ? Math.min(1, configured) : Math.min(2, configured)
}

export function getMinimumOut(expectedOut: bigint, slippagePct: number) {
  const bps = BigInt(Math.max(0, 10_000 - Math.round(slippagePct * 100)))
  return (expectedOut * bps) / 10_000n
}

export function buildSafeTradePlan(
  market: Token,
  requestedSize: number,
  maxLiquiditySharePct: number,
  maxPriceImpactPct: number,
): TradePlan | null {
  const size = Math.floor(Math.min(requestedSize, market.reserve * maxLiquiditySharePct / 100) * 100) / 100
  if (size < 100 || market.price <= 0 || market.reserve <= 0 || market.poolTokenReserve <= 0 || maxPriceImpactPct <= 0) return null

  // Mirror Flipt's verified fee direction: buys use 99% of USDC input for the
  // invariant; sells pay the wallet 99% of gross USDC output. The second leg
  // proves that the complete intended position can be quoted back out against
  // post-entry reserves, replacing a fixed token-supply proxy.
  const adjustedUSDCIn = size * 0.99
  const quotedTokens = adjustedUSDCIn * market.poolTokenReserve / (market.reserve + adjustedUSDCIn)
  const idealTokens = size / market.price
  const priceImpactPct = idealTokens > 0 ? Math.max(0, (1 - quotedTokens / idealTokens) * 100) : 100
  const postUSDCReserve = market.reserve + adjustedUSDCIn
  const postTokenReserve = market.poolTokenReserve - quotedTokens
  // Verified Flipt sells use the full token input for the invariant and pay
  // 99% of gross USDC output to the seller.
  const grossExitUSDC = postTokenReserve > 0
    ? quotedTokens * postUSDCReserve / (postTokenReserve + quotedTokens)
    : 0
  const estimatedExitUSDC = grossExitUSDC * 0.99
  const postEntrySpot = postTokenReserve > 0 ? postUSDCReserve / postTokenReserve : 0
  const idealExitUSDC = quotedTokens * postEntrySpot
  const exitPriceImpactPct = idealExitUSDC > 0
    ? Math.max(0, (1 - estimatedExitUSDC / idealExitUSDC) * 100)
    : 100
  if (!Number.isFinite(priceImpactPct) || !Number.isFinite(exitPriceImpactPct)
    || priceImpactPct > maxPriceImpactPct || exitPriceImpactPct > maxPriceImpactPct) return null
  return { size, priceImpactPct, exitPriceImpactPct, estimatedExitUSDC }
}

export async function validateGraduatedPoolSafety(
  publicClient: PublicClient,
  token: Address,
  pair: Address,
  cache: Map<string, LiquidityLockSnapshot>,
) {
  const key = pair.toLowerCase()
  const cached = cache.get(key)
  if (cached && Date.now() - cached.checkedAt < 5 * 60_000) return cached

  const launch = await publicClient.readContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: 'launchOf',
    args: [token],
  })
  const [lpTotalSupply, selfHeld, tokenTotalSupply, creatorBalance] = await Promise.all([
    publicClient.readContract({ address: pair, abi: ERC20_ABI, functionName: 'totalSupply' }),
    publicClient.readContract({ address: pair, abi: ERC20_ABI, functionName: 'balanceOf', args: [pair] }),
    publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'totalSupply' }),
    publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [launch[6]] }),
  ])
  const protocolVerified = launch[0]
    && launch[1]
    && launch[4].toLowerCase() === token.toLowerCase()
    && launch[5].toLowerCase() === pair.toLowerCase()
  const pct = lpTotalSupply > 0n ? Number(selfHeld * 10_000n / lpTotalSupply) / 100 : 0
  const creatorHoldingPct = tokenTotalSupply > 0n ? Number(creatorBalance * 10_000n / tokenTotalSupply) / 100 : 100
  const snapshot = { pct, creatorHoldingPct, protocolVerified, checkedAt: Date.now() }
  cache.set(key, snapshot)
  return snapshot
}

export async function scanBestToken({
  publicClient,
  markets,
  recentTrades,
  requestedSize,
  strategyMode,
  minLiquidityUSDC,
  minRecentTrades,
  minBuyPressurePct,
  maxBuyPressurePct,
  minSellDepthMultiple,
  minLiquidityLockPct,
  maxCreatorHoldingPct,
  maxWalletFlowPct,
  maxMomentumPct,
  maxVolatilityPct,
  maxLiquiditySharePct,
  maxPriceImpactPct,
  stopLossPct,
  signalHistory,
  liquidityLocks,
  cooldownTokens,
  log,
}: {
  publicClient: PublicClient
  markets: Token[]
  recentTrades: RecentTrade[]
  requestedSize: number
  strategyMode: 'profit' | 'rank'
  minLiquidityUSDC: number
  minRecentTrades: number
  minBuyPressurePct: number
  maxBuyPressurePct: number
  minSellDepthMultiple: number
  minLiquidityLockPct: number
  maxCreatorHoldingPct: number
  maxWalletFlowPct: number
  maxMomentumPct: number
  maxVolatilityPct: number
  maxLiquiditySharePct: number
  maxPriceImpactPct: number
  stopLossPct: number
  signalHistory: Map<string, MarketSignalPoint[]>
  liquidityLocks: Map<string, LiquidityLockSnapshot>
  cooldownTokens: Map<string, number>
  log: (level: LogLevel, message: string) => void
}) {
  // Rank the synchronized universe by actual rolling activity before applying
  // quality gates. This prevents creation-order seeds from monopolizing every
  // scan while older, actively traded pools remain unseen.
  const cutoff = Date.now() - 10 * 60_000
  const recentActivity = new Map<string, number>()
  for (const trade of recentTrades) {
    if (trade.timestamp < cutoff) continue
    const key = trade.token.toLowerCase()
    recentActivity.set(key, (recentActivity.get(key) ?? 0) + 1)
  }
  const marketsToReview = [...markets]
    .sort((left, right) => (recentActivity.get(right.address.toLowerCase()) ?? 0) - (recentActivity.get(left.address.toLowerCase()) ?? 0) || right.reserve - left.reserve)
    .slice(0, 64)
  const candidates: Candidate[] = []
  const rejected = { cooldown: 0, liquidity: 0, activity: 0, pressure: 0, concentration: 0, volatility: 0, impact: 0, depth: 0, shock: 0, warmup: 0 }
  const rejectionDetails: string[] = []
  const reject = (market: Token, reason: string, category: keyof typeof rejected) => {
    rejected[category] += 1
    rejectionDetails.push(`${market.symbol}: ${reason}`)
  }
  log('SCAN', `${strategyMode === 'profit' ? 'Profit-first' : 'Rank-volume'} scan · ${marketsToReview.length}/${markets.length} pool snapshots · ${recentActivity.size} active tokens indexed`)

  for (const market of marketsToReview) {
    if (!market.graduated || market.poolTokenReserve <= 0 || market.supply <= 0) {
      reject(market, 'not a usable graduated pool', 'depth')
      continue
    }
    const key = market.address.toLowerCase()
    const tokenTrades = recentTrades.filter((trade) => trade.timestamp >= cutoff && trade.token.toLowerCase() === key)
    const priorHistory = signalHistory.get(key) ?? []
    // Hub events carry impact-sensitive average execution prices. Momentum must
    // be built only from timestamped reserve snapshots so trade size cannot
    // fake a move and profit mode cannot enter after a two-sample instant warmup.
    const sampledAt = Date.now()
    const history = [...priorHistory, { price: market.price, timestamp: sampledAt }]
      .filter((point) => sampledAt - point.timestamp <= 5 * 60_000)
      .slice(-12)
    signalHistory.set(key, history)

    const cooldown = cooldownTokens.get(key) ?? 0
    if (cooldown > 0) {
      cooldownTokens.set(key, cooldown - 1)
      reject(market, `${cooldown} cooldown scan${cooldown === 1 ? '' : 's'} remaining`, 'cooldown')
      continue
    }
    if (market.reserve < minLiquidityUSDC) {
      reject(market, `${market.reserve.toLocaleString('en-US', { maximumFractionDigits: 0 })} USDC below ${minLiquidityUSDC.toLocaleString()} minimum`, 'liquidity')
      continue
    }

    const poolTokenSharePct = market.poolTokenReserve / market.supply * 100
    const requiredSignalPoints = strategyMode === 'profit' ? 4 : 2
    const requiredObservationMs = strategyMode === 'profit' ? 60_000 : 10_000
    const observationMs = history.length > 1 ? history[history.length - 1].timestamp - history[0].timestamp : 0
    if (history.length < requiredSignalPoints || observationMs < requiredObservationMs) {
      reject(market, `reserve warmup ${history.length}/${requiredSignalPoints} samples · ${Math.floor(observationMs / 1_000)}/${requiredObservationMs / 1_000}s`, 'warmup')
      continue
    }

    const uniqueTraders = new Set(tokenTrades.map((trade) => trade.wallet.toLowerCase())).size
    const activityBuckets = new Set(tokenTrades.map((trade) => Math.floor((trade.timestamp - cutoff) / 120_000))).size
    const requiredActivityBuckets = strategyMode === 'profit' ? 3 : 2
    const maximumTradeAgeSeconds = strategyMode === 'profit' ? 180 : 600
    const latestTradeAt = tokenTrades.reduce((latest, trade) => Math.max(latest, trade.timestamp), 0)
    const tradeAgeSeconds = latestTradeAt > 0 ? Math.floor((Date.now() - latestTradeAt) / 1_000) : Number.POSITIVE_INFINITY
    if (tokenTrades.length < minRecentTrades || uniqueTraders < 2 || activityBuckets < requiredActivityBuckets || tradeAgeSeconds > maximumTradeAgeSeconds) {
      reject(market, `${tokenTrades.length}/${minRecentTrades} trades · ${uniqueTraders}/2 wallets · ${activityBuckets}/${requiredActivityBuckets} time buckets · latest ${Number.isFinite(tradeAgeSeconds) ? `${tradeAgeSeconds}s` : 'never'} (max ${maximumTradeAgeSeconds}s)`, 'activity')
      continue
    }

    const buyVolume = tokenTrades.filter((trade) => trade.type === 'BUY').reduce((total, trade) => total + trade.amount * trade.price, 0)
    const sellVolume = tokenTrades.filter((trade) => trade.type === 'SELL').reduce((total, trade) => total + trade.amount * trade.price, 0)
    const totalVolume = buyVolume + sellVolume
    if (sellVolume <= 0 || totalVolume <= 0) {
      reject(market, 'no recent verified sell flow', 'activity')
      continue
    }
    const buyPressurePct = buyVolume / totalVolume * 100
    if (buyPressurePct < minBuyPressurePct || buyPressurePct > maxBuyPressurePct) {
      reject(market, `${buyPressurePct.toFixed(0)}% buy pressure outside ${minBuyPressurePct}–${maxBuyPressurePct}% range`, 'pressure')
      continue
    }
    const walletFlows = new Map<string, number>()
    for (const trade of tokenTrades) {
      const wallet = trade.wallet.toLowerCase()
      walletFlows.set(wallet, (walletFlows.get(wallet) ?? 0) + trade.amount * trade.price)
    }
    const largestWalletFlowPct = Math.max(...walletFlows.values()) / totalVolume * 100
    if (largestWalletFlowPct > maxWalletFlowPct) {
      reject(market, `largest wallet drives ${largestWalletFlowPct.toFixed(0)}% of flow (maximum ${maxWalletFlowPct}%)`, 'concentration')
      continue
    }

    const firstPrice = history[0].price
    const prices = history.map((point) => point.price)
    const momentumPct = firstPrice > 0 ? (market.price - firstPrice) / firstPrice * 100 : 0
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const volatilityPct = minPrice > 0 ? (maxPrice - minPrice) / minPrice * 100 : 100
    const minimumMomentumPct = strategyMode === 'profit' ? 0.2 : -1
    if (momentumPct < minimumMomentumPct || momentumPct > maxMomentumPct || volatilityPct > maxVolatilityPct) {
      reject(market, `momentum ${momentumPct >= 0 ? '+' : ''}${momentumPct.toFixed(2)}% outside ${minimumMomentumPct.toFixed(1)}–${maxMomentumPct}% · volatility ${volatilityPct.toFixed(2)}%`, 'volatility')
      continue
    }

    const plan = buildSafeTradePlan(market, requestedSize, maxLiquiditySharePct, maxPriceImpactPct)
    if (!plan) {
      reject(market, 'intended entry or full-position exit exceeds configured size/impact limits', 'impact')
      continue
    }
    const sellShock = assessRecentSellShock(market, plan, tokenTrades)
    if (strategyMode === 'profit' && sellShock && sellShock.stressedLossPct > stopLossPct) {
      reject(
        market,
        `recent sell shock stress -${sellShock.stressedLossPct.toFixed(2)}% exceeds ${stopLossPct.toFixed(2)}% stop-loss · ${sellShock.largestSellUSDC.toLocaleString('en-US', { maximumFractionDigits: 0 })} USDC / ${sellShock.poolTokenSharePct.toFixed(1)}% of pool tokens`,
        'shock',
      )
      continue
    }
    // A tiny safe slice of a shallow pool may be executable, but it is not a
    // useful deadline rotation: it consumes wallet prompts while contributing
    // too little sampled turnover. Require at least half of the adaptive size.
    const minimumRankTurnover = Math.min(requestedSize, Math.max(2_500, requestedSize * 0.5))
    if (strategyMode === 'rank' && plan.size < minimumRankTurnover) {
      reject(market, `${plan.size.toFixed(0)} USDC executable size below ${minimumRankTurnover.toFixed(0)} rank-volume minimum`, 'impact')
      continue
    }
    const sellDepthMultiple = sellVolume / plan.size
    if (sellDepthMultiple < minSellDepthMultiple) {
      reject(market, `verified recent sells cover ${sellDepthMultiple.toFixed(2)}× intended position (minimum ${minSellDepthMultiple.toFixed(2)}×)`, 'depth')
      continue
    }

    const liquidityScore = clamp(10 + Math.log10(Math.max(1, market.reserve / minLiquidityUSDC)) * 12, 0, 25)
    const activityScore = clamp(tokenTrades.length * 1.5 + uniqueTraders * 2 + activityBuckets * 2 + (100 - largestWalletFlowPct) / 12, 0, 22)
    const pressureScore = clamp(16 - Math.abs(buyPressurePct - 70) * 0.6, 0, 16)
    const momentumScore = clamp(22 - Math.abs(momentumPct - 1.5) * 3, 0, 22)
    const worstImpactPct = Math.max(plan.priceImpactPct, plan.exitPriceImpactPct)
    const depthScore = clamp(10 - worstImpactPct / maxPriceImpactPct * 10, 0, 10)
    const reserveDiversityScore = clamp(poolTokenSharePct / 10, 0, 5)
    const executableSizeScore = requestedSize > 0 ? clamp(plan.size / requestedSize * 25, 0, 25) : 0
    const sellCoverageScore = clamp(sellDepthMultiple / Math.max(minSellDepthMultiple, 0.01) * 10, 0, 10)
    const score = strategyMode === 'rank'
      ? clamp(liquidityScore + clamp(activityScore, 0, 20) + clamp(pressureScore, 0, 10) + depthScore + executableSizeScore + sellCoverageScore, 0, 100)
      : clamp(liquidityScore + activityScore + pressureScore + momentumScore + depthScore + reserveDiversityScore, 0, 100)

    candidates.push({
      address: market.address,
      pair: market.pair,
      reserve: market.reserve,
      price: market.price,
      score,
      momentumPct,
      volatilityPct,
      buyPressurePct,
      recentTradeCount: tokenTrades.length,
      uniqueTraders,
      activityBuckets,
      sellDepthMultiple,
      largestWalletFlowPct,
      poolTokenSharePct,
      market,
      plan,
    })
  }

  if (rejectionDetails.length > 0) {
    const shown = rejectionDetails.slice(0, 12)
    const remainder = rejectionDetails.length - shown.length
    log('SCAN', `Rejected · ${shown.join(' | ')}${remainder > 0 ? ` | +${remainder} more (see gate summary)` : ''}`)
  }
  candidates.sort((left, right) => right.score - left.score)
  let best: ScannedToken | null = null
  for (const candidate of candidates.slice(0, 5)) {
    const safety = await validateGraduatedPoolSafety(publicClient, candidate.address, candidate.pair, liquidityLocks)
    if (!safety.protocolVerified) {
      log('WARN', `Rejected ${candidate.market.symbol} · Hub graduation or pair registry mismatch`)
      continue
    }
    if (safety.creatorHoldingPct > maxCreatorHoldingPct) {
      log('WARN', `Rejected ${candidate.market.symbol} · creator still holds ${safety.creatorHoldingPct.toFixed(1)}% (maximum ${maxCreatorHoldingPct}%)`)
      continue
    }
    if (safety.pct < minLiquidityLockPct) {
      log('WARN', `Rejected ${candidate.market.symbol} · LP self-lock ${safety.pct.toFixed(1)}% below ${minLiquidityLockPct}%`)
      continue
    }
    best = { ...candidate, liquidityLockPct: safety.pct, creatorHoldingPct: safety.creatorHoldingPct }
    break
  }

  if (best) {
    log('SCAN', `Selected ${best.market.symbol} · quality ${best.score.toFixed(0)}/100 · LP lock ${best.liquidityLockPct.toFixed(1)}% · creator ${best.creatorHoldingPct.toFixed(1)}%`)
    log('SCAN', `Signals · ${best.recentTradeCount} trades / ${best.uniqueTraders} wallets / ${best.activityBuckets} time buckets · buys ${best.buyPressurePct.toFixed(0)}% · sell coverage ${best.sellDepthMultiple.toFixed(2)}× · momentum ${best.momentumPct >= 0 ? '+' : ''}${best.momentumPct.toFixed(2)}%`)
    log('SCAN', `Executable depth · entry ${best.plan.priceImpactPct.toFixed(2)}% · full-position exit ${best.plan.exitPriceImpactPct.toFixed(2)}% · estimated round-trip cost ${(best.plan.size - best.plan.estimatedExitUSDC).toFixed(2)} USDC`)
  } else {
    const summary = Object.entries(rejected).filter(([, count]) => count > 0).map(([reason, count]) => `${reason} ${count}`).join(' · ')
    log('WAIT', `No pool passed the quality gate${summary ? ` · ${summary}` : ''}`)
  }
  return { best, scanned: marketsToReview.length, markets: marketsToReview }
}
