'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'

interface Eip1193Provider {
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown> | unknown
}

type SessionCapabilityState = 'checking' | 'advertised' | 'unavailable' | 'disconnected'

export function useSessionCapabilities() {
  const { address, chainId, connector, isConnected } = useAccount()
  const [state, setState] = useState<SessionCapabilityState>('disconnected')
  const [detail, setDetail] = useState('Connect a wallet to check scoped-session support.')

  useEffect(() => {
    let cancelled = false
    if (!isConnected || !address || !connector) {
      setState('disconnected')
      setDetail('Connect a wallet to check scoped-session support.')
      return
    }

    setState('checking')
    setDetail('Checking the connected wallet without requesting a signature…')
    void (async () => {
      try {
        const rawProvider = await connector.getProvider({ chainId })
        const provider = rawProvider as Eip1193Provider
        if (!provider || typeof provider.request !== 'function') throw new Error('Wallet provider is unavailable')
        const capabilities = await provider.request({ method: 'wallet_getCapabilities', params: [address] })
        if (cancelled) return
        const serialized = JSON.stringify(capabilities ?? {}).toLowerCase()
        const advertisesScopedPermission = /session|permission|delegat|7702|7715/.test(serialized)
        if (advertisesScopedPermission) {
          setState('advertised')
          setDetail('The wallet advertises a delegation or permission capability. A scoped Arc bundler session must still be configured and explicitly approved.')
        } else {
          setState('unavailable')
          setDetail('The wallet does not advertise a scoped session/delegation capability for this connection. Every approval, buy and sell remains wallet-confirmed.')
        }
      } catch {
        if (cancelled) return
        setState('unavailable')
        setDetail('The wallet does not expose wallet_getCapabilities here. TradeFarm cannot securely bypass its confirmation prompts.')
      }
    })()

    return () => { cancelled = true }
  }, [address, chainId, connector, isConnected])

  return { state, detail }
}
