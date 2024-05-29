'use client'

import { SessionProvider } from 'next-auth/react'
import type { ReactNode } from 'react'

// useSession() (used by Navbar to conditionally show the logout button, and
// available to any future client component) only works inside this context
// provider — it's the one piece of NextAuth's client SDK that needs React context
// rather than a plain fetch call, so it has to wrap the whole tree from the root
// layout down, covering both /login and the protected routes.
export default function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
