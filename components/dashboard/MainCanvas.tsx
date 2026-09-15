import { TokenHeader } from './TokenHeader'
import { PriceChart } from './PriceChart'
import { TradesFeed } from './TradesFeed'

export function MainCanvas() {
  return (
    <section className="min-w-0 flex-1 border-b border-border bg-bg-primary lg:border-b-0">
      <TokenHeader />
      <PriceChart />
      <TradesFeed />
    </section>
  )
}
