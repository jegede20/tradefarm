import { LeftRail } from '@/components/dashboard/LeftRail'
import { MainCanvas } from '@/components/dashboard/MainCanvas'
import { RightPanel } from '@/components/dashboard/RightPanel'

export default function DashboardPage() {
  return (
    <div className="flex min-h-[calc(100vh-88px)] flex-col xl:flex-row">
      <LeftRail />
      <MainCanvas />
      <RightPanel />
    </div>
  )
}
