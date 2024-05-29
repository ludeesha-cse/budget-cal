import NextAuth from 'next-auth'
import { authOptions } from '@/lib/authOptions'

// NextAuth's own Route Handler — a catch-all under /api/auth/* that handles
// sign-in, sign-out, session, and callback requests. This is what signIn()/signOut()
// (next-auth/react) and getServerSession() elsewhere in the app actually talk to.
const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
