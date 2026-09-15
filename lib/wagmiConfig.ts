import { createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { fallback, http, webSocket } from 'viem'
import { arcTestnet } from './chains'
import { ARC_HTTP_RPC_URLS, ARC_WS_RPC_URLS } from './rpc'

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [arcTestnet.id]: fallback([
      ...ARC_WS_RPC_URLS.map((url) => webSocket(url, {
        reconnect: { attempts: 3, delay: 750 },
        retryCount: 1,
      })),
      ...ARC_HTTP_RPC_URLS.map((url) => http(url, {
        retryCount: 1,
        retryDelay: 350,
        timeout: 15_000,
      })),
    ], { rank: false }),
  },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
