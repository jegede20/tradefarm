import { Watchlist } from './Watchlist'
import { MyPositions } from './MyPositions'
import { BotStatusWidget } from './BotStatusWidget'

export function LeftRail() {
  return (
    <aside className="panel flex min-h-[calc(100vh-88px)] w-full flex-col border-l-0 border-t-0 lg:w-64 lg:shrink-0">
      <Watchlist />
      <MyPositions />
      <BotStatusWidget />
    </aside>
  )
}
