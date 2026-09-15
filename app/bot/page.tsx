import { BotControls } from '@/components/bot/BotControls'
import { LogFeed } from '@/components/bot/LogFeed'

export default function BotPage() {
  return (
    <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
      <div className="mb-5"><p className="panel-title text-[#a78bfa]">Browser execution engine</p><h1 className="mt-1 text-xl font-semibold tracking-tight">Automation console</h1><p className="mt-1 text-xs text-text-secondary">Runs locally in this tab. No server, custody, or background process.</p></div>
      <div className="grid items-start gap-4 lg:grid-cols-[440px_minmax(0,1fr)]"><BotControls /><LogFeed /></div>
    </div>
  )
}
