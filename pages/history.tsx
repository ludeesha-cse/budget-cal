import Head from 'next/head'
import { useState } from 'react'
import { mockTransactions } from '@/data/mockTransactions'
import styles from '@/styles/History.module.css'

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// In Phase 2, the full transaction list would be fetched from the backend instead of imported:
// fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/transactions`)
//   .then((res) => res.json())
//   .then((data) => setTransactions(data))
const allTransactions = [...mockTransactions].sort((a, b) => (a.date < b.date ? 1 : -1))

export default function History() {
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')

  const filtered = allTransactions.filter((t) => {
    if (fromDate && t.date < fromDate) return false
    if (toDate && t.date > toDate) return false
    return true
  })

  return (
    <>
      <Head>
        <title>Payment History | Budget Calculator</title>
      </Head>
      <h1 className={styles.title}>Payment History</h1>

      <div className={styles.filters}>
        <div className={styles.field}>
          <label htmlFor="fromDate">From</label>
          <input
            id="fromDate"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="toDate">To</label>
          <input
            id="toDate"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        {(fromDate || toDate) && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={() => {
              setFromDate('')
              setToDate('')
            }}
          >
            Clear filter
          </button>
        )}
      </div>

      <div className={styles.tableWrapper}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>No transactions found for the selected date range.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Payment Method</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{t.type}</td>
                  <td>{t.description}</td>
                  <td>{t.paymentMethod}</td>
                  <td>{formatCurrency(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
