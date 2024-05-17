import type { Metadata } from 'next'
import { mockTransactions } from '@/data/mockTransactions'
import HistoryFilter from './HistoryFilter'
import styles from '@/styles/History.module.css'

export const metadata: Metadata = {
  title: 'Payment History | Budget Calculator',
}

// In Phase 2, the full transaction list would be fetched from the backend instead of imported:
// fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/transactions`)
//   .then((res) => res.json())
//   .then((data) => setTransactions(data))
const allTransactions = [...mockTransactions].sort((a, b) => (a.date < b.date ? 1 : -1))

export default async function Page() {
  return (
    <>
      <h1 className={styles.title}>Payment History</h1>
      <HistoryFilter transactions={allTransactions} />
    </>
  )
}
