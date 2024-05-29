import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import LoginForm from './LoginForm'
import styles from '@/styles/Login.module.css'

export const metadata: Metadata = {
  title: 'Login | Budget Calculator',
}

// Outside the (protected) route group entirely — this is the one route an
// unauthenticated visitor can actually reach, and it must never itself redirect to
// itself. It does the opposite check from app/(protected)/layout.tsx: if a session
// already exists, there's nothing to log in for, so it sends the visitor onward.
export default async function Page() {
  const session = await getServerSession(authOptions)

  if (session) {
    redirect('/')
  }

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>Login</h1>
      <LoginForm />
    </div>
  )
}
