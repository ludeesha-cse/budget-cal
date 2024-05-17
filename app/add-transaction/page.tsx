import type { Metadata } from 'next'
import AddTransactionForm from './AddTransactionForm'
import styles from '@/styles/AddTransaction.module.css'

export const metadata: Metadata = {
  title: 'Add Transaction | Budget Calculator',
}

export default async function Page() {
  return (
    <>
      <h1 className={styles.title}>Add Transaction</h1>
      <AddTransactionForm />
    </>
  )
}
