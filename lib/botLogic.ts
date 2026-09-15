import { formatUnits, parseUnits, type Address, type PublicClient } from 'viem'
import { ROUTER_ABI, ROUTER_ADDRESS } from './contracts'
import type { LogLevel } from '@/types/trading'

export interface ScannedToken {
  address: Address
  reserve: bigint
  supply: bigint
  graduated: boolean
  price: number
  score: number
}

export function getMinimumOut(expectedOut: bigint, slippagePct: number) {
  const bps = BigInt(Math.max(0, 10_000 - Math.round(slippagePct * 100)))
  return (expectedOut * bps) / 10_000n
}

export async function scanBestToken({
  publicClient,
  previousPrices,
  cooldownTokens,
  log,
}: {
  publicClient: PublicClient
  previousPrices: Map<string, number>
  cooldownTokens: Map<string, number>
  log: (level: LogLevel, message: string) => void
}) {
  const total = await publicClient.readContract({ address: ROUTER_ADDRESS, abi: ROUTER_ABI, functionName: 'totalTokens' })
  log('SCAN', `Scanning ${total.toString()} tokens...`)

  const addresses = await Promise.all(
    Array.from({ length: Number(total) }, (_, index) => publicClient.readContract({
      address: ROUTER_ADDRESS,
      abi: ROUTER_ABI,
      functionName: 'getTokenByIndex',
      args: [BigInt(index)],
    })),
  )
  const states = await Promise.all(addresses.map((address) => publicClient.readContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: 'getBondingCurveState',
    args: [address],
  })))

  let best: ScannedToken | null = null
  for (let index = 0; index < addresses.length; index += 1) {
    const address = addresses[index]
    const [reserve, supply, graduated] = states[index]
    if (graduated || reserve < parseUnits('1000', 6) || supply === 0n) continue

    const cooldown = cooldownTokens.get(address.toLowerCase()) ?? 0
    if (cooldown > 0) {
      cooldownTokens.set(address.toLowerCase(), cooldown - 1)
      continue
    }

    const reserveUsdc = Number(formatUnits(reserve, 6))
    const supplyTokens = Number(formatUnits(supply, 18))
    const price = reserveUsdc / supplyTokens
    const previousPrice = previousPrices.get(address.toLowerCase()) ?? price
    const priceChange = previousPrice > 0 ? (price - previousPrice) / previousPrice : 0
    const normalizedReserve = Math.min(reserveUsdc / 100_000, 1)
    const score = priceChange * 0.6 + normalizedReserve * 0.4
    previousPrices.set(address.toLowerCase(), price)

    if (!best || score > best.score) best = { address, reserve, supply, graduated, price, score }
  }

  if (best) log('SCAN', `Best token: ${best.address.slice(0, 8)}…${best.address.slice(-4)} | score: ${best.score.toFixed(4)}`)
  return { best, scanned: addresses.length }
}
