import { NextResponse } from 'next/server'

const UPSTREAM_URL = 'https://api-testnet.flipt.fun/leaderboard?kind=positions&limit=30'
const UPSTREAM_TIMEOUT_MS = 2_000

let lastGoodResponse: { rows: unknown[] } | null = null

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const response = await fetch(`${UPSTREAM_URL}&t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'user-agent': 'TradeFarm/1.0',
      },
      signal: controller.signal,
    })
    if (response.ok) {
      const body = await response.json() as { rows?: unknown[] }
      if (Array.isArray(body.rows) && body.rows.length > 0) {
        lastGoodResponse = { rows: body.rows.slice(0, 30) }
        return NextResponse.json(lastGoodResponse, {
          headers: { 'cache-control': 'public, s-maxage=20, stale-while-revalidate=300' },
        })
      }
    }
  } catch {
    // The browser keeps a checked last-good board snapshot. This server-side
    // proxy exists so temporary Flipt worker failures never surface as CORS
    // errors or block the independent on-chain scan.
  } finally {
    clearTimeout(timeout)
  }

  return NextResponse.json(lastGoodResponse ?? { rows: [] }, {
    headers: { 'cache-control': 'no-store' },
  })
}
