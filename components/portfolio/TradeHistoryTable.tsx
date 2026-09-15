'use client'

import { useMemo, useState } from 'react'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { EmptyState } from '@/components/shared/EmptyState'
import { Icon } from '@/components/shared/Icons'
import { formatDateTime, formatPrice, truncateAddress } from '@/lib/formatters'
import type { TradeHistoryItem } from '@/types/trading'

type SortKey = keyof Pick<TradeHistoryItem, 'timestamp' | 'type' | 'symbol' | 'amountIn' | 'amountOut' | 'price'>

export function TradeHistoryTable() {
  const history = useTradeFarmStore((state) => state.tradeHistory)
  const [sortKey, setSortKey] = useState<SortKey>('timestamp')
  const [descending, setDescending] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const sorted = useMemo(() => [...history].sort((a, b) => {
    const left = a[sortKey]
    const right = b[sortKey]
    const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true })
    return descending ? -result : result
  }), [descending, history, sortKey])
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const rows = sorted.slice((page - 1) * pageSize, page * pageSize)

  const sort = (key: SortKey) => {
    if (sortKey === key) setDescending((value) => !value)
    else { setSortKey(key); setDescending(true) }
    setPage(1)
  }

  const headings: Array<{ label: string; key?: SortKey }> = [
    { label: 'Time', key: 'timestamp' }, { label: 'Type', key: 'type' }, { label: 'Token', key: 'symbol' },
    { label: 'Amount in', key: 'amountIn' }, { label: 'Amount out', key: 'amountOut' }, { label: 'Price', key: 'price' }, { label: 'Tx hash' },
  ]

  return (
    <section className="panel overflow-hidden rounded-lg">
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <div><h2 className="text-sm font-semibold">Trade history</h2><p className="mt-0.5 text-[10px] text-text-secondary">Confirmed transactions · saved locally</p></div>
        <span className="font-mono text-[9px] text-text-secondary">{history.length} TRADES</span>
      </div>
      {history.length === 0 ? <EmptyState title="No trade history yet" description="Confirmed buys and sells are persisted in this browser and will appear here." /> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead><tr className="border-b border-border bg-bg-primary/50">{headings.map((heading) => <th key={heading.label} className="px-4 py-2.5 text-[9px] font-medium uppercase tracking-wider text-text-secondary">{heading.key ? <button type="button" onClick={() => sort(heading.key!)} className="flex items-center gap-1 hover:text-text-primary">{heading.label}{sortKey === heading.key && <Icon name={descending ? 'arrowDown' : 'arrowUp'} className="h-2.5 w-2.5" />}</button> : heading.label}</th>)}</tr></thead>
              <tbody>{rows.map((trade) => <tr key={trade.id} className="border-b border-border/50 font-mono text-[10px] last:border-0 hover:bg-bg-elevated/40">
                <td className="px-4 py-3 text-text-secondary">{formatDateTime(trade.timestamp)}</td>
                <td className="px-4 py-3"><span className={`rounded border px-1.5 py-1 text-[8px] font-semibold ${trade.type === 'BUY' ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'}`}>{trade.type}</span></td>
                <td className="px-4 py-3 font-sans text-xs font-semibold">{trade.symbol}</td>
                <td className="px-4 py-3">{trade.amountIn}</td><td className="px-4 py-3">{trade.amountOut}</td><td className="px-4 py-3">{formatPrice(trade.price)}</td>
                <td className="px-4 py-3"><a href={`https://testnet.arcscan.app/tx/${trade.hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#a78bfa] hover:text-white">{truncateAddress(trade.hash, 7, 5)}<Icon name="external" className="h-3 w-3" /></a></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3"><span className="font-mono text-[9px] text-text-secondary">PAGE {page} / {pageCount}</span><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="button-secondary h-7 px-3 text-[9px]">PREV</button><button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount} className="button-secondary h-7 px-3 text-[9px]">NEXT</button></div></div>
        </>
      )}
    </section>
  )
}
