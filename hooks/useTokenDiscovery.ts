'use client'

import { useEffect, useRef } from 'react'
import {
  createPublicClient,
  formatUnits,
  webSocket,
  type Address,
  type PublicClient,
} from 'viem'
import { arcTestnet } from '@/lib/chains'
import { ERC20_ABI, ROUTER_ABI, ROUTER_ADDRESS, TOKEN_METADATA_ABI } from '@/lib/contracts'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'

function tokenPrice(reserve: bigint, supply: bigint) {
  const reserveUsdc = Number(formatUnits(reserve, 6))
  const tokenSupply = Number(formatUnits(supply, 18))
  return tokenSupply > 0 ? reserveUsdc / tokenSupply : 0
}

export function useTokenDiscovery() {
  const reconnectTimer = useRef<number | null>(null)

  useEffect(() => {
    let stopped = false
    let attempt = 0
    let cleanups: Array<() => void> = []
    let lastPriceUpdate = 0
    const seenTransactions = new Set<string>()
    const watchedTokenAddresses = new Set<string>()

    const store = useTradeFarmStore

    const fetchToken = async (client: PublicClient, tokenAddress: Address) => {
      const state = await client.readContract({
        address: ROUTER_ADDRESS,
        abi: ROUTER_ABI,
        functionName: 'getBondingCurveState',
        args: [tokenAddress],
      })
      const [reserve, supply, graduated] = state
      const existing = store.getState().tokens.find((item) => item.address.toLowerCase() === tokenAddress.toLowerCase())
      const [symbol, name] = await Promise.all([
        client.readContract({ address: tokenAddress, abi: TOKEN_METADATA_ABI, functionName: 'symbol' }).catch(() => existing?.symbol ?? `TKN${tokenAddress.slice(-3).toUpperCase()}`),
        client.readContract({ address: tokenAddress, abi: TOKEN_METADATA_ABI, functionName: 'name' }).catch(() => existing?.name ?? 'Arc Token'),
      ])
      const price = tokenPrice(reserve, supply)
      store.getState().upsertToken({
        address: tokenAddress,
        symbol,
        name,
        price,
        priceChange24h: existing?.price ? ((price - existing.price) / existing.price) * 100 : 0,
        volume: existing?.volume ?? 0,
        reserve: Number(formatUnits(reserve, 6)),
        supply: Number(formatUnits(supply, 18)),
        graduated,
        discoveredAt: existing?.discoveredAt ?? Date.now(),
      })
      return { price, symbol }
    }

    const fetchLatest = async (client: PublicClient) => {
      const total = await client.readContract({ address: ROUTER_ADDRESS, abi: ROUTER_ABI, functionName: 'totalTokens' })
      if (total === 0n) return
      const tokenAddress = await client.readContract({
        address: ROUTER_ADDRESS,
        abi: ROUTER_ABI,
        functionName: 'getTokenByIndex',
        args: [total - 1n],
      })
      await fetchToken(client, tokenAddress)
    }

    const connect = () => {
      if (stopped) return
      cleanups.forEach((cleanup) => cleanup())
      cleanups = []

      const client = createPublicClient({
        chain: arcTestnet,
        transport: webSocket('wss://rpc.testnet.arc.io', {
          reconnect: { attempts: 1, delay: 500 },
          retryCount: 1,
        }),
      })
      watchedTokenAddresses.clear()

      const watchMarketToken = (tokenAddress: Address) => {
        const key = tokenAddress.toLowerCase()
        if (watchedTokenAddresses.has(key)) return
        watchedTokenAddresses.add(key)
        const unwatch = client.watchContractEvent({
          address: tokenAddress,
          abi: ERC20_ABI,
          eventName: 'Transfer',
          onLogs: (logs) => {
            for (const event of logs) {
              const txHash = event.transactionHash
              if (!txHash || seenTransactions.has(txHash)) continue
              void client.getTransaction({ hash: txHash }).then(async (transaction) => {
                const selector = transaction.input.slice(0, 10).toLowerCase()
                if (selector !== '0xc3b88b53' && selector !== '0xcf6bc454') return
                seenTransactions.add(txHash)
                if (seenTransactions.size > 600) seenTransactions.delete(seenTransactions.values().next().value ?? '')
                const latest = await fetchToken(client, tokenAddress).catch(() => null)
                const token = store.getState().tokens.find((item) => item.address.toLowerCase() === key)
                if (!token) return
                const amount = Number(formatUnits(event.args.value ?? 0n, 18))
                const type = selector === '0xc3b88b53' ? 'BUY' : 'SELL'
                const price = latest?.price ?? token.price
                store.getState().addRecentTrade({
                  id: txHash,
                  timestamp: Date.now(),
                  type,
                  symbol: token.symbol,
                  token: tokenAddress,
                  amount,
                  price,
                  wallet: transaction.from,
                })
                store.getState().addPricePoint({ time: Date.now(), price })
                store.getState().updateToken(tokenAddress, { volume: token.volume + amount * price })
              }).catch(() => undefined)
            }
          },
          onError: reconnect,
        })
        cleanups.push(unwatch)
      }

      const syncTokenWatchers = () => {
        store.getState().tokens.forEach((token) => watchMarketToken(token.address))
      }

      const reconnect = () => {
        if (stopped || reconnectTimer.current) return
        store.getState().setNetworkConnected(false)
        const delay = Math.min(1_000 * 2 ** attempt, 30_000)
        attempt += 1
        reconnectTimer.current = window.setTimeout(() => {
          reconnectTimer.current = null
          connect()
        }, delay)
      }

      const onHealthy = () => {
        attempt = 0
        store.getState().setNetworkConnected(true)
      }

      try {
        // The router-level Transfer stream is the canonical new-token discovery trigger.
        const unwatchRouter = client.watchContractEvent({
          address: ROUTER_ADDRESS,
          abi: ERC20_ABI,
          eventName: 'Transfer',
          onLogs: () => {
            onHealthy()
            void fetchLatest(client).then(syncTokenWatchers).catch(reconnect)
          },
          onError: reconnect,
        })

        syncTokenWatchers()
        void fetchLatest(client).then(syncTokenWatchers).catch(() => undefined)

        // Blocks also refresh the selected curve so the chart stays live between discoveries.
        const unwatchBlocks = client.watchBlocks({
          emitOnBegin: true,
          onBlock: async () => {
            onHealthy()
            const now = Date.now()
            if (now - lastPriceUpdate < 2_000) return
            lastPriceUpdate = now
            const selected = store.getState().selectedToken
            if (!selected) return
            try {
              const result = await fetchToken(client, selected as Address)
              store.getState().addPricePoint({ time: now, price: result.price })
            } catch {
              // Seed data remains visible if a locally selected token is not deployed on Arc.
            }
          },
          onError: reconnect,
        })
        cleanups.push(unwatchRouter, unwatchBlocks)
      } catch {
        reconnect()
      }
    }

    connect()
    return () => {
      stopped = true
      cleanups.forEach((cleanup) => cleanup())
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
  }, [])
}
