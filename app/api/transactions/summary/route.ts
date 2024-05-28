import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/currentUser'

// This GET handler takes no Request argument and reads no dynamic API (cookies(),
// headers(), searchParams) — the signals Next.js's build step uses to decide whether
// a Route Handler is safe to render once and cache as a static response. Since it
// can't see that Prisma is reading live, mutable data, it would otherwise statically
// cache this handler's output at build time (confirmed: without this, `next build`
// marked this route ○ Static, and a production server kept serving the build-time
// snapshot after new transactions were added). `force-dynamic` overrides that
// heuristic explicitly — required here since the Dashboard depends on this endpoint
// never being stale.
export const dynamic = 'force-dynamic'

function isCurrentMonth(date: Date) {
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

// Dashboard-specific aggregate: current-month totals + budget remaining. Deliberately
// separate from GET /api/transactions (the raw list) rather than one endpoint that
// does both — the Dashboard only ever needs these derived numbers, never the
// individual transaction rows, so there's no reason for it to fetch and reduce the
// full list client- or server-side every time.
export async function GET() {
  const user = await getCurrentUser()

  const transactions = await prisma.transaction.findMany({
    where: { userId: user.id },
  })

  const currentMonthTransactions = transactions.filter((t) => isCurrentMonth(t.date))

  const totalExpenses = currentMonthTransactions.reduce((sum, t) => sum + t.amount, 0)
  const amountLeft = user.monthlyBudget - totalExpenses

  const totalsByCategory = currentMonthTransactions.reduce<Record<string, number>>((acc, t) => {
    acc[t.type] = (acc[t.type] || 0) + t.amount
    return acc
  }, {})

  return NextResponse.json({
    monthlyBudget: user.monthlyBudget,
    totalExpenses,
    amountLeft,
    totalsByCategory,
  })
}
