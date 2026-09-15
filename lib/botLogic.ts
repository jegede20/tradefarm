import type { Address } from 'viem'
import type { LogLevel, Token } from '@/types/trading'

export interface TradePlan {
  size: number
  priceImpactPct: number
}

export interface ScannedToken {
  address: Address
  pair: Address
  reserve: number
  price: number
  score: number
  market: Token
  plan: TradePlan
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
  const size = Math.min(requestedSize, market.reserve * maxLiquiditySharePct / 100)
  if (size < 100 || market.price <= 0 || market.reserve <= 0 || market.poolTokenReserve <= 0) return null

  // Mirrors the conservative 1% pool input adjustment used by live quoting.
  const adjusted = size * 0.99
  const quotedTokens = adjusted * market.poolTokenReserve / (market.reserve + adjusted)
  const idealTokens = size / market.price
  const priceImpactPct = idealTokens > 0 ? Math.max(0, (1 - quotedTokens / idealTokens) * 100) : 100
  if (priceImpactPct > maxPriceImpactPct) return null
  return { size: Math.floor(size * 100) / 100, priceImpactPct }
}

export async function scanBestToken({
  markets,
  requestedSize,
  maxLiquiditySharePct,
  maxPriceImpactPct,
  previousPrices,
  cooldownTokens,
  log,
}: {
  markets: Token[]
  requestedSize: number
  maxLiquiditySharePct: number
  maxPriceImpactPct: number
  previousPrices: Map<string, number>
  cooldownTokens: Map<string, number>
  log: (level: LogLevel, message: string) => void
}) {
  // Market snapshots are maintained by the global WebSocket runtime. Reusing
  // them prevents every bot cycle from duplicating a large burst of RPC calls.
  const candidates = markets.slice(0, 32)
  log('SCAN', `Reviewing ${candidates.length} synced Flipt pools...`)

  let best: ScannedToken | null = null
  for (const market of candidates) {
    if (!market.graduated || market.reserve < 1_000 || market.poolTokenReserve <= 0) continue
    const key = market.address.toLowerCase()
    const cooldown = cooldownTokens.get(key) ?? 0
    if (cooldown > 0) {
      cooldownTokens.set(key, cooldown - 1)
      continue
    }

    const plan = buildSafeTradePlan(market, requestedSize, maxLiquiditySharePct, maxPriceImpactPct)
    if (!plan) continue
    const previousPrice = previousPrices.get(key) ?? market.price
    const priceChange = previousPrice > 0 ? (market.price - previousPrice) / previousPrice : 0
    const normalizedReserve = Math.min(market.reserve / 100_000, 1)
    const score = priceChange * 0.6 + normalizedReserve * 0.4
    previousPrices.set(key, market.price)
    if (!best || score > best.score) {
      best = { address: market.address, pair: market.pair, reserve: market.reserve, price: market.price, score, market, plan }
    }
  }

  if (best) {
    log('SCAN', `Selected ${best.market.symbol} · ${best.reserve.toLocaleString('en-US', { maximumFractionDigits: 0 })} USDC liquidity · ${best.plan.priceImpactPct.toFixed(2)}% impact`)
  }
  return { best, scanned: candidates.length, markets: candidates }
}
