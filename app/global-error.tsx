'use client'

import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[TradeFarm client error]', error)
  }, [error])

  const repairSavedState = () => {
    try {
      const key = 'tradefarm-terminal-v2'
      const saved = JSON.parse(window.localStorage.getItem(key) ?? 'null')
      if (saved?.state) {
        const validToken = (value: unknown) => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
        saved.state.positions = Array.isArray(saved.state.positions) ? saved.state.positions.filter((position: { token?: unknown }) => validToken(position?.token)) : []
        if (!validToken(saved.state.botPosition?.token)) saved.state.botPosition = null
        // Preserve transaction history; schema v7 safely excludes incomplete
        // legacy rows from calculations without deleting them.
        saved.version = 6
        window.localStorage.setItem(key, JSON.stringify(saved))
      }
    } catch {
      // A damaged value will be ignored by Zustand's guarded hydration path.
    }
    window.location.href = `/?recovered=${Date.now()}`
  }

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-[#07070b] p-6 text-[#f4f4f5]">
        <main className="w-full max-w-md rounded-xl border border-[#27272f] bg-[#111118] p-6 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#a78bfa]">TradeFarm recovery</p>
          <h1 className="mt-3 text-xl font-semibold">The saved browser state could not be loaded safely.</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#a1a1aa]">Reload the newest build first. If the error returns, repair only incompatible saved position metadata; confirmed transaction history will be retained.</p>
          <p className="mt-4 break-words rounded-md bg-[#09090e] p-3 font-mono text-[10px] text-[#71717a]">{error.message || error.digest || 'Unknown client error'}</p>
          <div className="mt-5 grid gap-3">
            <button type="button" onClick={() => { reset(); window.location.href = `/?build=${Date.now()}` }} className="h-11 rounded-md bg-[#7c3aed] text-xs font-bold uppercase tracking-wider text-white">Reload latest build</button>
            <button type="button" onClick={repairSavedState} className="h-11 rounded-md border border-[#3f3f46] bg-[#18181f] text-xs font-semibold uppercase tracking-wider text-[#d4d4d8]">Repair saved state</button>
          </div>
        </main>
      </body>
    </html>
  )
}
