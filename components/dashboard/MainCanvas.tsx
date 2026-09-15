import { TokenHeader } from './TokenHeader'
import { PriceChart } from './PriceChart'

export function MainCanvas() {
  return (
    <section className="min-w-0 flex-1 border-b border-border bg-bg-primary xl:col-start-2 xl:row-start-1">
      <TokenHeader />
      <PriceChart />
    </section>
  )
}
