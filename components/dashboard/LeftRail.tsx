import { Watchlist } from './Watchlist'
import { MyPositions } from './MyPositions'
import { BotStatusWidget } from './BotStatusWidget'

export function LeftRail() {
  return (
    <aside className="panel flex w-full flex-col border-l-0 border-t-0 xl:min-h-[calc(100vh-88px)] xl:w-64 xl:shrink-0">
      <Watchlist />
      <MyPositions />
      <BotStatusWidget />
    </aside>
  )
}
