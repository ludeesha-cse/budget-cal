// Root Layout replaces pages/_app.tsx + pages/_document.tsx — the one place <html>/<body> live.
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@/styles/theme.css'
import '@/styles/globals.css'
import Providers from './providers'

// Metadata API replaces next/head, which doesn't work in Server Components.
// Plain string, not a title template — templates don't apply to a page in the same
// segment as the layout defining them, so each page below sets its full title directly.
export const metadata: Metadata = {
  title: 'Budget Calculator',
}

// The Navbar/<main> chrome (components/Layout) no longer lives here — it moved to
// app/(protected)/layout.tsx, since the /login page shouldn't show app navigation or
// a logout button for a session that doesn't exist yet. This root layout now only
// carries what every route genuinely needs: the HTML shell, global CSS, and the
// session context (Providers) that both /login and the protected routes read from.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
