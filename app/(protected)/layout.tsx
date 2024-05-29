import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import type { ReactNode } from 'react'
import { authOptions } from '@/lib/authOptions'
import Layout from '@/components/Layout'

// Route group, What it buys: every page.tsx nested under this folder shares this
// one layout, so the session check below only needs to be written once, here,
// instead of repeated at the top of all four pages (and forgotten on the next one).
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  // The Navbar/<main> chrome lives here now, not in the root layout — only
  // authenticated routes should show app navigation and the logout button.
  return <Layout>{children}</Layout>
}
