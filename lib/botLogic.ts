import type { Address, PublicClient } from 'viem'
import { ERC20_ABI, ROUTER_ABI, ROUTER_ADDRESS } from './contracts'
import type { LogLevel, RecentTrade, Token } from '@/types/trading'

export interface TradePlan {
  size: number
  priceImpactPct: number
  exitPriceImpactPct: number
  estimatedExitUSDC: number
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
  largestWalletFlowPct: number
  poolTokenSharePct: number
  liquidityLockPct: number
  creatorHoldingPct: number
  market: Token
  plan: TradePlan
}

interface Candidate extends Omit<ScannedToken, 'liquidityLockPct' | 'creatorHoldingPct'> {}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

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

  // Mirror the pair's conservative 1% input adjustment in both directions.
  // The second leg proves that the complete intended position can be quoted
  // back out against post-entry reserves, replacing a fixed token-supply proxy.
  const adjustedUSDCIn = size * 0.99
  const quotedTokens = adjustedUSDCIn * market.poolTokenReserve / (market.reserve + adjustedUSDCIn)
  const idealTokens = size / market.price
  const priceImpactPct = idealTokens > 0 ? Math.max(0, (1 - quotedTokens / idealTokens) * 100) : 100
  const postUSDCReserve = market.reserve + adjustedUSDCIn
  const postTokenReserve = market.poolTokenReserve - quotedTokens
  const adjustedTokenIn = quotedTokens * 0.99
  const estimatedExitUSDC = postTokenReserve > 0
    ? adjustedTokenIn * postUSDCReserve / (postTokenReserve + adjustedTokenIn)
    : 0
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
  minLiquidityUSDC,
  minRecentTrades,
  minBuyPressurePct,
  minLiquidityLockPct,
  maxCreatorHoldingPct,
  maxWalletFlowPct,
  maxMomentumPct,
  maxVolatilityPct,
  maxLiquiditySharePct,
  maxPriceImpactPct,
  signalHistory,
  liquidityLocks,
  cooldownTokens,
  log,
}: {
  publicClient: PublicClient
  markets: Token[]
  recentTrades: RecentTrade[]
  requestedSize: number
  minLiquidityUSDC: number
  minRecentTrades: number
  minBuyPressurePct: number
  minLiquidityLockPct: number
  maxCreatorHoldingPct: number
  maxWalletFlowPct: number
  maxMomentumPct: number
  maxVolatilityPct: number
  maxLiquiditySharePct: number
  maxPriceImpactPct: number
  signalHistory: Map<string, number[]>
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
  const rejected = { cooldown: 0, liquidity: 0, activity: 0, pressure: 0, concentration: 0, volatility: 0, impact: 0, depth: 0, warmup: 0 }
  const rejectionDetails: string[] = []
  const reject = (market: Token, reason: string, category: keyof typeof rejected) => {
    rejected[category] += 1
    rejectionDetails.push(`${market.symbol}: ${reason}`)
  }
  log('SCAN', `Quality scan · ${marketsToReview.length}/${markets.length} pool snapshots · ${recentActivity.size} active tokens indexed`)

  for (const market of marketsToReview) {
    if (!market.graduated || market.poolTokenReserve <= 0 || market.supply <= 0) {
      reject(market, 'not a usable graduated pool', 'depth')
      continue
    }
    const key = market.address.toLowerCase()
    const tokenTrades = recentTrades.filter((trade) => trade.timestamp >= cutoff && trade.token.toLowerCase() === key)
    const priorHistory = signalHistory.get(key) ?? []
    // Hub events carry impact-sensitive average execution prices. Momentum must
    // be built only from reserve snapshots so trade size cannot fake a move.
    const history = [...priorHistory, market.price].slice(-6)
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
    if (history.length < 2) {
      reject(market, 'warming up signal history (1/2)', 'warmup')
      continue
    }

    const uniqueTraders = new Set(tokenTrades.map((trade) => trade.wallet.toLowerCase())).size
    if (tokenTrades.length < minRecentTrades || uniqueTraders < 2) {
      reject(market, `${tokenTrades.length}/${minRecentTrades} recent trades · ${uniqueTraders}/2 wallets`, 'activity')
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
    if (buyPressurePct < minBuyPressurePct) {
      reject(market, `${buyPressurePct.toFixed(0)}% buy pressure below ${minBuyPressurePct}%`, 'pressure')
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

    const firstPrice = history[0]
    const momentumPct = firstPrice > 0 ? (market.price - firstPrice) / firstPrice * 100 : 0
    const minPrice = Math.min(...history)
    const maxPrice = Math.max(...history)
    const volatilityPct = minPrice > 0 ? (maxPrice - minPrice) / minPrice * 100 : 100
    if (momentumPct < -1 || momentumPct > maxMomentumPct || volatilityPct > maxVolatilityPct) {
      reject(market, `momentum ${momentumPct >= 0 ? '+' : ''}${momentumPct.toFixed(2)}% · volatility ${volatilityPct.toFixed(2)}%`, 'volatility')
      continue
    }

    const plan = buildSafeTradePlan(market, requestedSize, maxLiquiditySharePct, maxPriceImpactPct)
    if (!plan) {
      reject(market, 'intended entry or full-position exit exceeds configured size/impact limits', 'impact')
      continue
    }

    const liquidityScore = clamp(12 + Math.log10(Math.max(1, market.reserve / minLiquidityUSDC)) * 14, 0, 28)
    const activityScore = clamp(tokenTrades.length * 2 + uniqueTraders * 2 + (100 - largestWalletFlowPct) / 10, 0, 22)
    const pressureScore = clamp((buyPressurePct - 50) / 50 * 22, 0, 22)
    const momentumScore = momentumPct >= 0
      ? clamp(18 - Math.abs(momentumPct - 1.5) * 2.5, 3, 18)
      : clamp(8 + momentumPct * 5, 0, 8)
    const worstImpactPct = Math.max(plan.priceImpactPct, plan.exitPriceImpactPct)
    const depthScore = clamp(10 - worstImpactPct / maxPriceImpactPct * 10, 0, 10)
    const reserveDiversityScore = clamp(poolTokenSharePct / 10, 0, 5)
    const score = clamp(liquidityScore + activityScore + pressureScore + momentumScore + depthScore + reserveDiversityScore, 0, 100)

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
    log('SCAN', `Signals · ${best.recentTradeCount} trades / ${best.uniqueTraders} wallets · buys ${best.buyPressurePct.toFixed(0)}% · largest flow ${best.largestWalletFlowPct.toFixed(0)}% · momentum ${best.momentumPct >= 0 ? '+' : ''}${best.momentumPct.toFixed(2)}%`)
    log('SCAN', `Executable depth · entry ${best.plan.priceImpactPct.toFixed(2)}% · full-position exit ${best.plan.exitPriceImpactPct.toFixed(2)}% estimated impact`)
  } else {
    const summary = Object.entries(rejected).filter(([, count]) => count > 0).map(([reason, count]) => `${reason} ${count}`).join(' · ')
    log('WAIT', `No pool passed the quality gate${summary ? ` · ${summary}` : ''}`)
  }
  return { best, scanned: marketsToReview.length, markets: marketsToReview }
}
