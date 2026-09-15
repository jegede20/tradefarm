'use client'

import { useEffect, useState } from 'react'
import { formatUnits } from 'viem'
import { useAccount, useReadContract } from 'wagmi'
import { useTradeFarmStore } from '@/store/useTradeFarmStore'
import { useBotRunnerControls } from '@/providers/BotRunnerProvider'
import { TokenBadge } from '@/components/shared/TokenBadge'
import { PnLDisplay } from '@/components/shared/PnLDisplay'
import { Icon } from '@/components/shared/Icons'
import { cn } from '@/lib/utils'
import { ERC20_ABI, USDC_ADDRESS } from '@/lib/contracts'

export function BotControls() {
  const { address, isConnected } = useAccount()
  const config = useTradeFarmStore((state) => state.botConfig)
  const status = useTradeFarmStore((state) => state.botStatus)
  const storedPosition = useTradeFarmStore((state) => state.botPosition)
  const tokens = useTradeFarmStore((state) => state.tokens)
  const position = address && storedPosition && (!storedPosition.wallet || storedPosition.wallet.toLowerCase() === address.toLowerCase()) ? storedPosition : null
  const nextActionAt = useTradeFarmStore((state) => state.botNextActionAt)
  const scanned = useTradeFarmStore((state) => state.botTokensScanned)
  const realizedPnl = useTradeFarmStore((state) => state.botRealizedPnl)
  const sessionVolume = useTradeFarmStore((state) => state.botSessionVolume)
  const completedTrades = useTradeFarmStore((state) => state.botCompletedTrades)
  const consecutiveLosses = useTradeFarmStore((state) => state.botConsecutiveLosses)
  const sessionStartedAt = useTradeFarmStore((state) => state.botSessionStartedAt)
  const leaderboardRank = useTradeFarmStore((state) => state.botLeaderboardRank)
  const setConfig = useTradeFarmStore((state) => state.setBotConfig)
  const { startBot, stopBot, leaderboardSource, leaderboardLoading } = useBotRunnerControls()
  const { data: usdcRaw } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 4_000 },
  })
  const [countdown, setCountdown] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const running = status === 'running'
  const positionPrice = position
    ? running ? position.currentPrice : tokens.find((token) => token.address.toLowerCase() === position.token.toLowerCase())?.price ?? position.currentPrice
    : 0
  const availableUsdc = usdcRaw === undefined ? null : Number(formatUnits(usdcRaw, 6))
  const balanceTooLow = availableUsdc !== null && availableUsdc < 100

  useEffect(() => {
    const update = () => {
      setCountdown(nextActionAt ? Math.max(0, Math.ceil((nextActionAt - Date.now()) / 1_000)) : 0)
      setElapsed(sessionStartedAt ? Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1_000)) : 0)
    }
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [nextActionAt, sessionStartedAt])

  const deadlineValue = config.deadline
    ? new Date(config.deadline - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    : ''

  return (
    <section className="panel overflow-hidden rounded-lg">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div><p className="panel-title text-[#a78bfa]">Risk-filtered rotation engine</p><h1 className="mt-1 text-lg font-semibold">TradeFarm Bot</h1></div>
        <span className={cn('inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[9px] font-semibold tracking-wider', running ? 'border-success/30 bg-success/10 text-success' : status === 'error' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-border bg-bg-elevated text-text-secondary')}>
          <span className={cn('h-1.5 w-1.5 rounded-full', running ? 'animate-pulse-dot bg-success' : status === 'error' ? 'bg-danger' : 'bg-text-secondary')} /> {status.toUpperCase()}
        </span>
      </div>

      <div className="space-y-5 p-5">
        <div className="rounded-md border border-warning/25 bg-warning/5 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3"><span className="panel-title text-warning">Signing mode</span><span className="font-mono text-[8px] text-warning">WALLET-CONFIRMED</span></div>
          <p className="mt-1.5 text-[9px] leading-relaxed text-text-secondary">The scanner and position manager run in this tab, but each approval, buy and sell still needs confirmation in the connected wallet. Same-address unattended signing cannot be activated in this build until a compatible wallet and bundler can grant and execute a scoped, expiring Arc session. TradeFarm never asks for your private key or seed phrase.</p>
        </div>
        {position && (
          <div className={cn('rounded-md border p-4', running ? 'border-accent-primary/30 bg-accent-primary/5' : 'border-warning/30 bg-warning/5')}>
            <div className="flex items-center justify-between gap-3"><span className="panel-title">Current position</span><span className={cn('flex items-center gap-1 text-right font-mono text-[8px]', running ? 'text-success' : 'text-warning')}><span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', running ? 'animate-pulse-dot bg-success' : 'bg-warning')} /> {running ? 'MONITORING' : 'UNMANAGED · START TO RESUME'}</span></div>
            <div className="mt-3 flex items-center gap-2"><TokenBadge symbol={position.symbol} /><div><p className="text-sm font-semibold">{position.symbol}</p><p className="font-mono text-[9px] text-text-secondary">{position.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} tokens</p></div></div>
            <div className="mt-4 grid grid-cols-3 gap-3"><Metric label="Entry" value={`$${position.entryPrice.toFixed(6)}`} /><Metric label="Current" value={`$${positionPrice.toFixed(6)}`} /><div><p className="data-label">Net PnL</p><PnLDisplay value={position.entryUSDC > 0 ? ((positionPrice * position.amount - position.entryUSDC) / position.entryUSDC) * 100 : 0} percent className="mt-1 block text-xs" /></div></div>
            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border/60 pt-3"><Metric label="Peak" value={`${position.peakPnlPct.toFixed(2)}%`} /><Metric label="Held" value={formatDuration(Math.floor((Date.now() - position.openedAt) / 1_000))} /><Metric label="Stagnant" value={`${position.stagnantChecks}/${config.stagnantChecksLimit}`} /></div>
            {!running && <button type="button" onClick={startBot} disabled={!isConnected} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-warning/15 text-[10px] font-bold uppercase tracking-wider text-warning transition hover:bg-warning/25 disabled:cursor-not-allowed disabled:opacity-40"><Icon name="power" className="h-3.5 w-3.5" /> Resume position management</button>}
          </div>
        )}

        <fieldset disabled={running} className="space-y-5 disabled:opacity-60">
          <ConfigSection title="Execution">
            <div>
              <div className="flex items-center justify-between"><label className="data-label">Requested trade size</label><span className="font-mono text-xs">{config.tradeSize.toLocaleString()} <span className="text-text-secondary">USDC</span></span></div>
              <input type="range" min="100" max="50000" step="100" value={config.tradeSize} onChange={(event) => setConfig({ tradeSize: Number(event.target.value) })} className="mt-3 w-full" />
              <div className="mt-1 flex justify-between font-mono text-[8px] text-text-secondary"><span>100</span><span>50,000</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Take profit" value={config.takeProfitPct} min={1} max={100} step={0.5} suffix="%" onChange={(value) => setConfig({ takeProfitPct: clamp(value, 1, 100) })} />
              <NumberField label="Stop loss" value={config.stopLossPct} min={1} max={100} step={0.5} suffix="%" onChange={(value) => setConfig({ stopLossPct: clamp(value, 1, 100) })} />
              <NumberField label="Slippage" value={config.slippagePct} min={0.1} max={10} step={0.1} suffix="%" onChange={(value) => setConfig({ slippagePct: clamp(value, 0.1, 10) })} />
              <NumberField label="Check interval" value={config.delaySeconds} min={10} max={300} step={1} suffix="SEC" onChange={(value) => setConfig({ delaySeconds: clamp(value, 10, 300) })} />
            </div>
          </ConfigSection>

          <ConfigSection title="Rotation policy">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Maximum hold" value={config.maxHoldSeconds} min={30} max={3600} step={30} suffix="SEC" onChange={(value) => setConfig({ maxHoldSeconds: clamp(value, 30, 3600) })} />
              <NumberField label="Stagnant checks" value={config.stagnantChecksLimit} min={1} max={20} step={1} suffix="CHECKS" onChange={(value) => setConfig({ stagnantChecksLimit: clamp(value, 1, 20) })} />
              <NumberField label="Stagnation band" value={config.stagnationThresholdPct} min={0.05} max={5} step={0.05} suffix="%" onChange={(value) => setConfig({ stagnationThresholdPct: clamp(value, 0.05, 5) })} />
              <NumberField label="Trailing activates" value={config.trailingActivationPct} min={1} max={100} step={0.5} suffix="%" onChange={(value) => setConfig({ trailingActivationPct: clamp(value, 1, 100) })} />
              <NumberField label="Trailing distance" value={config.trailingDistancePct} min={0.5} max={25} step={0.5} suffix="%" onChange={(value) => setConfig({ trailingDistancePct: clamp(value, 0.5, 25) })} />
            </div>
          </ConfigSection>

          <ConfigSection title="Objective">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Target rank" value={config.targetRank} min={1} max={50} step={1} suffix="RANK" onChange={(value) => setConfig({ targetRank: clamp(value, 1, 50) })} />
              <NumberField label="Profit target" value={config.sessionProfitTarget} min={100} max={500000} step={100} suffix="USDC" onChange={(value) => setConfig({ sessionProfitTarget: clamp(value, 100, 500000) })} />
            </div>
            <div className="grid grid-cols-2 rounded-md bg-bg-primary p-1">
              <ModeButton active={config.objectiveMode === 'reach'} onClick={() => setConfig({ objectiveMode: 'reach' })}>REACH & STOP</ModeButton>
              <ModeButton active={config.objectiveMode === 'defend'} onClick={() => setConfig({ objectiveMode: 'defend' })}>DEFEND RANK</ModeButton>
            </div>
            <label className="block"><span className="data-label">Optional deadline</span><input type="datetime-local" value={deadlineValue} onChange={(event) => setConfig({ deadline: event.target.value ? new Date(event.target.value).getTime() : null })} className="input-terminal mt-1.5 h-10 text-[11px]" /></label>
            <p className="text-[9px] leading-relaxed text-text-secondary">Rank is estimated from recent router-linked Flipt USDC transfers. Defend pauses entries at target and resumes if rank slips; profit and risk guardrails remain authoritative.</p>
          </ConfigSection>

          <ConfigSection title="Pool quality gate">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Minimum liquidity" value={config.minLiquidityUSDC} min={5000} max={2000000} step={5000} suffix="USDC" onChange={(value) => setConfig({ minLiquidityUSDC: clamp(value, 5000, 2000000) })} />
              <NumberField label="Recent activity" value={config.minRecentTrades} min={2} max={20} step={1} suffix="TRADES" onChange={(value) => setConfig({ minRecentTrades: clamp(value, 2, 20) })} />
              <NumberField label="Buy pressure" value={config.minBuyPressurePct} min={50} max={90} step={1} suffix="%" onChange={(value) => setConfig({ minBuyPressurePct: clamp(value, 50, 90) })} />
              <NumberField label="LP self-lock" value={config.minLiquidityLockPct} min={75} max={100} step={1} suffix="%" onChange={(value) => setConfig({ minLiquidityLockPct: clamp(value, 75, 100) })} />
              <NumberField label="Creator holdings" value={config.maxCreatorHoldingPct} min={0} max={75} step={1} suffix="% MAX" onChange={(value) => setConfig({ maxCreatorHoldingPct: clamp(value, 0, 75) })} />
              <NumberField label="Largest wallet flow" value={config.maxWalletFlowPct} min={25} max={90} step={1} suffix="% MAX" onChange={(value) => setConfig({ maxWalletFlowPct: clamp(value, 25, 90) })} />
              <NumberField label="Maximum momentum" value={config.maxMomentumPct} min={2} max={50} step={1} suffix="%" onChange={(value) => setConfig({ maxMomentumPct: clamp(value, 2, 50) })} />
              <NumberField label="Maximum volatility" value={config.maxVolatilityPct} min={2} max={50} step={1} suffix="%" onChange={(value) => setConfig({ maxVolatilityPct: clamp(value, 2, 50) })} />
            </div>
            <p className="rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-[9px] leading-relaxed text-text-secondary">Auto mode requires a Hub-verified graduated pool, two-way flow from at least two recent traders, bounded creator holdings, no dominant recent wallet, adequate token-side exit depth, bounded momentum and an on-chain LP lock check. These filters reduce risk; no public-chain heuristic can guarantee profit or prevent every rug.</p>
          </ConfigSection>

          <ConfigSection title="Guardrails">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Maximum impact" value={config.maxPriceImpactPct} min={1} max={10} step={0.25} suffix="%" onChange={(value) => setConfig({ maxPriceImpactPct: clamp(value, 1, 10) })} />
              <NumberField label="Liquidity share" value={config.maxLiquiditySharePct} min={0.1} max={5} step={0.1} suffix="%" onChange={(value) => setConfig({ maxLiquiditySharePct: clamp(value, 0.1, 5) })} />
              <NumberField label="Session loss" value={config.maxSessionLoss} min={100} max={500000} step={100} suffix="USDC" onChange={(value) => setConfig({ maxSessionLoss: clamp(value, 100, 500000) })} />
              <NumberField label="Loss streak" value={config.maxConsecutiveLosses} min={1} max={10} step={1} suffix="TRADES" onChange={(value) => setConfig({ maxConsecutiveLosses: clamp(value, 1, 10) })} />
            </div>
          </ConfigSection>

          <ConfigSection title="Market selection">
            <div className="grid grid-cols-2 rounded-md bg-bg-primary p-1">
              <ModeButton active={config.mode === 'auto'} onClick={() => setConfig({ mode: 'auto' })}>AUTO-ROTATE</ModeButton>
              <ModeButton active={config.mode === 'manual'} onClick={() => setConfig({ mode: 'manual' })}>MANUAL TOKEN</ModeButton>
            </div>
            {config.mode === 'manual' ? (
              <input value={config.manualToken} onChange={(event) => setConfig({ manualToken: event.target.value })} placeholder="0x… token address" className="input-terminal h-10 text-[11px]" />
            ) : <p className="text-[10px] leading-relaxed text-text-secondary">Observes each pool before entry, ranks only quality-gate survivors, trades one token at a time, then rotates after a two-scan cooldown.</p>}
          </ConfigSection>
        </fieldset>

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-5">
          <button type="button" onClick={startBot} disabled={!isConnected || running || (balanceTooLow && !position)} className="flex h-11 items-center justify-center gap-2 rounded-md bg-success text-xs font-bold uppercase tracking-wider text-white transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-30"><Icon name="power" className="h-3.5 w-3.5" /> Start bot</button>
          <button type="button" onClick={stopBot} disabled={!running} className="flex h-11 items-center justify-center gap-2 rounded-md bg-danger text-xs font-bold uppercase tracking-wider text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-30"><span className="h-2.5 w-2.5 rounded-[2px] bg-white" /> Stop bot</button>
        </div>
        {!isConnected && <p className="text-center text-[10px] text-warning">Connect a wallet on Arc Testnet to enable execution.</p>}
        {isConnected && balanceTooLow && !position && <p className="text-center text-[10px] text-warning">At least 100 Flipt USDC is required to open a new position.</p>}
        {isConnected && !position && availableUsdc !== null && availableUsdc >= 100 && availableUsdc < config.tradeSize && (
          <p className="rounded-md border border-warning/25 bg-warning/5 px-3 py-2 font-mono text-[10px] leading-relaxed text-warning">Requested size exceeds balance. Execution will cap each entry to the safe available amount.</p>
        )}

        {(running || sessionStartedAt !== null) && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricCard label="Est. rank" value={leaderboardRank ? `#${leaderboardRank}` : '>50'} />
            <MetricCard label="Realized PnL" value={`${realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}`} tone={realizedPnl >= 0 ? 'positive' : 'negative'} />
            <MetricCard label="Completed" value={completedTrades.toString()} />
            <MetricCard label="Session volume" value={sessionVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })} />
            <MetricCard label="Next action" value={`${String(Math.floor(countdown / 60)).padStart(2, '0')}:${String(countdown % 60).padStart(2, '0')}`} />
            <MetricCard label="Elapsed / losses" value={`${formatDuration(elapsed)} · ${consecutiveLosses}`} />
          </div>
        )}
        {(running || sessionStartedAt !== null) && <p className="font-mono text-[8px] text-text-secondary">{scanned.toLocaleString()} pool observations · leaderboard {leaderboardLoading ? 'syncing' : leaderboardSource}</p>}
      </div>
    </section>
  )
}

function clamp(value: string, min: number, max: number) { return Math.min(max, Math.max(min, Number(value) || min)) }
function formatDuration(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
function ConfigSection({ title, children }: { title: string; children: React.ReactNode }) { return <div className="space-y-3 border-t border-border/70 pt-4 first:border-0 first:pt-0"><h3 className="panel-title text-text-primary">{title}</h3>{children}</div> }
function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={cn('h-9 rounded text-[10px] font-semibold transition', active ? 'bg-accent-primary/20 text-[#c4b5fd]' : 'text-text-secondary')}>{children}</button> }
function NumberField({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: string) => void }) { return <label><span className="data-label">{label}</span><span className="relative mt-1.5 block"><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} className="input-terminal h-10 pr-12 text-xs" /><span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[8px] text-text-secondary">{suffix}</span></span></label> }
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="data-label">{label}</p><p className="mt-1 font-mono text-xs">{value}</p></div> }
function MetricCard({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) { return <div className="rounded-md border border-border bg-bg-primary p-3"><p className="data-label">{label}</p><p className={cn('mt-1 font-mono text-sm', tone === 'positive' && 'text-success', tone === 'negative' && 'text-danger')}>{value}</p></div> }
