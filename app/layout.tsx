// Root Layout replaces pages/_app.tsx + pages/_document.tsx — the one place <html>/<body> live.
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@/styles/theme.css'
import '@/styles/globals.css'
import Layout from '@/components/Layout'

// Metadata API replaces next/head, which doesn't work in Server Components.
// Plain string, not a title template — templates don't apply to a page in the same
// segment as the layout defining them, so each page below sets its full title directly.
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
