import type { Metadata } from 'next'
import { getBaseUrl } from '@/lib/getBaseUrl'
import { serverFetch } from '@/lib/serverFetch'
import type { Transaction } from '@/types/transaction'
import AddTransactionForm from './AddTransactionForm'
import styles from '@/styles/AddTransaction.module.css'

export const metadata: Metadata = {
  title: 'Add Transaction | Budget Calculator',
}

// cache: 'no-store' — mirrors History: the "Recently Added" list must reflect the
// true current data on load, not a cached snapshot from before the last addition.
async function getRecentTransactions(): Promise<Transaction[]> {
  const res = await serverFetch(`${getBaseUrl()}/api/transactions`, { cache: 'no-store' })

  if (!res.ok) {
    throw new Error('Failed to load recent transactions')
  }

  const transactions: Transaction[] = await res.json()
  return transactions.slice(0, 5)
}

// Thin Server Component shell: fetches the initial "recently added" list server-side
// and hands it to AddTransactionForm as a starting point; all further state (the form
// itself, and appending each newly-created transaction) lives in that Client Component.
export default async function Page() {
  const recentTransactions = await getRecentTransactions()

  return (
    <>
      <h1 className={styles.title}>Add Transaction</h1>
      <AddTransactionForm initialRecentTransactions={recentTransactions} />
    </>
  )
}
