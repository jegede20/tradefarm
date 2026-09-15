'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmiConfig'
import { useTokenDiscovery } from '@/hooks/useTokenDiscovery'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'

function NetworkRuntime() {
  useTokenDiscovery()
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 2_000, refetchOnWindowFocus: false, retry: 2 },
    },
  }))

  useEffect(() => {
    void useTradeFarmStore.persist.rehydrate()
  }, [])

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <NetworkRuntime />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
