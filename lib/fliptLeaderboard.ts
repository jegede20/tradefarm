import { formatUnits, isAddress, type Address } from 'viem'

const FLIPT_TOP_POSITIONS_URL = '/api/flipt-top-positions'
const REQUEST_TIMEOUT_MS = 2_500
const REFRESH_INTERVAL_MS = 20_000

// Last-good public board snapshot captured on 2026-09-16. It prevents a
// temporary Flipt API failure from hiding already-observed whale inventory;
// successful refreshes replace it immediately.
const LAST_VERIFIED_TOP_POSITIONS: Array<{ token: Address; rank: number; held: number }> = [
  { token: '0x2dde528a485adac5967af6aecdd1438b314f69d2', rank: 1, held: 998_415_675.071297 },
  { token: '0xee1ed6f0ffc91ae2742d652158fd47ac927769d2', rank: 2, held: 997_058_309.9435043 },
  { token: '0x0e6b69e045a280c3b63d5158b5f3a6e83b2069d2', rank: 3, held: 997_182_479.4713899 },
  { token: '0xcee5d3b45a5632cc02175ea500ea88ea3d5169d2', rank: 4, held: 999_727_093.3675388 },
  { token: '0x0fc09d63f4db129d72b31b5cf707cf28a45269d2', rank: 5, held: 997_051_601.2299961 },
  { token: '0xe8fd89670de6a289946f559a29f19e85ea3469d2', rank: 6, held: 835_486_523.0368351 },
  { token: '0x94321d6304421a4e34ff25654280a806b2ac69d2', rank: 7, held: 994_506_944.8410403 },
  { token: '0xa0b83c04b040e12a46e41e51fae1618c242b69d2', rank: 8, held: 927_951_927.9649137 },
  { token: '0x75d0451538603d9ac1750a66a5c0a46bb63269d2', rank: 10, held: 793_086_956.521739 },
  { token: '0xafcf11cdbfe6317df5294320699c570bb65769d2', rank: 11, held: 944_014_120.6943077 },
  { token: '0x187d52913c82c3528b2a625cea1d63e8396b69d2', rank: 12, held: 884_212_039.2047031 },
  { token: '0xd61e6065195e3fa4979a1c8c9cb1caec218b69d2', rank: 13, held: 996_700_815.0234337 },
  { token: '0x87d505e4d1748c1ad76c98f048d1bd7dac6369d2', rank: 14, held: 999_613_780.8433495 },
  { token: '0xc963c9b49ac81cfdfd17120c5dc438c4798e69d2', rank: 15, held: 995_641_156.0077606 },
  { token: '0x7ff539f13d7c2a3c2686637ec8cac6f67d6669d2', rank: 17, held: 999_994_582.242937 },
  { token: '0x455c373cae777fa33826291a1614fb58a49a69d2', rank: 18, held: 985_757_622.4323473 },
  { token: '0x0a8bee3e64b99ffd602ac520b99fbac9d77369d2', rank: 19, held: 999_986_454.8642899 },
  { token: '0xbd16d86da7b89d07b4cef1b5eb65bbbc439a69d2', rank: 21, held: 793_086_958.8762904 },
  { token: '0x6fc50b6c03cb5c4faebce283ea3761764f6e69d2', rank: 23, held: 997_363_308.9516855 },
  { token: '0x1382a63e77f66aab331f13d06a2b58f4dd6b69d2', rank: 24, held: 771_661_596.1973028 },
  { token: '0xc3fc2b349b12d74dace6dfb64be6a20f7d8569d2', rank: 28, held: 999_986_883.3590326 },
  { token: '0xb3e5094e3fed0031a131354bb63c0680d61669d2', rank: 29, held: 793_120_198.3725618 },
  { token: '0x31f45773d0098db25f80ce8bf78fbb56614469d2', rank: 30, held: 793_086_956.521739 },
]

export interface FliptTopPositionSnapshot {
  tokens: Address[]
  ranks: Map<string, number>
  largestHeldByToken: Map<string, number>
  updatedAt: number | null
}

let snapshot: FliptTopPositionSnapshot = {
  tokens: LAST_VERIFIED_TOP_POSITIONS.map((position) => position.token),
  ranks: new Map(LAST_VERIFIED_TOP_POSITIONS.map((position) => [position.token.toLowerCase(), position.rank])),
  largestHeldByToken: new Map(LAST_VERIFIED_TOP_POSITIONS.map((position) => [position.token.toLowerCase(), position.held])),
  updatedAt: null,
}
let activeRequest: Promise<FliptTopPositionSnapshot> | null = null

export function getFliptTopPositionSnapshot() {
  return snapshot
}

/**
 * Flipt's public board is only a discovery hint. Contract state, executable
 * entry/full-exit depth and creator/LP checks remain authoritative in the bot.
 */
export async function refreshFliptTopPositions(force = false) {
  if (!force && snapshot.updatedAt && Date.now() - snapshot.updatedAt < REFRESH_INTERVAL_MS) return snapshot
  if (activeRequest) return activeRequest

  activeRequest = (async () => {
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(FLIPT_TOP_POSITIONS_URL, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Flipt top positions returned HTTP ${response.status}`)
      const body = await response.json() as { rows?: Array<{ token?: unknown; phase?: unknown; held?: unknown }> }
      const tokens: Address[] = []
      const ranks = new Map<string, number>()
      const largestHeldByToken = new Map(snapshot.largestHeldByToken)
      for (const [index, row] of (Array.isArray(body.rows) ? body.rows.slice(0, 30) : []).entries()) {
        if (row.phase !== 'graduated' || typeof row.token !== 'string' || !isAddress(row.token)) continue
        const key = row.token.toLowerCase()
        if (!ranks.has(key)) {
          ranks.set(key, index + 1)
          tokens.push(row.token)
        }
        if (typeof row.held === 'string' && /^\d+$/.test(row.held)) {
          const held = Number(formatUnits(BigInt(row.held), 18))
          if (Number.isFinite(held)) largestHeldByToken.set(key, Math.max(largestHeldByToken.get(key) ?? 0, held))
        }
      }
      if (tokens.length > 0) {
        snapshot = { tokens, ranks, largestHeldByToken, updatedAt: Date.now() }
      }
      return snapshot
    } finally {
      globalThis.clearTimeout(timeout)
      activeRequest = null
    }
  })().catch(() => snapshot)

  return activeRequest
}
