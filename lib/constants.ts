// Single seeded demo user stands in for real auth/sessions, which don't exist yet.
// Both prisma/seed.ts and the API routes reference this one constant so there's a
// single place to update once real multi-user auth replaces this.
export const DEMO_USER_EMAIL = 'demo@budgetcalculator.dev'
