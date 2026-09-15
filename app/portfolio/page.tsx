import { PortfolioHeader } from '@/components/portfolio/PortfolioHeader'
import { PositionsTable } from '@/components/portfolio/PositionsTable'
import { TradeHistoryTable } from '@/components/portfolio/TradeHistoryTable'

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6">
      <div className="mb-5"><p className="panel-title text-[#a78bfa]">Account</p><h1 className="mt-1 text-xl font-semibold tracking-tight">Portfolio overview</h1></div>
      <PortfolioHeader />
      <PositionsTable />
      <TradeHistoryTable />
    </div>
  )
}
