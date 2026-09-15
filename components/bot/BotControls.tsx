'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { useBotRunner } from '@/hooks/useBotRunner'
import { TokenBadge } from '@/components/shared/TokenBadge'
import { PnLDisplay } from '@/components/shared/PnLDisplay'
import { Icon } from '@/components/shared/Icons'
import { cn } from '@/lib/utils'

export function BotControls() {
  const { isConnected } = useAccount()
  const config = useTradeFarmStore((state) => state.botConfig)
  const status = useTradeFarmStore((state) => state.botStatus)
  const position = useTradeFarmStore((state) => state.botPosition)
  const nextActionAt = useTradeFarmStore((state) => state.botNextActionAt)
  const scanned = useTradeFarmStore((state) => state.botTokensScanned)
  const setConfig = useTradeFarmStore((state) => state.setBotConfig)
  const { startBot, stopBot } = useBotRunner()
  const [countdown, setCountdown] = useState(0)
  const running = status === 'running'

  useEffect(() => {
    const update = () => setCountdown(nextActionAt ? Math.max(0, Math.ceil((nextActionAt - Date.now()) / 1_000)) : 0)
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [nextActionAt])

  const numeric = (key: 'takeProfitPct' | 'stopLossPct' | 'slippagePct' | 'delaySeconds', value: string, min: number, max: number) => {
    setConfig({ [key]: Math.min(max, Math.max(min, Number(value))) })
  }

  return (
    <section className="panel overflow-hidden rounded-lg">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div><p className="panel-title text-[#a78bfa]">Automation</p><h1 className="mt-1 text-lg font-semibold">TradeFarm Bot</h1></div>
        <span className={cn('inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[9px] font-semibold tracking-wider', running ? 'border-success/30 bg-success/10 text-success' : status === 'error' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-border bg-bg-elevated text-text-secondary')}>
          <span className={cn('h-1.5 w-1.5 rounded-full', running ? 'animate-pulse-dot bg-success' : status === 'error' ? 'bg-danger' : 'bg-text-secondary')} /> {status.toUpperCase()}
        </span>
      </div>

      <div className="space-y-5 p-5">
        <fieldset disabled={running} className="space-y-5 disabled:opacity-60">
          <div>
            <div className="flex items-center justify-between"><label className="data-label">Trade size</label><span className="font-mono text-xs">{config.tradeSize.toLocaleString()} <span className="text-text-secondary">USDC</span></span></div>
            <input type="range" min="100" max="50000" step="100" value={config.tradeSize} onChange={(event) => setConfig({ tradeSize: Number(event.target.value) })} className="mt-3 w-full" />
            <div className="mt-1 flex justify-between font-mono text-[8px] text-text-secondary"><span>100</span><span>50,000</span></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Take profit" value={config.takeProfitPct} min={1} max={500} step={1} suffix="%" onChange={(value) => numeric('takeProfitPct', value, 1, 500)} />
            <NumberField label="Stop loss" value={config.stopLossPct} min={1} max={100} step={1} suffix="%" onChange={(value) => numeric('stopLossPct', value, 1, 100)} />
            <NumberField label="Slippage" value={config.slippagePct} min={0.1} max={10} step={0.1} suffix="%" onChange={(value) => numeric('slippagePct', value, 0.1, 10)} />
            <NumberField label="Loop delay" value={config.delaySeconds} min={10} max={300} step={1} suffix="SEC" onChange={(value) => numeric('delaySeconds', value, 10, 300)} />
          </div>

          <div>
            <label className="data-label">Token mode</label>
            <div className="mt-2 grid grid-cols-2 rounded-md bg-bg-primary p-1">
              <button type="button" onClick={() => setConfig({ mode: 'auto' })} className={cn('h-9 rounded text-[10px] font-semibold transition', config.mode === 'auto' ? 'bg-accent-primary/20 text-[#c4b5fd]' : 'text-text-secondary')}>AUTO-SCAN</button>
              <button type="button" onClick={() => setConfig({ mode: 'manual' })} className={cn('h-9 rounded text-[10px] font-semibold transition', config.mode === 'manual' ? 'bg-accent-primary/20 text-[#c4b5fd]' : 'text-text-secondary')}>MANUAL TOKEN</button>
            </div>
            {config.mode === 'manual' ? (
              <input value={config.manualToken} onChange={(event) => setConfig({ manualToken: event.target.value })} placeholder="0x… token address" className="input-terminal mt-2 h-10 text-[11px]" />
            ) : <p className="mt-2 text-[10px] leading-relaxed text-text-secondary">Scans every active bonding curve and chooses the highest risk-adjusted momentum score.</p>}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-5">
          <button type="button" onClick={startBot} disabled={!isConnected || running} className="flex h-11 items-center justify-center gap-2 rounded-md bg-success text-xs font-bold uppercase tracking-wider text-white transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-30"><Icon name="power" className="h-3.5 w-3.5" /> Start bot</button>
          <button type="button" onClick={stopBot} disabled={!running} className="flex h-11 items-center justify-center gap-2 rounded-md bg-danger text-xs font-bold uppercase tracking-wider text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-30"><span className="h-2.5 w-2.5 rounded-[2px] bg-white" /> Stop bot</button>
        </div>
        {!isConnected && <p className="text-center text-[10px] text-warning">Connect a wallet on Arc Testnet to enable execution.</p>}

        {running && position && (
          <div className="rounded-md border border-accent-primary/30 bg-accent-primary/5 p-4">
            <div className="flex items-center justify-between"><span className="panel-title">Current position</span><span className="flex items-center gap-1 font-mono text-[8px] text-success"><span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" /> MONITORING</span></div>
            <div className="mt-3 flex items-center gap-2"><TokenBadge symbol={position.symbol} /><div><p className="text-sm font-semibold">{position.symbol}</p><p className="font-mono text-[9px] text-text-secondary">{position.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} tokens</p></div></div>
            <div className="mt-4 grid grid-cols-3 gap-3"><Metric label="Entry" value={`$${position.entryPrice.toFixed(6)}`} /><Metric label="Current" value={`$${position.currentPrice.toFixed(6)}`} /><div><p className="data-label">PnL</p><PnLDisplay value={((position.currentPrice - position.entryPrice) / position.entryPrice) * 100} percent className="mt-1 block text-xs" /></div></div>
          </div>
        )}

        {running && (
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Next action" value={`${String(Math.floor(countdown / 60)).padStart(2, '0')}:${String(countdown % 60).padStart(2, '0')}`} />
            <MetricCard label="Tokens scanned" value={scanned.toLocaleString()} />
          </div>
        )}
      </div>
    </section>
  )
}

function NumberField({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: string) => void }) {
  return <label><span className="data-label">{label}</span><span className="relative mt-1.5 block"><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} className="input-terminal h-10 pr-10 text-xs" /><span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[8px] text-text-secondary">{suffix}</span></span></label>
}
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="data-label">{label}</p><p className="mt-1 font-mono text-xs">{value}</p></div> }
function MetricCard({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-border bg-bg-primary p-3"><p className="data-label">{label}</p><p className="mt-1 font-mono text-base">{value}</p></div> }
