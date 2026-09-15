import { TradeBox } from './TradeBox'

export function RightPanel() {
  return (
    <aside className="w-full shrink-0 border-l border-border bg-bg-surface lg:w-80">
      <div className="flex h-11 items-center justify-between border-b border-border px-4">
        <h2 className="panel-title">Trade terminal</h2>
        <span className="flex items-center gap-1.5 font-mono text-[8px] text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" /> ROUTER ONLINE</span>
      </div>
      <TradeBox />
    </aside>
  )
}
