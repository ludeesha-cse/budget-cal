import Head from 'next/head'
import { mockTransactions } from '@/data/mockTransactions'
import styles from '@/styles/Dashboard.module.css'

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function Expenses() {
  const totalsByCategory = mockTransactions.reduce<Record<string, number>>((acc, t) => {
    acc[t.type] = (acc[t.type] || 0) + t.amount
    return acc
  }, {})

  const grandTotal = Object.values(totalsByCategory).reduce((sum, v) => sum + v, 0)

  return (
    <>
      <Head>
        <title>Expenses by Type | Budget Calculator</title>
      </Head>
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
