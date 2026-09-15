import type { TradeHistoryItem } from '@/types/trading'

interface CostLedger {
  amount: number
  cost: number
}

export function calculateRealizedPnl(history: TradeHistoryItem[]) {
  const ledgers = new Map<string, CostLedger>()
  let realizedPnl = 0
  let matchedSells = 0

  for (const trade of [...history].sort((left, right) => (Number(left?.timestamp) || 0) - (Number(right?.timestamp) || 0))) {
    // Older TradeFarm browser schemas may contain history rows without token
    // ownership metadata. Keep rendering those rows, but exclude them from
    // cost-basis math instead of crashing portfolio hydration.
    if (!trade || typeof trade.token !== 'string' || !trade.token) continue
    const key = trade.token.toLowerCase()
    const amountIn = Number(trade.amountIn)
    const amountOut = Number(trade.amountOut)
    if (!Number.isFinite(amountIn) || !Number.isFinite(amountOut) || amountIn <= 0 || amountOut <= 0) continue
    const ledger = ledgers.get(key) ?? { amount: 0, cost: 0 }

    if (trade.type === 'BUY') {
      ledger.amount += amountOut
      ledger.cost += amountIn
      ledgers.set(key, ledger)
      continue
    }

    if (ledger.amount <= 0 || ledger.cost < 0) continue
    const matchedAmount = Math.min(amountIn, ledger.amount)
    if (matchedAmount <= 0) continue
    const matchedRatio = matchedAmount / amountIn
    const costRatio = matchedAmount / ledger.amount
    const matchedProceeds = amountOut * matchedRatio
    const matchedCost = ledger.cost * costRatio
    realizedPnl += matchedProceeds - matchedCost
    matchedSells += 1
    ledger.amount -= matchedAmount
    ledger.cost -= matchedCost
    if (ledger.amount <= 1e-12) ledgers.delete(key)
    else ledgers.set(key, ledger)
  }

  return { realizedPnl, matchedSells }
}
