import { createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { fallback, http, webSocket } from 'viem'
import { arcTestnet } from './chains'

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [arcTestnet.id]: fallback([
      webSocket('wss://rpc.testnet.arc.io', {
        reconnect: { attempts: 12, delay: 1_000 },
        retryCount: 3,
      }),
      http('https://rpc.testnet.arc.io', { retryCount: 3, retryDelay: 500 }),
    ]),
  },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
