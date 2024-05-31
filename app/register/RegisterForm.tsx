'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH, EMAIL_INVALID_MESSAGE, PASSWORD_REQUIREMENTS_MESSAGE } from '@/lib/validation'
import styles from '@/styles/AuthForm.module.css'

type FieldName = 'name' | 'email' | 'password' | 'confirmPassword'
type FieldErrors = Partial<Record<FieldName, string>>

export default function RegisterForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // Which fields the user has interacted with — gates whether that field's error is
  // shown yet. Without this, every field would show "required" red text before the
  // user has typed anything at all, which reads as broken rather than helpful.
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Derived on every render from the current field values — not a separate error
  // state that has to be manually kept in sync via extra setState calls. Since
  // React re-renders on every keystroke (each one calls setName/setPassword/etc.),
  // these errors are automatically recomputed, and therefore automatically live, on
  // every keystroke too. It reuses the exact isValidEmail/isValidPassword functions
  // the server's /api/register route imports from the same lib/validation.ts.
  function getFieldErrors(): FieldErrors {
    const errors: FieldErrors = {}

    if (!name.trim()) {
      errors.name = 'Name is required'
    }

    if (!email) {
      errors.email = 'Email is required'
    } else if (!isValidEmail(email)) {
      errors.email = EMAIL_INVALID_MESSAGE
    }

    if (!password) {
      errors.password = 'Password is required'
    } else if (!isValidPassword(password)) {
      errors.password = PASSWORD_REQUIREMENTS_MESSAGE
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password'
    } else if (confirmPassword !== password) {
      errors.confirmPassword = 'Passwords do not match'
    }

    return errors
  }

  const fieldErrors = getFieldErrors()

  function handleFieldChange(field: FieldName, value: string) {
    if (field === 'name') setName(value)
    if (field === 'email') setEmail(value)
    if (field === 'password') setPassword(value)
    if (field === 'confirmPassword') setConfirmPassword(value)

    // Marking touched on the first keystroke (not onBlur) is what makes the error
    // appear *while typing* rather than only after leaving the field — every
    // subsequent keystroke then updates the same derived error live, since
    // getFieldErrors() re-runs on every render regardless.
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitError(null)

    // Touch every field on submit, so trying to submit a form the user never
    // actually typed into (e.g. tabbing past everything and hitting Enter) still
    // surfaces every "required" error at once, not just the ones already visible.
    setTouched({ name: true, email: true, password: true, confirmPassword: true })

    if (Object.keys(fieldErrors).length > 0) {
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to register')
      }

      // Registration only creates the account — it doesn't establish a session by
      // itself, so a new user would otherwise land back on /login right after signing
      // up. Signing in immediately with the same credentials completes the loop.
      const result = await signIn('credentials', { email, password, redirect: false })

      if (result?.error) {
        throw new Error('Account created, but automatic sign-in failed — please log in.')
      }

      router.push('/')
      router.refresh()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {submitError && <div className={styles.errorMessage}>{submitError}</div>}

      <div className={styles.field}>
        <label htmlFor="name">Name</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => handleFieldChange('name', e.target.value)}
        />
        {touched.name && fieldErrors.name && (
          <span className={styles.fieldError}>{fieldErrors.name}</span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => handleFieldChange('email', e.target.value)}
        />
        {touched.email && fieldErrors.email && (
          <span className={styles.fieldError}>{fieldErrors.email}</span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => handleFieldChange('password', e.target.value)}
        />
        {touched.password && fieldErrors.password && (
          <span className={styles.fieldError}>{fieldErrors.password}</span>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="confirmPassword">Confirm Password</label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => handleFieldChange('confirmPassword', e.target.value)}
        />
        {touched.confirmPassword && fieldErrors.confirmPassword && (
          <span className={styles.fieldError}>{fieldErrors.confirmPassword}</span>
        )}
      </div>

      <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create Account'}
      </button>

      <p className={styles.switchLink}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </form>
  )
}
