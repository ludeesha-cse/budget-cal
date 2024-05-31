'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from '@/styles/AuthForm.module.css'

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    // redirect: false — handles the result here instead of letting NextAuth do a
    // full-page redirect on failure, so a wrong password shows an inline error
    // message rather than bouncing to a NextAuth-owned error page.
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setIsSubmitting(false)

    if (result?.error) {
      setError('Invalid email or password')
      return
    }

    // signIn() only sets the session cookie; it doesn't navigate. push() moves to the
    // now-authenticated Dashboard, and refresh() re-runs its Server Components against
    // the server rather than serving any stale client-cached render of "/".
    router.push('/')
    router.refresh()
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && <div className={styles.errorMessage}>{error}</div>}

      <div className={styles.field}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign In'}
      </button>

      <p className={styles.switchLink}>
        Don&apos;t have an account? <Link href="/register">Register</Link>
      </p>
    </form>
  )
}
