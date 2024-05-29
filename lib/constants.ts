// Single seeded demo user — this personal-use app has no public registration page,
// so these are the only login credentials that exist. Both prisma/seed.ts and the
// auth/API layers reference these two constants so there's a single place to update.
export const DEMO_USER_EMAIL = 'demo@budgetcalculator.dev'
export const DEMO_USER_PASSWORD = 'password123'
