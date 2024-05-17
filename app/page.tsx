import type { Metadata } from 'next'
import { mockTransactions, monthlyBudget } from '@/data/mockTransactions'
import styles from '@/styles/Dashboard.module.css'

export const metadata: Metadata = {
  title: 'Dashboard | Budget Calculator',
}

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function isCurrentMonth(dateStr: string) {
  const now = new Date()
  const d = new Date(dateStr)
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

// In Phase 2, this summary would be fetched from the backend instead of computed client-side:
// fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/transactions/summary`)
//   .then((res) => res.json())
//   .then((data) => setSummary(data))
const currentMonthTransactions = mockTransactions.filter((t) => isCurrentMonth(t.date))

export default async function Page() {
  const totalExpenses = currentMonthTransactions.reduce((sum, t) => sum + t.amount, 0)
  const amountLeft = monthlyBudget - totalExpenses
  const isOverBudget = amountLeft < 0

  const totalsByCategory = currentMonthTransactions.reduce<Record<string, number>>((acc, t) => {
    acc[t.type] = (acc[t.type] || 0) + t.amount
    return acc
  }, {})

  return (
    <>
      <h1 className={styles.title}>Dashboard</h1>

      <div className={styles.cards}>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Current Month Expenses</div>
          <div className={styles.cardValue}>{formatCurrency(totalExpenses)}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Budget Allocated</div>
          <div className={styles.cardValue}>{formatCurrency(monthlyBudget)}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Amount Left</div>
          <div className={`${styles.cardValue} ${isOverBudget ? styles.negative : styles.positive}`}>
            {formatCurrency(amountLeft)}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Totals by Category</h2>
        <ul className={styles.categoryList}>
          {Object.entries(totalsByCategory).map(([category, total]) => (
            <li key={category} className={styles.categoryRow}>
              <span className={styles.categoryName}>{category}</span>
              <span className={styles.categoryTotal}>{formatCurrency(total)}</span>
            </li>
          ))}
          {Object.keys(totalsByCategory).length === 0 && (
            <li className={styles.categoryRow}>No transactions this month yet.</li>
          )}
        </ul>
      </div>
    </>
  )
}
