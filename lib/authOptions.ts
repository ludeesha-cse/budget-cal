import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

// JWT session strategy, not the database strategy — the simplest option that needs
// nothing beyond the existing User model. The database strategy would require adding
// NextAuth's own Account/Session/VerificationToken tables via a Prisma Adapter, which
// this "simple, not elaborate" stage doesn't call for.
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      // Returning null (rather than throwing) for any failure case is what tells
      // NextAuth "these credentials are invalid" — it surfaces as a generic
      // CredentialsSignin error to the client either way, so login attempts can't be
      // used to distinguish "no such email" from "wrong password" for that email.
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // Lowercased to match how /api/register normalizes email on the way in —
        // otherwise "Foo@Bar.com" at signup and "Foo@Bar.com" at login would
        // technically be the same address but fail to match a lowercased DB row.
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
        })

        if (!user) {
          return null
        }

        const isValidPassword = await bcrypt.compare(credentials.password, user.passwordHash)

        if (!isValidPassword) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      },
    }),
  ],
}
