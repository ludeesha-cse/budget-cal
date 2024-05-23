import { PrismaClient } from '@prisma/client'

// Singleton: one PrismaClient per process. In dev, hot reload would otherwise create
// a new client (and connection pool) on every save, exhausting Postgres connections —
// stashing it on globalThis survives module re-evaluation across reloads.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

// Captured before the client is (re)assigned, so the connection log below only fires
// for a genuinely new client, not on every hot reload reusing the cached one.
const isNewClient = !globalForPrisma.prisma

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

// No hot reload in production, so no need to cache on globalThis there.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Prisma connects lazily by default; connect explicitly here just to confirm and log reachability.
if (isNewClient) {
  prisma
    .$connect()
    .then(() => {
      console.log('[prisma] Database connection established')
    })
    .catch((error) => {
      console.error('[prisma] Failed to connect to the database:', error)
    })
}
