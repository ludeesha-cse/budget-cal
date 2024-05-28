import { prisma } from '@/lib/prisma'
import { DEMO_USER_EMAIL } from '@/lib/constants'

// Stand-in for session-based auth: every request acts on behalf of the single seeded
// demo user until real sign-in exists. Centralized here so the three Route Handlers
// that need "the current user" don't each repeat the same lookup.
export function getCurrentUser() {
  return prisma.user.findUniqueOrThrow({ where: { email: DEMO_USER_EMAIL } })
}
