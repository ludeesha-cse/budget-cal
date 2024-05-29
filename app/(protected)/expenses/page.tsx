import type { Metadata } from 'next'
import { getBaseUrl } from '@/lib/getBaseUrl'
import { serverFetch } from '@/lib/serverFetch'
import type { Transaction } from '@/types/transaction'
import styles from '@/styles/Dashboard.module.css'

export const metadata: Metadata = {
  title: 'Expenses by Type | Budget Calculator',
}

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// next: { revalidate: 300 } — time-based revalidation (ISR-style), the other caching
// option this stage practices alongside the 'no-store' pages. All-time category
// totals don't need to be second-fresh: serving a response that's up to 5 minutes
// stale, then revalidating in the background, trades a small staleness window for far
// fewer DB round trips on a page nothing else here depends on staying instantly current.
async function getTransactions(): Promise<Transaction[]> {
  const res = await serverFetch(`${getBaseUrl()}/api/transactions`, { next: { revalidate: 300 } })

  if (!res.ok) {
    throw new Error('Failed to load transactions')
  }

  return res.json()
}

// No 'use client' — pure read-and-render, so it stays a Server Component by default.
export default async function Page() {
  const transactions = await getTransactions()

  const totalsByCategory = transactions.reduce<Record<string, number>>((acc, t) => {
    acc[t.type] = (acc[t.type] || 0) + t.amount
    return acc
  }, {})

  const grandTotal = Object.values(totalsByCategory).reduce((sum, v) => sum + v, 0)

  return (
    <>
      <h1 className={styles.title}>Expenses by Type</h1>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>All-Time Totals per Category</h2>
        <ul className={styles.categoryList}>
          {Object.entries(totalsByCategory).map(([category, total]) => (
            <li key={category} className={styles.categoryRow}>
              <span className={styles.categoryName}>{category}</span>
              <span className={styles.categoryTotal}>{formatCurrency(total)}</span>
            </li>
          ))}
          <li className={styles.categoryRow}>
            <span className={styles.categoryName}>Total</span>
            <span className={styles.categoryTotal}>{formatCurrency(grandTotal)}</span>
          </li>
        </ul>
      </div>
    </>
  )
}
