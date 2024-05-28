import type { Metadata } from 'next'
import { getBaseUrl } from '@/lib/getBaseUrl'
import type { Transaction } from '@/types/transaction'
import HistoryFilter from './HistoryFilter'
import styles from '@/styles/History.module.css'

export const metadata: Metadata = {
  title: 'Payment History | Budget Calculator',
}

// cache: 'no-store' — the date-range filter needs to operate on the true current
// transaction list; a stale cached response could hide a transaction added moments
// ago. GET /api/transactions already orders by date desc, so no client-side sort
// is needed here.
async function getTransactions(): Promise<Transaction[]> {
  const res = await fetch(`${getBaseUrl()}/api/transactions`, { cache: 'no-store' })

  if (!res.ok) {
    throw new Error('Failed to load transactions')
  }

  return res.json()
}

// Server Component: owns the data (fetches the transaction list server-side), then
// hands it to HistoryFilter (Client Component) as a prop for the interactive filtering.
export default async function Page() {
  const transactions = await getTransactions()

  return (
    <>
      <h1 className={styles.title}>Payment History</h1>
      <HistoryFilter transactions={transactions} />
    </>
  )
}
