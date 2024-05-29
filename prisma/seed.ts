import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
// Relative imports: this runs under ts-node, outside Next's module resolution, so the @/* alias isn't available.
import { mockTransactions, monthlyBudget } from '../data/mockTransactions'
import { DEMO_USER_EMAIL, DEMO_USER_PASSWORD } from '../lib/constants'

// Plain PrismaClient, not the lib/prisma.ts singleton — this is a one-shot script, no hot reload to guard against.
const prisma = new PrismaClient()

async function main() {
  // Hashed here, once, at seed time — the raw DEMO_USER_PASSWORD never gets stored;
  // only this hash does. The Credentials provider (lib/authOptions.ts) later compares
  // a login attempt's password against this same hash via bcrypt.compare, never the
  // other way around.
  const passwordHash = await bcrypt.hash(DEMO_USER_PASSWORD, 10)

  // upsert makes this idempotent — reruns update the password hash (in case the demo
  // password constant ever changes) instead of erroring on the unique email.
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: { passwordHash },
    create: {
      email: DEMO_USER_EMAIL,
      name: 'Demo User',
      passwordHash,
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
