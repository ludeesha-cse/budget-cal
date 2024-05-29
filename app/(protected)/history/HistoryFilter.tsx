// Client Component: needs useState for the date inputs; data arrives as a prop, not fetched here.
'use client'

import { useState } from 'react'
import { Transaction } from '@/types/transaction'
import styles from '@/styles/History.module.css'

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

interface HistoryFilterProps {
  transactions: Transaction[]
}

export default function HistoryFilter({ transactions }: HistoryFilterProps) {
  // Controlled inputs: value comes from state, every keystroke updates it via onChange.
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Derived directly from state on each render — no useEffect needed for a plain sync computation.
  const filtered = transactions.filter((t) => {
    if (fromDate && t.date < fromDate) return false
    if (toDate && t.date > toDate) return false
    return true
  })

  return (
    <>
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
