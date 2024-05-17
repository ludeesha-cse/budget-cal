import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@/styles/theme.css'
import '@/styles/globals.css'
import Layout from '@/components/Layout'

export const metadata: Metadata = {
  title: 'Budget Calculator',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Layout>{children}</Layout>
      </body>
    </html>
  )
}
