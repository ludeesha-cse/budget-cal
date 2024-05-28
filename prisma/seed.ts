import { PrismaClient } from '@prisma/client'
// Relative imports: this runs under ts-node, outside Next's module resolution, so the @/* alias isn't available.
import { mockTransactions, monthlyBudget } from '../data/mockTransactions'
import { DEMO_USER_EMAIL } from '../lib/constants'

// Plain PrismaClient, not the lib/prisma.ts singleton — this is a one-shot script, no hot reload to guard against.
const prisma = new PrismaClient()

async function main() {
  // upsert makes this idempotent — reruns update nothing instead of erroring on the unique email.
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      email: DEMO_USER_EMAIL,
      name: 'Demo User',
      passwordHash: 'seed-placeholder-not-a-real-hash',
      monthlyBudget,
    },
  })

  // Clears old seed data first, so reruns replace it instead of duplicating it.
  await prisma.transaction.deleteMany({ where: { userId: user.id } })

  // createMany: one batched insert instead of one create() call per row.
  await prisma.transaction.createMany({
    data: mockTransactions.map((t) => ({
      date: new Date(t.date),
      amount: t.amount,
      type: t.type,
      description: t.description,
      paymentMethod: t.paymentMethod,
      userId: user.id,
    })),
  })
}

// Top-level await isn't available in this CommonJS ts-node script, hence main().then().catch().
main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
