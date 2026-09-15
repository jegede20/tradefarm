'use client'

import { useMemo } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { formatPrice, formatTime } from '@/lib/formatters'

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: { time: number } }>
}

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.[0]) return null
  return (
    <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 shadow-xl">
      <p className="font-mono text-xs font-medium text-text-primary">{formatPrice(payload[0].value)}</p>
      <p className="mt-0.5 font-mono text-[9px] text-text-secondary">{formatTime(payload[0].payload.time)}</p>
    </div>
  )
}

export function PriceChart() {
  const history = useTradeFarmStore((state) => state.priceHistory)
  const domain = useMemo<[number, number]>(() => {
    const values = history.map((point) => point.price)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const padding = (max - min || max * 0.1) * 0.18
    return [Math.max(0, min - padding), max + padding]
  }, [history])

  return (
    <section className="h-[360px] border-b border-border px-2 pb-3 pt-3 sm:h-[410px] sm:px-4">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <h2 className="panel-title">Live price</h2>
          <span className="flex items-center gap-1.5 font-mono text-[9px] text-text-secondary"><span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" /> REAL-TIME</span>
        </div>
        <div className="flex gap-1 rounded border border-border bg-bg-primary p-0.5">
          {['1M', '5M', '15M', '1H'].map((range, index) => <span key={range} className={`rounded px-2 py-1 font-mono text-[9px] ${index === 1 ? 'bg-bg-elevated text-text-primary' : 'text-text-secondary'}`}>{range}</span>)}
        </div>
      </div>
      <ResponsiveContainer width="100%" height="92%">
        <LineChart data={history} margin={{ top: 12, right: 8, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="time"
            axisLine={false}
            tickLine={false}
            minTickGap={52}
            tickFormatter={(value: number) => formatTime(value, false)}
            tick={{ fill: '#6f6f7c', fontSize: 9, fontFamily: 'var(--font-geist-mono)' }}
          />
          <YAxis
            domain={domain}
            orientation="right"
            axisLine={false}
            tickLine={false}
            width={67}
            tickFormatter={(value: number) => formatPrice(value).replace('$', '')}
            tick={{ fill: '#6f6f7c', fontSize: 9, fontFamily: 'var(--font-geist-mono)' }}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#393945', strokeDasharray: '3 3' }} />
          <Line type="monotone" dataKey="price" stroke="#8b5cf6" strokeWidth={1.75} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  )
}
