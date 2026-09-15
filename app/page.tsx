import { LeftRail } from '@/components/dashboard/LeftRail'
import { MainCanvas } from '@/components/dashboard/MainCanvas'
import { RightPanel } from '@/components/dashboard/RightPanel'
import { TradesFeed } from '@/components/dashboard/TradesFeed'

export default function DashboardPage() {
  return (
    <div className="flex min-h-[calc(100vh-88px)] flex-col xl:grid xl:grid-cols-[16rem_minmax(0,1fr)_20rem] xl:grid-rows-[auto_1fr]">
      <LeftRail />
      <MainCanvas />
      <RightPanel className="border-l-0 xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:w-80 xl:border-l" />
      <TradesFeed className="xl:col-start-2 xl:row-start-2" />
    </div>
  )
}
