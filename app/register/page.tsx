import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import RegisterForm from './RegisterForm'
import styles from '@/styles/AuthForm.module.css'

export const metadata: Metadata = {
  title: 'Register | Budget Calculator',
}

// Same shape as /login: outside the (protected) group, and redirects away anyone
// who already has a session — there's nothing to register for if you're signed in.
export default async function Page() {
  const session = await getServerSession(authOptions)

  if (session) {
    redirect('/')
  }

  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>Create Account</h1>
      <RegisterForm />
    </div>
  )
}
