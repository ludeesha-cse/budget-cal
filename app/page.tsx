import type { Metadata } from 'next'
import { getBaseUrl } from '@/lib/getBaseUrl'
import styles from '@/styles/Dashboard.module.css'

export const metadata: Metadata = {
  title: 'Dashboard | Budget Calculator',
}

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

interface SummaryResponse {
  monthlyBudget: number
  totalExpenses: number
  amountLeft: number
  totalsByCategory: Record<string, number>
}

// cache: 'no-store' — budget status must always reflect the latest transaction, even
// one added a second ago, so this fetch is never served from Next's Data Cache. This
// also makes the route dynamic (rendered fresh per request) rather than statically
// prerendered.
async function getSummary(): Promise<SummaryResponse> {
  const res = await fetch(`${getBaseUrl()}/api/transactions/summary`, { cache: 'no-store' })

  if (!res.ok) {
    throw new Error('Failed to load transaction summary')
  }

  return res.json()
}

// async by convention — this Server Component now genuinely awaits a real fetch,
// rather than just computing over an imported array.
export default async function Page() {
  const { monthlyBudget, totalExpenses, amountLeft, totalsByCategory } = await getSummary()
  const isOverBudget = amountLeft < 0

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
