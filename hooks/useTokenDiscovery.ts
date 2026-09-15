'use client'

import { useEffect, useRef } from 'react'
import {
  createPublicClient,
  formatUnits,
  isAddress,
  parseEventLogs,
  webSocket,
  type Address,
  type PublicClient,
} from 'viem'
import { arcTestnet } from '@/lib/chains'
import {
  CURVE_BUY_SELECTOR,
  ERC20_ABI,
  GRADUATE_SELECTOR,
  POOL_BUY_SELECTOR,
  ROUTER_ADDRESS,
  SELL_SELECTOR,
} from '@/lib/contracts'
import { getMarketSnapshot, loadRecentMarkets } from '@/lib/flipt'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'

function calldataAddress(input: `0x${string}`): Address | null {
  if (input.length < 74) return null
  const candidate = `0x${input.slice(34, 74)}`
  return isAddress(candidate) ? candidate : null
}

function calldataAmount(input: `0x${string}`, word: number) {
  const start = 10 + word * 64
  const value = input.slice(start, start + 64)
  return value.length === 64 ? BigInt(`0x${value}`) : 0n
}

export function useTokenDiscovery() {
  const reconnectTimer = useRef<number | null>(null)

  useEffect(() => {
    let stopped = false
    let attempt = 0
    let cleanups: Array<() => void> = []
    let lastSelectedRefresh = 0
    let lastMarketSync = 0
    const seenTransactions = new Set<string>()
    const store = useTradeFarmStore

    const updateMarket = async (client: PublicClient, tokenAddress: Address) => {
      const existing = store.getState().tokens.find((item) => item.address.toLowerCase() === tokenAddress.toLowerCase())
      const snapshot = await getMarketSnapshot(client, tokenAddress, existing?.pair, existing)
      store.getState().upsertToken(snapshot)
      return snapshot
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

      const healthy = () => {
        attempt = 0
        store.getState().setNetworkConnected(true)
      }

      const syncMarkets = async () => {
        try {
          const markets = await loadRecentMarkets(client, 12, store.getState().tokens)
          markets.forEach((market) => store.getState().upsertToken(market))
          healthy()
        } catch {
          // Keep the last verified snapshot; the block stream will retry.
        }
      }

      try {
        // Flipt emits Hub events for buys, sells, launches and graduations. We
        // resolve each event's transaction selector instead of pretending that
        // ERC-20 Transfer events are emitted by the Hub itself.
        const unwatchHub = client.watchEvent({
          address: ROUTER_ADDRESS,
          onLogs: (logs) => {
            healthy()
            for (const event of logs) {
              const txHash = event.transactionHash
              if (!txHash || seenTransactions.has(txHash)) continue
              seenTransactions.add(txHash)
              if (seenTransactions.size > 800) seenTransactions.delete(seenTransactions.values().next().value ?? '')

              void client.getTransaction({ hash: txHash }).then(async (transaction) => {
                const selector = transaction.input.slice(0, 10).toLowerCase()
                const isBuy = selector === POOL_BUY_SELECTOR || selector === CURVE_BUY_SELECTOR
                const isSell = selector === SELL_SELECTOR
                const isGraduate = selector === GRADUATE_SELECTOR
                if (!isBuy && !isSell && !isGraduate) return
                const tokenAddress = calldataAddress(transaction.input)
                if (!tokenAddress) return
                const market = await updateMarket(client, tokenAddress).catch(() => null)
                if (!market || isGraduate) return

                const receipt = await client.getTransactionReceipt({ hash: txHash })
                const transfers = parseEventLogs({ abi: ERC20_ABI, eventName: 'Transfer', logs: receipt.logs, strict: false })
                  .filter((log) => log.address.toLowerCase() === tokenAddress.toLowerCase())
                const walletTransfer = transfers.find((log) => isBuy
                  ? log.args.to?.toLowerCase() === transaction.from.toLowerCase()
                  : log.args.from?.toLowerCase() === transaction.from.toLowerCase()) ?? transfers[0]
                const amount = Number(formatUnits(walletTransfer?.args.value ?? 0n, 18))
                const inputRaw = calldataAmount(transaction.input, 1)
                const usdcVolume = isBuy ? Number(formatUnits(inputRaw, 6)) : amount * market.price

                store.getState().addRecentTrade({
                  id: txHash,
                  timestamp: Date.now(),
                  type: isBuy ? 'BUY' : 'SELL',
                  symbol: market.symbol,
                  token: tokenAddress,
                  amount,
                  price: market.price,
                  wallet: transaction.from,
                })
                store.getState().updateToken(tokenAddress, { volume: market.volume + usdcVolume })
                if (store.getState().selectedToken.toLowerCase() === tokenAddress.toLowerCase()) {
                  store.getState().addPricePoint({ time: Date.now(), price: market.price })
                }
              }).catch(() => undefined)
            }
          },
          onError: reconnect,
        })

        const unwatchBlocks = client.watchBlocks({
          emitOnBegin: true,
          onBlock: () => {
            healthy()
            const now = Date.now()
            if (now - lastSelectedRefresh >= 3_000) {
              lastSelectedRefresh = now
              const selected = store.getState().selectedToken
              if (isAddress(selected)) {
                void updateMarket(client, selected).then((market) => {
                  store.getState().addPricePoint({ time: now, price: market.price })
                }).catch(() => undefined)
              }
            }
            if (now - lastMarketSync >= 60_000) {
              lastMarketSync = now
              void syncMarkets()
            }
          },
          onError: reconnect,
        })
        cleanups.push(unwatchHub, unwatchBlocks)
        void syncMarkets()
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
