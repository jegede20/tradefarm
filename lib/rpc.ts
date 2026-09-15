import { fallback, http } from 'viem'

export const ARC_HTTP_RPC_URLS = [
  'https://rpc.blockdaemon.testnet.arc.io',
  'https://rpc.testnet.arc.io',
  'https://rpc.drpc.testnet.arc.io',
  'https://rpc.quicknode.testnet.arc.io',
] as const

export const ARC_WS_RPC_URLS = [
  'wss://rpc.testnet.arc.io',
  'wss://rpc.drpc.testnet.arc.io',
  'wss://rpc.quicknode.testnet.arc.io',
  'wss://rpc.blockdaemon.testnet.arc.io/websocket',
] as const

export function createArcHttpTransport(timeout = 15_000) {
  // Keep each provider attempt single-shot. Viem advances through this ordered
  // fallback list on a rate limit/outage, while callers retain bounded backoff
  // around the complete operation.
  return fallback(ARC_HTTP_RPC_URLS.map((url) => http(url, {
    retryCount: 0,
    timeout,
  })), { rank: false })
}

export function isTransientArcRpcError(cause: unknown) {
  const messages: string[] = []
  let current: unknown = cause
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (current instanceof Error) {
      messages.push(current.message)
      current = (current as Error & { cause?: unknown }).cause
    } else {
      messages.push(String(current))
      break
    }
  }
  return /http request failed|failed to fetch|fetch failed|network error|timeout|timed out|socket|429|rate.?limit|request limit|limit exceeded|-32005|-32011|-32014|econn|temporarily unavailable/i.test(messages.join(' '))
}
