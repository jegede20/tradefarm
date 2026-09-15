import { Watchlist } from './Watchlist'
import { MyPositions } from './MyPositions'
import { BotStatusWidget } from './BotStatusWidget'

export function LeftRail() {
  return (
    <aside className="panel flex w-full flex-col border-l-0 border-t-0 xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:min-h-[calc(100vh-88px)] xl:w-64">
      <Watchlist />
      <MyPositions />
      <BotStatusWidget />
    </aside>
  )
}
