'use client'

import { useState } from 'react'
import { mockTransactions } from '@/data/mockTransactions'
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

export default function AddTransactionForm() {
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showSuccess, setShowSuccess] = useState(false)

  function handleChange<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const newTransaction: Transaction = {
      id: Date.now(),
      date: form.date,
      amount: Number(form.amount),
      type: form.type,
      description: form.description,
      paymentMethod: form.paymentMethod,
    }

    // Phase 2 TODO: POST this payload to /api/transactions
    console.log(newTransaction)

    setTransactions((prev) => [newTransaction, ...prev])
    setForm(emptyForm)
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 3000)
  }

  const recent = transactions.slice(0, 5)

  return (
    <>
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

        <button type="submit" className={styles.submitButton}>
          Add Transaction
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
