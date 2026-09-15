import { isAddress, type Address, type PublicClient } from 'viem'
import { getMarketSnapshot } from './flipt'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'

/**
 * Resolve the live Hub-registered pool instead of trusting transient or
 * persisted pair metadata. The resolved pair is written back so the next
 * render can display and reconcile the position without losing its market.
 */
export async function resolveStoredMarket(publicClient: PublicClient, token: string, wallet?: Address) {
  if (!isAddress(token)) throw new Error('Enter a valid token address')
  const tokenAddress = token as Address
  const state = useTradeFarmStore.getState()
  const known = state.tokens.find((item) => item.address.toLowerCase() === tokenAddress.toLowerCase())
  const market = await getMarketSnapshot(publicClient, tokenAddress, undefined, known)
  state.upsertToken(market)
  state.setStoredPair(tokenAddress, market.pair, wallet)
  return market
}
