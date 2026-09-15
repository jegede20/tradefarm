import type { Address } from 'viem'
import type { LogLevel, Token } from '@/types/trading'

export interface ScannedToken {
  address: Address
  pair: Address
  reserve: number
  price: number
  score: number
  market: Token
}

export function getMinimumOut(expectedOut: bigint, slippagePct: number) {
  const bps = BigInt(Math.max(0, 10_000 - Math.round(slippagePct * 100)))
  return (expectedOut * bps) / 10_000n
}

export async function scanBestToken({
  markets,
  previousPrices,
  cooldownTokens,
  log,
}: {
  markets: Token[]
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

    const previousPrice = previousPrices.get(key) ?? market.price
    const priceChange = previousPrice > 0 ? (market.price - previousPrice) / previousPrice : 0
    const normalizedReserve = Math.min(market.reserve / 100_000, 1)
    const score = priceChange * 0.6 + normalizedReserve * 0.4
    previousPrices.set(key, market.price)
    if (!best || score > best.score) {
      best = { address: market.address, pair: market.pair, reserve: market.reserve, price: market.price, score, market }
    }
  }

  if (best) log('SCAN', `Selected ${best.market.symbol} · score ${best.score.toFixed(4)} · ${best.reserve.toLocaleString('en-US', { maximumFractionDigits: 0 })} USDC liquidity`)
  return { best, scanned: candidates.length, markets: candidates }
}
