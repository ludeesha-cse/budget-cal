// Client Component: form state (useState) and the submit handler need the browser.
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Transaction, TransactionType, PaymentMethod } from '@/types/transaction'
import styles from '@/styles/AddTransaction.module.css'

const TYPES: TransactionType[] = ['Food', 'Transport', 'Bills', 'Entertainment', 'Other']
const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Card', 'Bank Transfer']

interface FormState {
  date: string
  amount: string
  type: TransactionType
  description: string
  paymentMethod: PaymentMethod
}

const emptyForm: FormState = {
  date: '',
  amount: '',
  type: TYPES[0],
  description: '',
  paymentMethod: PAYMENT_METHODS[0],
}

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

interface AddTransactionFormProps {
  initialRecentTransactions: Transaction[]
}

export default function AddTransactionForm({ initialRecentTransactions }: AddTransactionFormProps) {
  const router = useRouter()
  const [transactions, setTransactions] = useState<Transaction[]>(initialRecentTransactions)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generic keeps one implementation while still typing each field's value correctly.
  function handleChange<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          amount: Number(form.amount),
          type: form.type,
          description: form.description,
          paymentMethod: form.paymentMethod,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to add transaction')
      }

      // The server assigns the real id (Prisma's cuid) and normalizes the date, so the
      // list is seeded from what POST actually returns — not a client-fabricated guess.
      const created: Transaction = await res.json()

      setTransactions((prev) => [created, ...prev].slice(0, 5))
      setForm(emptyForm)
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)

      // The Dashboard's own fetch already uses cache: 'no-store', so it would return
      // fresh data on its next direct request regardless — but the App Router also
      // keeps a client-side Router Cache of recently visited routes, which can still
      // serve a stale view for a short window after navigating away and back.
      // router.refresh() re-runs this route's Server Components against the server
      // and clears that staleness, so navigating to Dashboard next shows the new
      // transaction without a manual page reload.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const recent = transactions.slice(0, 5)

  return (
    <>
      {error && <div className={styles.errorMessage}>{error}</div>}
      {showSuccess && <div className={styles.successMessage}>Transaction added successfully.</div>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="date">Date</label>
          <input
            id="date"
            type="date"
            required
            value={form.date}
            onChange={(e) => handleChange('date', e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="amount">Amount</label>
          <input
            id="amount"
            type="number"
            min="0"
            step="0.01"
            required
            value={form.amount}
            onChange={(e) => handleChange('amount', e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="type">Type</label>
          {/* e.target.value is always `string`; cast is safe since options come from TYPES. */}
          <select
            id="type"
            value={form.type}
            onChange={(e) => handleChange('type', e.target.value as TransactionType)}
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="description">Description</label>
          <input
            id="description"
            type="text"
            required
            value={form.description}
            onChange={(e) => handleChange('description', e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="paymentMethod">Payment Method</label>
          <select
            id="paymentMethod"
            value={form.paymentMethod}
            onChange={(e) => handleChange('paymentMethod', e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
          {isSubmitting ? 'Adding…' : 'Add Transaction'}
        </button>
      </form>

      <div className={styles.recentSection}>
        <h2 className={styles.recentTitle}>Recently Added</h2>
        {recent.map((t) => (
          <div key={t.id} className={styles.recentItem}>
            <span>
              {t.date} · {t.type} · {t.description}
            </span>
            <span>{formatCurrency(t.amount)}</span>
          </div>
        ))}
      </div>
    </>
  )
}
