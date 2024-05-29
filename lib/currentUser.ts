import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { prisma } from '@/lib/prisma'

// Resolves "the current user" from the real NextAuth session, now that session-based
// auth exists — no longer a hardcoded DEMO_USER_EMAIL lookup. Returns null when
// there's no session (or the session's email doesn't match a real user) so callers —
// the API routes — can respond 401 instead of silently acting on someone else's data.
export async function getCurrentUser() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    return null
  }

  return prisma.user.findUnique({ where: { email: session.user.email } })
}
