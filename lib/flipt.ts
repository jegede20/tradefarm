import { formatUnits, type Address, type PublicClient } from 'viem'
import { ERC20_ABI, PAIR_ABI, ROUTER_ABI, ROUTER_ADDRESS, TOKEN_METADATA_ABI, USDC_ADDRESS } from './contracts'
import type { Token } from '@/types/trading'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const POOL_FEE_BPS = 100n // Successful Flipt pool swaps price with a 1% input adjustment.

export function isZeroAddress(address?: string) {
  return !address || address.toLowerCase() === ZERO_ADDRESS
}

export function friendlyContractError(cause: unknown) {
  const raw = cause instanceof Error ? cause.message : String(cause)
  const firstLine = raw.split('\n')[0]?.trim()
  if (/user rejected|user denied/i.test(raw)) return 'Signature rejected in wallet.'
  if (/insufficient funds/i.test(raw)) return 'Insufficient USDC for the trade and network fee.'
  if (/allowance/i.test(raw)) return 'Token allowance is too low.'
  if (/reverted/i.test(raw)) return 'The Flipt contract rejected this call. Refresh market data and try again.'
  return firstLine || 'The request could not be completed.'
}

export async function getMarketSnapshot(
  publicClient: PublicClient,
  tokenAddress: Address,
  pairHint?: Address,
  previous?: Token,
): Promise<Token> {
  const pair = pairHint && !isZeroAddress(pairHint)
    ? pairHint
    : await publicClient.readContract({
        address: ROUTER_ADDRESS,
        abi: ROUTER_ABI,
        functionName: 'getPair',
        args: [tokenAddress, USDC_ADDRESS],
      })
  if (isZeroAddress(pair)) throw new Error('Token has not graduated to a tradeable pool')

  const [token0, reserves, symbol, name, totalSupply] = await Promise.all([
    publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token0' }),
    publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'getReserves' }),
    previous?.symbol
      ? Promise.resolve(previous.symbol)
      : publicClient.readContract({ address: tokenAddress, abi: TOKEN_METADATA_ABI, functionName: 'symbol' }).catch(() => `TKN${tokenAddress.slice(-3).toUpperCase()}`),
    previous?.name
      ? Promise.resolve(previous.name)
      : publicClient.readContract({ address: tokenAddress, abi: TOKEN_METADATA_ABI, functionName: 'name' }).catch(() => 'Flipt Token'),
    previous?.supply
      ? Promise.resolve(BigInt(Math.round(previous.supply)) * 10n ** 18n)
      : publicClient.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: 'totalSupply' }).catch(() => 0n),
  ])
  const [reserve0, reserve1] = reserves
  const usdcIsToken0 = token0.toLowerCase() === USDC_ADDRESS.toLowerCase()
  const usdcRaw = usdcIsToken0 ? reserve0 : reserve1
  const tokenRaw = usdcIsToken0 ? reserve1 : reserve0
  const reserve = Number(formatUnits(usdcRaw, 6))
  const poolTokenReserve = Number(formatUnits(tokenRaw, 18))
  const price = poolTokenReserve > 0 ? reserve / poolTokenReserve : 0
  const priorPrice = previous?.price ?? price

  return {
    address: tokenAddress,
    pair,
    symbol,
    name,
    price,
    priceChange24h: priorPrice > 0 ? ((price - priorPrice) / priorPrice) * 100 : 0,
    volume: previous?.volume ?? 0,
    reserve,
    poolTokenReserve,
    supply: Number(formatUnits(totalSupply, 18)),
    graduated: true,
    discoveredAt: previous?.discoveredAt ?? Date.now(),
  }
}

export async function loadRecentMarkets(publicClient: PublicClient, limit = 12, existing: Token[] = []) {
  const total = await publicClient.readContract({
    address: ROUTER_ADDRESS,
    abi: ROUTER_ABI,
    functionName: 'allPairsLength',
  })
  const count = Math.min(Number(total), limit)
  const start = Number(total) - count
  const pairs = await Promise.all(
    Array.from({ length: count }, (_, offset) => publicClient.readContract({
      address: ROUTER_ADDRESS,
      abi: ROUTER_ABI,
      functionName: 'allPairs',
      args: [BigInt(start + offset)],
    })),
  )

  const tokenPairs = await Promise.all(pairs.map(async (pair) => {
    const [token0, token1] = await Promise.all([
      publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token0' }),
      publicClient.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token1' }),
    ])
    return { pair, token: token0.toLowerCase() === USDC_ADDRESS.toLowerCase() ? token1 : token0 }
  }))

  const snapshots = await Promise.allSettled(
    tokenPairs.map(({ token, pair }) => getMarketSnapshot(
      publicClient,
      token,
      pair,
      existing.find((market) => market.address.toLowerCase() === token.toLowerCase()),
    )),
  )
  return snapshots.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []).reverse()
}

export async function getPairQuote(
  publicClient: PublicClient,
  tokenAddress: Address,
  pairAddress: Address,
  amountIn: bigint,
  isBuy: boolean,
) {
  const [token0, reserves] = await Promise.all([
    publicClient.readContract({ address: pairAddress, abi: PAIR_ABI, functionName: 'token0' }),
    publicClient.readContract({ address: pairAddress, abi: PAIR_ABI, functionName: 'getReserves' }),
  ])
  const [reserve0, reserve1] = reserves
  const usdcIsToken0 = token0.toLowerCase() === USDC_ADDRESS.toLowerCase()
  const reserveUsdc = usdcIsToken0 ? reserve0 : reserve1
  const reserveToken = usdcIsToken0 ? reserve1 : reserve0
  const reserveIn = isBuy ? reserveUsdc : reserveToken
  const reserveOut = isBuy ? reserveToken : reserveUsdc
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n
  const adjusted = amountIn * (10_000n - POOL_FEE_BPS) / 10_000n
  return adjusted * reserveOut / (reserveIn + adjusted)
}
