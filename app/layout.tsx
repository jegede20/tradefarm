import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { Providers } from '@/providers/Providers'
import { Topbar } from '@/components/layout/Topbar'
import { BottomTicker } from '@/components/layout/BottomTicker'

export const metadata: Metadata = {
  title: 'TradeFarm — Arc Testnet Trading Terminal',
  description: 'High-speed graduated Flipt pool trading terminal for Arc Testnet.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`}>
      <body>
        <Providers>
          <Topbar />
          <main className="min-h-screen pb-8 pt-24 md:pt-14">{children}</main>
          <BottomTicker />
        </Providers>
      </body>
    </html>
  )
}
