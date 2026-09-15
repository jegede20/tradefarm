'use client'

import { useLayoutEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmiConfig'
import { useTokenDiscovery } from '@/hooks/useTokenDiscovery'
import { usePositionReconciliation } from '@/hooks/usePositionReconciliation'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { BotRunnerProvider } from './BotRunnerProvider'

function NetworkRuntime() {
  useTokenDiscovery()
  usePositionReconciliation()
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 2_000, refetchOnWindowFocus: false, retry: 2 },
    },
  }))

  // Hydrate persisted positions/history before child effects can publish live
  // network state and overwrite an older storage schema.
  useLayoutEffect(() => {
    void useTradeFarmStore.persist.rehydrate()
  }, [])

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BotRunnerProvider>
          <NetworkRuntime />
          {children}
        </BotRunnerProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
