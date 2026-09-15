'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/bot', label: 'Bot' },
]

export function NavLinks() {
  const pathname = usePathname()
  return (
    <nav className="flex h-full items-center" aria-label="Primary navigation">
      {links.map((link) => {
        const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'relative flex h-full items-center px-3 text-xs font-medium transition-colors sm:px-4',
              active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {link.label}
            {active && <span className="absolute inset-x-3 bottom-0 h-px bg-accent-primary shadow-[0_0_8px_var(--accent-primary)]" />}
          </Link>
        )
      })}
    </nav>
  )
}
